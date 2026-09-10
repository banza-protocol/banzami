package service

// The Business application lifecycle, against a real database: approval
// provisions exactly one Business however it is pressed, never classifies the
// account from what the applicant said, and never takes a handle a Business
// already owns; an existing Business is LINKED, never recreated.

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type lifecycleFixture struct {
	ctx   context.Context
	pool  *pgxpool.Pool
	t     *testing.T
	clean []func()
}

func newLifecycle(t *testing.T) *lifecycleFixture {
	ctx := context.Background()
	pool := appAdminPoolOrSkip(ctx, t)
	f := &lifecycleFixture{ctx: ctx, pool: pool, t: t}
	t.Cleanup(func() {
		for i := len(f.clean) - 1; i >= 0; i-- {
			f.clean[i]()
		}
		pool.Close()
	})
	return f
}

func (f *lifecycleFixture) exec(sql string, args ...any) {
	f.t.Helper()
	if _, err := f.pool.Exec(f.ctx, sql, args...); err != nil {
		f.t.Fatalf("%s: %v", strings.Fields(sql)[0], err)
	}
}

func hex10() string { return strings.ReplaceAll(uuid.NewString(), "-", "")[:10] }

// application seeds a SUBMITTED application holding its handle.
func (f *lifecycleFixture) application(accountType string) (appID, handle, email string) {
	appID, handle = uuid.NewString(), "lc"+hex10()
	email = handle + "@example.test"
	f.exec(`INSERT INTO handle_registry (handle, owner_type, owner_id, reserved_until) VALUES ($1,'APPLICATION',$2, now()+interval '1 day')`, handle, appID)
	f.exec(`INSERT INTO merchant_applications (origin, id, status, environment, desired_handle, business_name, email, business_account_type, terms_accepted_at)
	        VALUES ('STANDALONE_BUSINESS',$1,'SUBMITTED','SANDBOX',$2,'Loja Ciclo',$3,NULLIF($4,''),now())`, appID, handle, email, accountType)
	f.clean = append(f.clean, func() {
		ctx := context.Background()
		var m string
		_ = f.pool.QueryRow(ctx, `SELECT COALESCE(created_merchant_id::text,'') FROM merchant_applications WHERE id=$1`, appID).Scan(&m)
		_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE merchant_id::text=$1`, m)
		_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_application_documents WHERE application_id=$1`, appID)
		_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_applications WHERE id=$1`, appID)
		_, _ = f.pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle=$1 AND owner_type IN ('APPLICATION','MERCHANT') AND owner_id::text IN ($2,$3)`, handle, appID, m)
		if m != "" {
			_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_activation_tokens WHERE merchant_id::text=$1`, m)
			_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_app_credentials WHERE merchant_id::text=$1`, m)
			_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_profiles WHERE merchant_id::text=$1`, m)
		}
	})
	return
}

// business seeds an existing ACTIVE Business owning a handle.
func (f *lifecycleFixture) business() (merchantID, handle string) {
	merchantID, handle = uuid.NewString(), "lb"+hex10()
	f.exec(`INSERT INTO merchants (id, name, email, status) VALUES ($1,'Negócio Existente',$2,'ACTIVE')`, merchantID, handle+"@example.test")
	f.exec(`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`, handle, merchantID)
	f.clean = append(f.clean, func() {
		ctx := context.Background()
		_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE merchant_id=$1`, merchantID)
		_, _ = f.pool.Exec(ctx, `DELETE FROM handle_registry WHERE handle=$1`, handle)
	})
	return
}

func (f *lifecycleFixture) provisioner() *fakeProvisioner {
	return &fakeProvisioner{createMerchantHook: func() (string, error) {
		id := uuid.NewString()
		if _, err := f.pool.Exec(f.ctx, `INSERT INTO merchants (id, name, email, status) VALUES ($1,'Loja Ciclo',$2,'ACTIVE')`, id, id+"@example.test"); err != nil {
			return "", err
		}
		return id, nil
	}}
}

type recordingProvisioner struct {
	*fakeProvisioner
	mu        sync.Mutex
	typesSeen []string
	// delay stands in for a real core round trip. Without it a fake is so fast
	// that concurrent approvals finish one by one by accident, and a test of
	// the lock passes with the lock removed.
	delay time.Duration
}

func (r *recordingProvisioner) CreateMerchant(ctx context.Context, name, email, typ string) (string, error) {
	r.mu.Lock()
	r.typesSeen = append(r.typesSeen, typ)
	hook := r.fakeProvisioner.createMerchantHook
	r.mu.Unlock()
	time.Sleep(r.delay)
	return hook()
}

func TestApprove_NeverClassifiesFromTheApplicationAndAssignsTheDefaultPrice(t *testing.T) {
	f := newLifecycle(t)
	appID, _, _ := f.application("APPLICATION") // what an applicant could once send
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	prov := &recordingProvisioner{fakeProvisioner: f.provisioner()}
	svc := NewPostgresMerchantApplicationAdminService(f.pool, prov)
	if _, err := svc.Approve(f.ctx, appID, "operator", time.Hour); err != nil {
		t.Fatal(err)
	}
	if len(prov.typesSeen) != 1 || prov.typesSeen[0] != "" {
		t.Fatalf("merchant created with class %q — approval must create the default type", prov.typesSeen)
	}
	if prov.assignPricing != 1 || prov.lastProfile != "sandbox-default" {
		t.Fatalf("pricing assigned %d times with %q, want sandbox-default", prov.assignPricing, prov.lastProfile)
	}
	var res string
	_ = f.pool.QueryRow(f.ctx, `SELECT resolution FROM merchant_applications WHERE id=$1`, appID).Scan(&res)
	if res != "PROVISIONED_NEW" {
		t.Fatalf("resolution %q", res)
	}
}

func TestApprove_RefusesWithoutTheDocumentsAndChangesNothing(t *testing.T) {
	f := newLifecycle(t)
	appID, _, _ := f.application("")
	prov := f.provisioner()
	svc := NewPostgresMerchantApplicationAdminService(f.pool, prov)
	_, err := svc.Approve(f.ctx, appID, "operator", time.Hour)
	if !errors.Is(err, ErrRequiredDocumentsMissing) {
		t.Fatalf("err = %v", err)
	}
	var status string
	_ = f.pool.QueryRow(f.ctx, `SELECT status FROM merchant_applications WHERE id=$1`, appID).Scan(&status)
	if status != "SUBMITTED" || prov.createMerchant != 0 {
		t.Fatalf("status %s, merchants created %d", status, prov.createMerchant)
	}
}

func TestApprove_PressedTwiceTogetherProvisionsOneBusiness(t *testing.T) {
	f := newLifecycle(t)
	appID, _, _ := f.application("")
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	prov := &recordingProvisioner{fakeProvisioner: f.provisioner(), delay: 150 * time.Millisecond}
	// A pool of its own, sized for the race. The default is max(4, NumCPU): on
	// a 4-CPU CI runner the warm-up below waited forever for an 8th connection,
	// and four approvals holding four connections left none for anything else.
	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns = 16
	racePool, err := pgxpool.NewWithConfig(f.ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer racePool.Close()
	svc := NewPostgresMerchantApplicationAdminService(racePool, prov)
	// Warm the pool so every approval has its own connection from the start.
	var conns []*pgxpool.Conn
	for i := 0; i < 8; i++ {
		c, err := racePool.Acquire(f.ctx)
		if err != nil {
			t.Fatal(err)
		}
		conns = append(conns, c)
	}
	for _, c := range conns {
		c.Release()
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	results := make([]ApprovalResult, 4)
	errs := make([]error, 4)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], errs[i] = svc.Approve(f.ctx, appID, "operator", time.Hour)
		}(i)
	}
	close(start)
	wg.Wait()
	fresh, already := 0, 0
	for i, e := range errs {
		if e != nil {
			t.Fatalf("approval %d: %v", i, e)
		}
		if results[i].AlreadyApproved {
			already++
		} else {
			fresh++
		}
	}
	if fresh != 1 || already != 3 || len(prov.typesSeen) != 1 {
		t.Fatalf("fresh=%d already=%d merchants=%d — one Business, however it is pressed", fresh, already, len(prov.typesSeen))
	}
}

func TestApprove_RefusesAHandleABusinessAlreadyOwns(t *testing.T) {
	f := newLifecycle(t)
	appID, handle, _ := f.application("")
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	other, _ := f.business()
	// The hold lapsed and an existing Business holds the handle now.
	f.exec(`UPDATE handle_registry SET owner_type='MERCHANT', owner_id=$2 WHERE handle=$1`, handle, other)
	prov := f.provisioner()
	svc := NewPostgresMerchantApplicationAdminService(f.pool, prov)
	if _, err := svc.Approve(f.ctx, appID, "operator", time.Hour); !errors.Is(err, ErrHandleOwnedByBusiness) {
		t.Fatalf("err = %v", err)
	}
	if prov.createMerchant != 0 {
		t.Fatal("a second owner was provisioned for a handle a Business owns")
	}
}

func TestLinkExisting_AttachesTheApplicationAndCreatesNothing(t *testing.T) {
	f := newLifecycle(t)
	merchantID, handle := f.business()
	appID := uuid.NewString()
	f.exec(`INSERT INTO merchant_applications (origin, id, status, environment, desired_handle, business_name, email, claims_existing_business, terms_accepted_at)
	        VALUES ('STANDALONE_BUSINESS',$1,'SUBMITTED','SANDBOX',$2,'Negócio Existente',$3,true,now())`, appID, handle, handle+"@example.test")
	f.clean = append(f.clean, func() {
		_, _ = f.pool.Exec(context.Background(), `DELETE FROM merchant_application_documents WHERE application_id=$1`, appID)
		_, _ = f.pool.Exec(context.Background(), `DELETE FROM merchant_applications WHERE id=$1`, appID)
	})
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	prov := f.provisioner()
	svc := NewPostgresMerchantApplicationAdminService(f.pool, prov)

	// Provisioning a new one is refused outright.
	if _, err := svc.Approve(f.ctx, appID, "operator", time.Hour); !errors.Is(err, ErrClaimsExistingBusiness) {
		t.Fatalf("approve: %v", err)
	}
	// The link needs a reason, the right Business, and its handle typed.
	if _, err := svc.LinkExisting(f.ctx, appID, merchantID, "@"+handle, "operator", " "); !errors.Is(err, ErrLinkReasonRequired) {
		t.Fatalf("no reason: %v", err)
	}
	if _, err := svc.LinkExisting(f.ctx, appID, merchantID, "@wrong", "operator", "verified registration"); !errors.Is(err, ErrLinkConfirmationMismatch) {
		t.Fatalf("mismatch: %v", err)
	}
	stranger, strangerHandle := f.business()
	if _, err := svc.LinkExisting(f.ctx, appID, stranger, "@"+strangerHandle, "operator", "verified"); !errors.Is(err, ErrLinkTargetInvalid) {
		t.Fatalf("a Business that does not own the requested handle was accepted: %v", err)
	}

	res, err := svc.LinkExisting(f.ctx, appID, merchantID, "@"+handle, "operator", "verified the company registration")
	if err != nil || res.MerchantID != merchantID {
		t.Fatalf("link: %+v %v", res, err)
	}
	if prov.createMerchant != 0 || prov.createWallet != 0 || prov.createApiKey != 0 || prov.approveCompliance != 1 {
		t.Fatalf("linking provisioned something: %+v", prov)
	}
	var status, resolution, owner string
	_ = f.pool.QueryRow(f.ctx, `SELECT status, resolution FROM merchant_applications WHERE id=$1`, appID).Scan(&status, &resolution)
	_ = f.pool.QueryRow(f.ctx, `SELECT owner_id::text FROM handle_registry WHERE handle=$1`, handle).Scan(&owner)
	if status != "APPROVED" || resolution != "LINKED_EXISTING" || owner != merchantID {
		t.Fatalf("status=%s resolution=%s handle owner=%s", status, resolution, owner)
	}
	again, err := svc.LinkExisting(f.ctx, appID, merchantID, "@"+handle, "operator", "again")
	if err != nil || !again.AlreadyLinked {
		t.Fatalf("relink is not idempotent: %+v %v", again, err)
	}
}

func TestLinkExisting_ReassociatesAnApprovalWhoseHandleMoved(t *testing.T) {
	f := newLifecycle(t)
	appID, handle, _ := f.application("")
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	svc := NewPostgresMerchantApplicationAdminService(f.pool, f.provisioner())
	first, err := svc.Approve(f.ctx, appID, "operator", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	// The handle is consolidated onto another (canonical) Business.
	canonical, _ := f.business()
	f.exec(`UPDATE handle_registry SET owner_id=$2 WHERE handle=$1`, handle, canonical)
	res, err := svc.LinkExisting(f.ctx, appID, canonical, "@"+handle, "operator", "handle consolidated onto the canonical owner")
	if err != nil || res.MerchantID != canonical || res.MerchantID == first.MerchantID {
		t.Fatalf("re-link: %+v %v", res, err)
	}
}

func TestReject_AFailedProvisioningThatCreatedNothing(t *testing.T) {
	f := newLifecycle(t)
	appID, handle, _ := f.application("")
	f.exec(`UPDATE merchant_applications SET status='PROVISIONING_FAILED' WHERE id=$1`, appID)
	svc := NewPostgresMerchantApplicationAdminService(f.pool, f.provisioner())
	if _, err := svc.Reject(f.ctx, appID, "operator", "notes", "msg"); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM handle_registry WHERE handle=$1`, handle).Scan(&n)
	if n != 0 {
		t.Fatal("the rejected application's hold was not released")
	}
}

func TestSubmit_ExistingBusinessHoldsNothingAndReplaysByKey(t *testing.T) {
	f := newLifecycle(t)
	_, handle := f.business()
	apps := NewPostgresMerchantApplicationService(f.pool)
	in := MerchantApplicationInput{Environment: "SANDBOX", DesiredHandle: handle, BusinessName: "Negócio Existente",
		Email: "x@example.test", TermsAccepted: true, ExistingBusiness: true, IdempotencyKey: uuid.NewString(),
		Origin: ApplicationOriginStandalone}
	id1, err := apps.Submit(f.ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	id2, err := apps.Submit(f.ctx, in)
	if err != nil || id2 != id1 {
		t.Fatalf("a resubmission with the same key made %q (want %q): %v", id2, id1, err)
	}
	f.clean = append(f.clean, func() {
		_, _ = f.pool.Exec(context.Background(), `DELETE FROM merchant_applications WHERE id=$1`, id1)
	})
	var ownerType string
	_ = f.pool.QueryRow(f.ctx, `SELECT owner_type FROM handle_registry WHERE handle=$1`, handle).Scan(&ownerType)
	if ownerType != "MERCHANT" {
		t.Fatalf("the Business's handle became %s", ownerType)
	}
	// A handle no Business uses cannot be claimed as existing.
	in.DesiredHandle, in.IdempotencyKey = "lf"+hex10(), ""
	if _, err := apps.Submit(f.ctx, in); !errors.Is(err, ErrExistingBusinessNotFound) {
		t.Fatalf("claim on an unused handle: %v", err)
	}
}

func TestReissueActivation_LeavesOnlyTheNewestLinkUsable(t *testing.T) {
	f := newLifecycle(t)
	appID, _, _ := f.application("")
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	svc := NewPostgresMerchantApplicationAdminService(f.pool, f.provisioner())
	first, err := svc.Approve(f.ctx, appID, "operator", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	re, err := svc.ReissueActivation(f.ctx, appID, time.Hour)
	if err != nil || re.ActivationToken == "" || re.ActivationToken == first.ActivationToken {
		t.Fatalf("reissue: %v", err)
	}
	var live int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM merchant_activation_tokens WHERE merchant_id=$1 AND used_at IS NULL AND expires_at > now()`, first.MerchantID).Scan(&live)
	if live != 1 {
		t.Fatalf("%d usable activation links, want 1", live)
	}
}

// An application says where it came from, and a Project's application names
// its Project; a Project has at most one application in progress; and nothing
// is assumed to be the public form.
func TestSubmit_OriginIsExplicitAndAProjectHasOneApplicationInProgress(t *testing.T) {
	f := newLifecycle(t)
	apps := NewPostgresMerchantApplicationService(f.pool)
	project := uuid.NewString()
	base := func(handle string) MerchantApplicationInput {
		return MerchantApplicationInput{Environment: "SANDBOX", DesiredHandle: handle, BusinessName: "Projeto Lda",
			Email: handle + "@example.test", TermsAccepted: true}
	}
	var created []string
	t.Cleanup(func() {
		for _, id := range created {
			_, _ = f.pool.Exec(f.ctx, `DELETE FROM handle_registry WHERE owner_type='APPLICATION' AND owner_id=$1`, id)
			_, _ = f.pool.Exec(f.ctx, `DELETE FROM merchant_applications WHERE id=$1`, id)
		}
	})

	for name, in := range map[string]MerchantApplicationInput{
		"no origin": base("o" + hex10()),
		"a public application with a Project": func() MerchantApplicationInput {
			i := base("o" + hex10())
			i.Origin = ApplicationOriginStandalone
			i.ProjectID = project
			return i
		}(),
		"a Project application without one": func() MerchantApplicationInput {
			i := base("o" + hex10())
			i.Origin = ApplicationOriginDeveloperProject
			return i
		}(),
		"a Project claiming an existing Business by handle": func() MerchantApplicationInput {
			i := base("o" + hex10())
			i.Origin = ApplicationOriginDeveloperProject
			i.ProjectID = project
			i.ExistingBusiness = true
			return i
		}(),
	} {
		if _, err := apps.Submit(f.ctx, in); !errors.Is(err, ErrApplicationOrigin) {
			t.Fatalf("%s: %v", name, err)
		}
	}

	in := base("p" + hex10())
	in.Origin, in.ProjectID, in.SubmittedByUserID = ApplicationOriginDeveloperProject, project, uuid.NewString()
	id, err := apps.Submit(f.ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	created = append(created, id)
	var origin, proj string
	_ = f.pool.QueryRow(f.ctx, `SELECT origin, project_id::text FROM merchant_applications WHERE id=$1`, id).Scan(&origin, &proj)
	if origin != ApplicationOriginDeveloperProject || proj != project {
		t.Fatalf("stored origin %q project %q", origin, proj)
	}

	second := base("p" + hex10())
	second.Origin, second.ProjectID = ApplicationOriginDeveloperProject, project
	if id2, err := apps.Submit(f.ctx, second); !errors.Is(err, ErrProjectHasOpenApplication) {
		created = append(created, id2)
		t.Fatalf("a second open application for one Project: %v", err)
	}
	// The refused one took no handle.
	var held int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM handle_registry WHERE handle=$1`, second.DesiredHandle).Scan(&held)
	if held != 0 {
		t.Fatal("a refused application kept its handle hold")
	}
}
