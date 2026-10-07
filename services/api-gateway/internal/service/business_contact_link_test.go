package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// Business verified contacts + the two OTP purposes (ADR-060, Path B). A contact
// is proven only by returning a code sent to it; a link uses that verified
// contact, never a supplied address; and the two purposes never cross.

type contactFixture struct {
	*lifecycleFixture
	svc      *BusinessContactService
	merchant string
	handle   string
}

func newContactFixture(t *testing.T) *contactFixture {
	f := &contactFixture{lifecycleFixture: newLifecycle(t)}
	var reg *string
	_ = f.pool.QueryRow(f.ctx, `SELECT to_regclass('public.business_contacts')::text`).Scan(&reg)
	if reg == nil {
		t.Skip("business_contacts not migrated — skipping")
	}
	f.svc = NewBusinessContactService(f.pool, "test-pepper-0175", "SANDBOX")
	if f.svc == nil {
		t.Fatal("service nil with a pepper and SANDBOX env")
	}
	f.merchant, f.handle = f.business()
	// A linkable Business needs an ACTIVE AOA wallet with a PRIMARY account + KYB.
	var avail, reserved, wallet string
	_ = f.pool.QueryRow(f.ctx, `INSERT INTO ledger_accounts (account_type, name, currency) VALUES ('LIABILITY','a','AOA') RETURNING id::text`).Scan(&avail)
	_ = f.pool.QueryRow(f.ctx, `INSERT INTO ledger_accounts (account_type, name, currency) VALUES ('LIABILITY','r','AOA') RETURNING id::text`).Scan(&reserved)
	wallet = uuid.NewString()
	f.exec(`INSERT INTO wallets (id, merchant_id, currency, status, available_account_id, reserved_account_id) VALUES ($1,$2,'AOA','ACTIVE',$3,$4)`, wallet, f.merchant, avail, reserved)
	f.exec(`INSERT INTO merchant_compliance (merchant_id, kyb_status, aml_status) VALUES ($1,'APPROVED','APPROVED')`, f.merchant)
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = f.pool.Exec(ctx, `DELETE FROM business_link_grants WHERE subject_id=$1 OR merchant_id=$1`, f.merchant)
		_, _ = f.pool.Exec(ctx, `DELETE FROM business_contact_otps WHERE subject_id=$1`, f.merchant)
		_, _ = f.pool.Exec(ctx, `DELETE FROM business_contacts WHERE merchant_id=$1`, f.merchant)
		_, _ = f.pool.Exec(ctx, `DELETE FROM merchant_compliance WHERE merchant_id=$1`, f.merchant)
		_, _ = f.pool.Exec(ctx, `DELETE FROM wallet_accounts WHERE wallet_id=$1`, wallet)
		_, _ = f.pool.Exec(ctx, `DELETE FROM wallets WHERE id=$1`, wallet)
	})
	return f
}

// A + persist: verifying a contact code records the Business's primary verified
// email; a masked form is all that is returned.
func TestBusinessContact_VerifyAndPersist(t *testing.T) {
	f := newContactFixture(t)
	code, masked, err := f.svc.StartContactVerify(f.ctx, f.merchant, "Dono@Example.com", "1.2.3.4")
	if err != nil {
		t.Fatal(err)
	}
	if masked != "d••••@example.com" {
		t.Fatalf("masked %q", masked)
	}
	grant, email, err := f.svc.ConfirmContactVerify(f.ctx, f.merchant, code)
	if err != nil || grant == "" || email != "dono@example.com" {
		t.Fatalf("confirm: %v grant=%q email=%q", err, grant, email)
	}
	if _, err := f.svc.PersistVerifiedContact(f.ctx, grant, f.merchant); err != nil {
		t.Fatalf("persist: %v", err)
	}
	gotEmail, gotMask, ok, err := f.svc.VerifiedContactFor(f.ctx, f.merchant)
	if err != nil || !ok || gotEmail != "dono@example.com" || gotMask != "d••••@example.com" {
		t.Fatalf("verified contact: %v ok=%v email=%q", err, ok, gotEmail)
	}
	// The grant is single-use.
	if _, err := f.svc.PersistVerifiedContact(f.ctx, grant, f.merchant); !errors.Is(err, ErrBusinessLinkGrantInvalid) {
		t.Fatalf("a spent CONTACT_VERIFIED grant was reused: %v", err)
	}
}

// B: a wrong code never verifies and never issues a grant; a raw code is not
// stored.
func TestBusinessContact_WrongCode(t *testing.T) {
	f := newContactFixture(t)
	code, _, err := f.svc.StartContactVerify(f.ctx, f.merchant, "dono@example.com", "")
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000000"
	if wrong == code {
		wrong = "111111"
	}
	if _, _, err := f.svc.ConfirmContactVerify(f.ctx, f.merchant, wrong); !errors.Is(err, ErrBusinessContactInvalid) {
		t.Fatalf("a wrong code was accepted: %v", err)
	}
	if _, _, _, ok, _ := verifiedTriple(f); ok {
		t.Fatal("a contact was verified by a wrong code")
	}
	var stored int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM business_contact_otps WHERE code_hash = $1`, code).Scan(&stored)
	if stored != 0 {
		t.Fatal("a raw code was stored")
	}
}

func verifiedTriple(f *contactFixture) (string, string, string, bool, error) {
	e, m, ok, err := f.svc.VerifiedContactFor(f.ctx, f.merchant)
	return f.merchant, e, m, ok, err
}

// K: an OTP cannot be replayed once consumed.
func TestBusinessContact_OtpReplayRejected(t *testing.T) {
	f := newContactFixture(t)
	code, _, _ := f.svc.StartContactVerify(f.ctx, f.merchant, "dono@example.com", "")
	if _, _, err := f.svc.ConfirmContactVerify(f.ctx, f.merchant, code); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.svc.ConfirmContactVerify(f.ctx, f.merchant, code); !errors.Is(err, ErrBusinessContactInvalid) {
		t.Fatalf("a consumed OTP was replayed: %v", err)
	}
}

// F: Path B sends to the stored verified contact and links the Business.
func TestBusinessContact_ProjectLinkUsesVerifiedContact(t *testing.T) {
	f := newContactFixture(t)
	// Enrol a verified contact first.
	code, _, _ := f.svc.StartContactVerify(f.ctx, f.merchant, "dono@example.com", "")
	grant, _, _ := f.svc.ConfirmContactVerify(f.ctx, f.merchant, code)
	if _, err := f.svc.PersistVerifiedContact(f.ctx, grant, f.merchant); err != nil {
		t.Fatal(err)
	}

	project := uuid.NewString()
	lcode, masked, err := f.svc.StartProjectLink(f.ctx, f.merchant, project, "")
	if err != nil || masked != "d••••@example.com" {
		t.Fatalf("start link: %v masked=%q", err, masked)
	}
	lgrant, err := f.svc.ConfirmProjectLink(f.ctx, f.merchant, project, lcode)
	if err != nil {
		t.Fatalf("confirm link: %v", err)
	}
	target, err := f.svc.RedeemProjectLinkGrant(f.ctx, lgrant, project)
	if err != nil {
		t.Fatalf("redeem: %v", err)
	}
	if target.MerchantID != f.merchant || target.Handle != f.handle || target.KybStatus != "APPROVED" || target.WalletAccountID == "" {
		t.Fatalf("target %+v", target)
	}
	// L: the link grant is single-use.
	if _, err := f.svc.RedeemProjectLinkGrant(f.ctx, lgrant, project); !errors.Is(err, ErrBusinessLinkGrantInvalid) {
		t.Fatalf("a spent link grant was reused: %v", err)
	}
}

// G: a Business with no verified contact gets no ownership OTP (no fallback to
// a .test placeholder).
func TestBusinessContact_NoVerifiedContactRefusesLink(t *testing.T) {
	f := newContactFixture(t)
	_, _, err := f.svc.StartProjectLink(f.ctx, f.merchant, uuid.NewString(), "")
	if !errors.Is(err, ErrNoVerifiedContact) {
		t.Fatalf("a Business with no verified contact was asked to link: %v", err)
	}
}

// J: a grant for one Project cannot link another.
func TestBusinessContact_CrossProjectGrantRejected(t *testing.T) {
	f := newContactFixture(t)
	code, _, _ := f.svc.StartContactVerify(f.ctx, f.merchant, "dono@example.com", "")
	grant, _, _ := f.svc.ConfirmContactVerify(f.ctx, f.merchant, code)
	_, _ = f.svc.PersistVerifiedContact(f.ctx, grant, f.merchant)

	projectA := uuid.NewString()
	lcode, _, _ := f.svc.StartProjectLink(f.ctx, f.merchant, projectA, "")
	lgrant, _ := f.svc.ConfirmProjectLink(f.ctx, f.merchant, projectA, lcode)
	// Redeeming for a DIFFERENT project must fail.
	if _, err := f.svc.RedeemProjectLinkGrant(f.ctx, lgrant, uuid.NewString()); !errors.Is(err, ErrBusinessLinkGrantInvalid) {
		t.Fatalf("a link grant for project A was spent on project B: %v", err)
	}
}

// N (partial): a malformed subject is a neutral invalid, never an oracle.
func TestBusinessContact_MalformedSubjectIsNeutral(t *testing.T) {
	f := newContactFixture(t)
	if _, _, err := f.svc.StartContactVerify(f.ctx, "not-a-uuid", "dono@example.com", ""); !errors.Is(err, ErrBusinessContactInvalid) {
		t.Fatalf("a malformed subject was not neutral: %v", err)
	}
	if _, _, _, ok, _ := verifiedTriple(f); ok {
		t.Fatal("a contact appeared from a malformed request")
	}
}

// A LIVE/SANDBOX mismatch: a SANDBOX service never reads a LIVE contact.
func TestBusinessContact_EnvironmentIsolation(t *testing.T) {
	f := newContactFixture(t)
	code, _, _ := f.svc.StartContactVerify(f.ctx, f.merchant, "dono@example.com", "")
	grant, _, _ := f.svc.ConfirmContactVerify(f.ctx, f.merchant, code)
	_, _ = f.svc.PersistVerifiedContact(f.ctx, grant, f.merchant)

	live := NewBusinessContactService(f.pool, "test-pepper-0175", "LIVE")
	if _, _, ok, _ := live.VerifiedContactFor(f.ctx, f.merchant); ok {
		t.Fatal("a LIVE service read a SANDBOX verified contact")
	}
}
