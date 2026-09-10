package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// A Business's consent to a Project: issued from its own session, spendable
// once, by one Project, for ten minutes; a wrong code says nothing about any
// Business; and nothing a person could type instead of the code — the
// handle, an id — gets a Project anywhere.

type linkFixture struct {
	*lifecycleFixture
	merchant, handle, wallet, account string
}

func newLinkFixture(t *testing.T) *linkFixture {
	f := &linkFixture{lifecycleFixture: newLifecycle(t)}
	var reg *string
	_ = f.pool.QueryRow(f.ctx, `SELECT to_regclass('public.business_link_codes')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("business_link_codes not migrated — skipping")
	}
	f.merchant, f.handle = f.business()
	f.wallet, f.account = uuid.NewString(), uuid.NewString()
	var avail, reserved string
	_ = f.pool.QueryRow(f.ctx, `INSERT INTO ledger_accounts (account_type, name, currency) VALUES ('LIABILITY','a','AOA') RETURNING id::text`).Scan(&avail)
	_ = f.pool.QueryRow(f.ctx, `INSERT INTO ledger_accounts (account_type, name, currency) VALUES ('LIABILITY','r','AOA') RETURNING id::text`).Scan(&reserved)
	f.exec(`INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)`,
		f.wallet, f.merchant, avail, reserved)
	// The wallet's PRIMARY account is created with it (the database does it).
	if err := f.pool.QueryRow(f.ctx, `SELECT id::text FROM wallet_accounts WHERE wallet_id=$1 AND purpose='PRIMARY'`, f.wallet).Scan(&f.account); err != nil {
		t.Fatalf("primary account: %v", err)
	}
	f.exec(`INSERT INTO merchant_compliance (merchant_id, kyb_status, aml_status) VALUES ($1,'APPROVED','APPROVED')`, f.merchant)
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = f.pool.Exec(ctx, `DELETE FROM business_link_codes WHERE merchant_id=$1`, f.merchant)
		_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_compliance WHERE merchant_id=$1`, f.merchant)
		_, _ = f.pool.Exec(ctx, `DELETE FROM wallet_accounts WHERE wallet_id=$1`, f.wallet)
		_, _ = f.pool.Exec(ctx, `DELETE FROM wallets WHERE id=$1`, f.wallet)
	})
	return f
}

func TestLinkCode_RedeemsOnceForOneProjectAndNamesTheBusiness(t *testing.T) {
	f := newLinkFixture(t)
	svc := NewPostgresBusinessLinkCodeService(f.pool)
	issued, err := svc.Issue(f.ctx, f.merchant, "SANDBOX")
	if err != nil {
		t.Fatal(err)
	}
	if len(strings.ReplaceAll(issued.Code, "-", "")) != businessLinkCodeLength || strings.ContainsAny(issued.Code, "01IOL") {
		t.Fatalf("code %q", issued.Code)
	}
	project := uuid.NewString()
	target, err := svc.Redeem(f.ctx, strings.ToLower(issued.Code), project) // typed in lower case, with dashes
	if err != nil {
		t.Fatal(err)
	}
	if target.MerchantID != f.merchant || target.WalletID != f.wallet || target.WalletAccountID != f.account ||
		target.Handle != f.handle || target.KybStatus != "APPROVED" {
		t.Fatalf("target %+v", target)
	}
	// The same Project again (a retried request) gets the same answer.
	if again, err := svc.Redeem(f.ctx, issued.Code, project); err != nil || again.MerchantID != f.merchant {
		t.Fatalf("retry by the same Project: %v", err)
	}
	// Any other Project gets nothing.
	if _, err := svc.Redeem(f.ctx, issued.Code, uuid.NewString()); !errors.Is(err, ErrLinkCodeInvalid) {
		t.Fatalf("a second Project spent a used code: %v", err)
	}
	var stored int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM business_link_codes WHERE code_hash = $1`, issued.Code).Scan(&stored)
	if stored != 0 {
		t.Fatal("a raw code was stored")
	}
}

func TestLinkCode_ExpiresAndIsReplacedByTheNextOne(t *testing.T) {
	f := newLinkFixture(t)
	svc := NewPostgresBusinessLinkCodeService(f.pool)
	first, _ := svc.Issue(f.ctx, f.merchant, "SANDBOX")
	second, _ := svc.Issue(f.ctx, f.merchant, "SANDBOX")
	if _, err := svc.Redeem(f.ctx, first.Code, uuid.NewString()); !errors.Is(err, ErrLinkCodeInvalid) {
		t.Fatalf("an earlier code survived a new one: %v", err)
	}
	svc.now = func() time.Time { return time.Now().Add(businessLinkCodeTTL + time.Second) }
	if _, err := svc.Redeem(f.ctx, second.Code, uuid.NewString()); !errors.Is(err, ErrLinkCodeInvalid) {
		t.Fatalf("an expired code redeemed: %v", err)
	}
}

func TestLinkCode_WhatAPersonMightTypeInsteadProvesNothing(t *testing.T) {
	f := newLinkFixture(t)
	svc := NewPostgresBusinessLinkCodeService(f.pool)
	_, _ = svc.Issue(f.ctx, f.merchant, "SANDBOX")
	for _, guess := range []string{f.handle, "@" + f.handle, f.merchant, f.wallet, "", "AAAA-AAAA-AAAA"} {
		if _, err := svc.Redeem(f.ctx, guess, uuid.NewString()); !errors.Is(err, ErrLinkCodeInvalid) {
			t.Fatalf("%q redeemed: %v", guess, err)
		}
	}
}

func TestLinkCode_ConcurrentRedemptionsByTwoProjectsBindOne(t *testing.T) {
	f := newLinkFixture(t)
	svc := NewPostgresBusinessLinkCodeService(f.pool)
	issued, _ := svc.Issue(f.ctx, f.merchant, "SANDBOX")
	var wg sync.WaitGroup
	var mu sync.Mutex
	winners := 0
	start := make(chan struct{})
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, err := svc.Redeem(f.ctx, issued.Code, uuid.NewString()); err == nil {
				mu.Lock()
				winners++
				mu.Unlock()
			}
		}()
	}
	close(start)
	wg.Wait()
	if winners != 1 {
		t.Fatalf("%d Projects redeemed one consent", winners)
	}
}

func TestLinkCode_ABusinessThatCannotReceiveIsNotConnectable(t *testing.T) {
	f := newLinkFixture(t)
	svc := NewPostgresBusinessLinkCodeService(f.pool)
	issued, _ := svc.Issue(f.ctx, f.merchant, "SANDBOX")
	f.exec(`UPDATE merchants SET status='SUSPENDED' WHERE id=$1`, f.merchant)
	if _, err := svc.Redeem(f.ctx, issued.Code, uuid.NewString()); !errors.Is(err, ErrLinkBusinessNotReady) {
		t.Fatalf("a suspended Business connected: %v", err)
	}
	f.exec(`UPDATE merchants SET status='ACTIVE' WHERE id=$1`, f.merchant)
}

// ── approval binds the Project that asked ────────────────────────────────────

type recordingBinder struct {
	mu    sync.Mutex
	calls int
	err   error
	last  []string
}

func (b *recordingBinder) BindProject(_ context.Context, projectID, merchantID, walletID, accountID, actor string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.calls++
	b.last = []string{projectID, merchantID, walletID, accountID, actor}
	return b.err
}

func TestApprove_BindsTheProjectThatAskedAndRetriesWhenBindingFailed(t *testing.T) {
	f := newLifecycle(t)
	appID, _, _ := f.application("")
	project, actor := uuid.NewString(), uuid.NewString()
	f.exec(`UPDATE merchant_applications SET origin='DEVELOPER_PROJECT', project_id=$2, submitted_by_user_id=$3 WHERE id=$1`, appID, project, actor)
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	prov := f.provisioner()
	prov.walletForMerchant = func(merchantID string) (string, error) {
		w := uuid.NewString()
		var avail, reserved string
		_ = f.pool.QueryRow(f.ctx, `INSERT INTO ledger_accounts (account_type, name, currency) VALUES ('LIABILITY','a','AOA') RETURNING id::text`).Scan(&avail)
		_ = f.pool.QueryRow(f.ctx, `INSERT INTO ledger_accounts (account_type, name, currency) VALUES ('LIABILITY','r','AOA') RETURNING id::text`).Scan(&reserved)
		if _, err := f.pool.Exec(f.ctx, `INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)`, w, merchantID, avail, reserved); err != nil {
			return "", err
		}
		return w, nil
	}
	binder := &recordingBinder{err: errors.New("developer-api down")}
	svc := NewPostgresMerchantApplicationAdminService(f.pool, prov)
	svc.SetProjectBinder(binder)

	res, err := svc.Approve(f.ctx, appID, "operator", time.Hour)
	if err != nil {
		t.Fatalf("a failed binding must not fail the approval: %v", err)
	}
	if res.ProjectBinding != "PENDING" || binder.calls != 1 {
		t.Fatalf("binding %q after %d calls", res.ProjectBinding, binder.calls)
	}
	var status string
	_ = f.pool.QueryRow(f.ctx, `SELECT status FROM merchant_applications WHERE id=$1`, appID).Scan(&status)
	if status != "APPROVED" {
		t.Fatalf("the Business is real either way; status %s", status)
	}

	binder.err = nil
	res, err = svc.Approve(f.ctx, appID, "operator", time.Hour)
	if err != nil || !res.AlreadyApproved || res.ProjectBinding != "BOUND" {
		t.Fatalf("approving again retries the binding: %+v %v", res, err)
	}
	if binder.last[0] != project || binder.last[1] != res.MerchantID || binder.last[4] != actor {
		t.Fatalf("bound %v", binder.last)
	}
	res, _ = svc.Approve(f.ctx, appID, "operator", time.Hour)
	if res.ProjectBinding != "BOUND" || binder.calls != 2 {
		t.Fatalf("a bound Project was bound again (%d calls)", binder.calls)
	}
}
