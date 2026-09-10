package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	documents "github.com/banzami/banzami/services/common/documents"
)

// Receipt semantics on a real database: who was paid is whoever the ledger
// credited, never the Project that created the link; the operation, channel
// and the Business's own words come out of the same derivation for every
// surface; and a proof, once issued, is history.

type semFixture struct {
	t    *testing.T
	pool *pgxpool.Pool
	ctx  context.Context
	undo []func()
}

func newSemFixture(t *testing.T) *semFixture {
	pool := dbPoolOrSkip(t)
	var has *string
	_ = pool.QueryRow(context.Background(), `SELECT to_regclass('public.business_public_identities')::text`).Scan(&has)
	if has == nil {
		pool.Close()
		t.Skip("migration 0125 not applied — skipping")
	}
	f := &semFixture{t: t, pool: pool, ctx: context.Background()}
	t.Cleanup(func() {
		for i := len(f.undo) - 1; i >= 0; i-- {
			f.undo[i]()
		}
		pool.Close()
	})
	return f
}

func (f *semFixture) exec(sql string, args ...any) {
	f.t.Helper()
	if _, err := f.pool.Exec(f.ctx, sql, args...); err != nil {
		f.t.Fatalf("seed: %v\n%s", err, sql)
	}
}

func (f *semFixture) cleanup(sql string, args ...any) {
	f.undo = append(f.undo, func() { _, _ = f.pool.Exec(context.Background(), sql, args...) })
}

func (f *semFixture) ledgerAccount(name string) string {
	id := uuid.NewString()
	f.exec(`INSERT INTO ledger_accounts (id, account_type, name, currency) VALUES ($1,'LIABILITY',$2,'AOA')`, id, name)
	f.cleanup(`DELETE FROM ledger_accounts WHERE id=$1`, id)
	return id
}

func (f *semFixture) consumer(handle, name string) string {
	id := uuid.NewString()
	f.exec(`INSERT INTO consumers (id, handle, display_name, status) VALUES ($1,$2,$3,'ACTIVE')`, id, handle, name)
	f.cleanup(`DELETE FROM consumers WHERE id=$1`, id)
	return id
}

// business creates a Business whose ACCOUNT name is accountName (e.g. the
// retired Console setup's "Sandbox · <Project>"), owning handle, approved under
// reviewedName. Returns the merchant and its wallet.
func (f *semFixture) business(accountName, handle, reviewedName string) (merchant, wallet string) {
	merchant, wallet = uuid.NewString(), uuid.NewString()
	f.exec(`INSERT INTO merchants (id, name, email, status) VALUES ($1,$2,$3,'ACTIVE')`, merchant, accountName, merchant+"@example.test")
	f.cleanup(`DELETE FROM merchants WHERE id=$1`, merchant)
	f.exec(`INSERT INTO wallets (id, merchant_id, currency, available_account_id, reserved_account_id) VALUES ($1,$2,'AOA',$3,$4)`,
		wallet, merchant, f.ledgerAccount("avail"), f.ledgerAccount("reserved"))
	f.cleanup(`DELETE FROM wallets WHERE id=$1`, wallet)
	if handle != "" {
		f.exec(`INSERT INTO handle_registry (handle, owner_type, owner_id) VALUES ($1,'MERCHANT',$2)`, handle, merchant)
		f.cleanup(`DELETE FROM handle_registry WHERE handle=$1`, handle)
	}
	if reviewedName != "" {
		app := uuid.NewString()
		f.exec(`INSERT INTO merchant_applications (id, origin, status, resolution, environment, desired_handle, business_name, email, created_merchant_id)
		        VALUES ($1,'STANDALONE_BUSINESS','APPROVED','PROVISIONED_NEW','SANDBOX',$2,$3,$4,$5)`, app, handle, reviewedName, app+"@example.test", merchant)
		f.cleanup(`DELETE FROM merchant_applications WHERE id=$1`, app)
	}
	return merchant, wallet
}

// link creates a payment link (optionally the PAYMENT_LINK interface of a
// Payment Session carrying metadata) and returns its id.
func (f *semFixture) link(merchant, wallet, description string, metadata string) string {
	id := uuid.NewString()
	f.exec(`INSERT INTO payment_links (id, slug, merchant_id, wallet_id, amount_minor, currency, description, status, environment)
	        VALUES ($1,$2,$3,$4,200000,'AOA',NULLIF($5,''),'USED','SANDBOX')`, id, id[:12], merchant, wallet, description)
	f.cleanup(`DELETE FROM payment_links WHERE id=$1`, id)
	if metadata != "" {
		wa := uuid.NewString()
		f.exec(`INSERT INTO wallet_accounts (id, wallet_id, account_id, merchant_id, currency, purpose, label, status)
		        VALUES ($1,$2,$3,$4,'AOA','CAMPAIGN','Campanha','ACTIVE')`, wa, wallet, f.ledgerAccount("wa"), merchant)
		f.cleanup(`DELETE FROM wallet_accounts WHERE id=$1`, wa)
		ps := uuid.NewString()
		f.exec(`INSERT INTO payment_sessions (id, merchant_id, wallet_id, wallet_account_id, currency, payment_link_id, metadata)
		        VALUES ($1,$2,$3,$4,'AOA',$5,$6::jsonb)`, ps, merchant, wallet, wa, id, metadata)
		f.cleanup(`DELETE FROM payment_sessions WHERE id=$1`, ps)
	}
	return id
}

func (f *semFixture) transfer(sender, recipient, idempotencyKey, description string) string {
	id := uuid.NewString()
	f.exec(`INSERT INTO transfers (id, idempotency_key, sender_id, recipient_id, amount_minor, currency, status, description, environment)
	        VALUES ($1,$2,$3,$4,200000,'AOA','COMPLETED',NULLIF($5,''),'SANDBOX')`, id, idempotencyKey, sender, recipient, description)
	f.cleanup(`DELETE FROM transfers WHERE id=$1`, id)
	f.cleanup(`DELETE FROM transaction_proof_corrections WHERE proof_id IN (SELECT id FROM transaction_proofs WHERE transaction_id=$1)`, id)
	f.cleanup(`DELETE FROM transaction_proofs WHERE transaction_id=$1`, id)
	return id
}

func semantics(f *semFixture) *ReceiptSemantics {
	return NewReceiptSemantics(f.pool, NewProofService(f.pool, "test-key", "op-hmac-v1", "banzami", "banza", "https://banzami.com/r/"))
}

func TestReceipt_PaymentLinkPaysTheBusinessNotTheProject(t *testing.T) {
	f := newSemFixture(t)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	payer := f.consumer("pay"+suffix, "Pagador Teste")
	// The account name is the Project's (the retired Console setup); the handle
	// is the Business's; the reviewed name is the Business's.
	merchant, wallet := f.business("Sandbox · Projeto-"+suffix, "biz"+suffix, "Negócio "+suffix)
	link := f.link(merchant, wallet, "", "")
	txn := f.transfer(payer, wallet, "pl-pay-"+link, "Payment link: "+link[:12])

	rec, err := semantics(f).TransferReceipt(f.ctx, txn, "SANDBOX", true)
	if err != nil {
		t.Fatal(err)
	}
	if rec.Payee.DisplayName != "Negócio "+suffix || rec.Payee.Handle != "biz"+suffix || rec.Payee.Kind != documents.PartyBusiness {
		t.Fatalf("payee = %+v, want the Business, not the Project", rec.Payee)
	}
	if strings.Contains(rec.Payee.DisplayName, "Projeto") || strings.Contains(rec.Payee.DisplayName, "Sandbox ·") {
		t.Fatalf("the Project leaked into the payee: %q", rec.Payee.DisplayName)
	}
	if rec.OperationKind != documents.OperationPayment || rec.Channel != documents.ChannelPaymentLink || rec.FundingSource != documents.FundingBanzamiBalance {
		t.Fatalf("semantics = %s/%s/%s", rec.OperationKind, rec.Channel, rec.FundingSource)
	}
	if rec.Description != "" {
		t.Fatalf("no description was written, and none may be invented: %q", rec.Description)
	}
	if ClassifyReference(rec.ProofReference) != ReferenceSecureV1 {
		t.Fatalf("reference %q is not SECURE_V1", rec.ProofReference)
	}
	// The public view: the Business by name, the payer by @handle only.
	p, _ := NewProofService(f.pool, "test-key", "", "", "", "").GetByReference(f.ctx, rec.ProofReference)
	pub := NewProofService(f.pool, "test-key", "", "", "", "").Public(p)
	if pub["payee_display"] != "Negócio "+suffix || pub["payee_handle"] != "biz"+suffix || pub["payer_display"] != nil {
		t.Fatalf("public payload %v", pub)
	}
	for _, leak := range []string{link, link[:12], merchant, wallet, payer, txn} {
		for k, v := range pub {
			if s, ok := v.(string); ok && strings.Contains(s, leak) {
				t.Fatalf("public field %s leaks an internal id: %q", k, s)
			}
		}
	}
}

func TestReceipt_TheBusinessesOwnWordsAreContextNotIdentity(t *testing.T) {
	f := newSemFixture(t)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	payer := f.consumer("ctx"+suffix, "")
	merchant, wallet := f.business("Conta "+suffix, "vaq"+suffix, "")
	link := f.link(merchant, wallet, "DOA-55791091",
		`{"merchant_reference":"DOA-55791091","display_context":"Vaquinha · Jornada fresca","payee_name":"Outro Negócio","payee_handle":"outro"}`)
	txn := f.transfer(payer, wallet, "pl-pay-"+link, "Payment link: "+link[:12])

	rec, err := semantics(f).TransferReceipt(f.ctx, txn, "SANDBOX", true)
	if err != nil {
		t.Fatal(err)
	}
	if rec.MerchantReference != "DOA-55791091" || rec.DisplayContext != "Vaquinha · Jornada fresca" {
		t.Fatalf("context = %q / %q", rec.MerchantReference, rec.DisplayContext)
	}
	// The link's description repeats the reference: shown once, as the reference.
	if rec.Description != "" {
		t.Fatalf("description duplicates the reference: %q", rec.Description)
	}
	// A caller-supplied payee in metadata is ignored — identity is the ledger's.
	if rec.Payee.Handle != "vaq"+suffix || rec.Payee.DisplayName != "Conta "+suffix {
		t.Fatalf("payee = %+v", rec.Payee)
	}
	// A payer with no display name reads as their @handle.
	if rec.Payer.DisplayName != "@ctx"+suffix {
		t.Fatalf("payer = %+v", rec.Payer)
	}
}

func TestReceipt_P2PStaysATransfer(t *testing.T) {
	f := newSemFixture(t)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	a := f.consumer("ana"+suffix, "Ana Teste")
	b := f.consumer("bia"+suffix, "Bia Teste")
	txn := f.transfer(a, b, "p2p-"+suffix, "jantar")

	rec, err := semantics(f).TransferReceipt(f.ctx, txn, "SANDBOX", true)
	if err != nil {
		t.Fatal(err)
	}
	if rec.OperationKind != documents.OperationP2PTransfer || rec.Channel != documents.ChannelHandle ||
		rec.Payee.Kind != documents.PartyPerson || rec.Payee.Handle != "bia"+suffix || rec.Description != "jantar" {
		t.Fatalf("p2p receipt = %+v", rec)
	}
	p, _ := NewProofService(f.pool, "k", "", "", "", "").GetByReference(f.ctx, rec.ProofReference)
	if pub := NewProofService(f.pool, "k", "", "", "", "").Public(p); pub["payee_display"] != nil || pub["payer_display"] != nil {
		t.Fatalf("a person's name reached the public page: %v", pub)
	}
}

func TestReceipt_AnotherEnvironmentsOperationIsNotFound(t *testing.T) {
	f := newSemFixture(t)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	txn := f.transfer(f.consumer("env"+suffix, ""), f.consumer("vne"+suffix, ""), "env-"+suffix, "")
	if _, err := semantics(f).TransferReceipt(f.ctx, txn, "LIVE", true); err != ErrReceiptSourceNotFound {
		t.Fatalf("err = %v, want ErrReceiptSourceNotFound", err)
	}
}

// A proof is history: renaming the Business afterwards changes no issued
// receipt, and reading a receipt again returns the same snapshot.
func TestReceipt_SnapshotSurvivesARename(t *testing.T) {
	f := newSemFixture(t)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	payer := f.consumer("snp"+suffix, "")
	merchant, wallet := f.business("Nome Antigo "+suffix, "snb"+suffix, "")
	link := f.link(merchant, wallet, "", "")
	txn := f.transfer(payer, wallet, "pl-pay-"+link, "")
	sem := semantics(f)
	first, err := sem.TransferReceipt(f.ctx, txn, "SANDBOX", true)
	if err != nil {
		t.Fatal(err)
	}
	f.exec(`UPDATE merchants SET name=$2 WHERE id=$1`, merchant, "Nome Novo "+suffix)
	again, err := sem.TransferReceipt(f.ctx, txn, "SANDBOX", true)
	if err != nil {
		t.Fatal(err)
	}
	if again.Payee.DisplayName != "Nome Antigo "+suffix || again.ProofReference != first.ProofReference {
		t.Fatalf("issued receipt changed after a rename: %+v", again.Payee)
	}
}

// A proof issued the old way (empty payee typed consumer, generated
// description, legacy method, no semantics) is completed from the same
// derivation — same reference, amount and instant; re-signed; every change
// recorded.
func TestReceipt_LegacyProofIsCompletedAndAudited(t *testing.T) {
	f := newSemFixture(t)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	payer := f.consumer("leg"+suffix, "Legado Teste")
	merchant, wallet := f.business("Sandbox · Legado-"+suffix, "lgb"+suffix, "Legado Lda "+suffix)
	link := f.link(merchant, wallet, "REF-"+suffix, "")
	txn := f.transfer(payer, wallet, "pl-pay-"+link, "Payment link: "+link[:12])

	proofs := NewProofService(f.pool, "test-key", "op-hmac-v1", "banzami", "banza", "https://banzami.com/r/")
	confirmed := time.Now().UTC().Truncate(time.Microsecond)
	old, err := proofs.Ensure(f.ctx, ProofInput{ // what the consumer receipt path used to mint
		TransactionID: txn, TransferID: txn, Environment: "SANDBOX",
		PayerSubjectType: "consumer", PayerSubjectID: payer, PayerDisplayName: "Legado Teste", PayerHandle: "leg" + suffix,
		PayeeSubjectType: "consumer", PayeeSubjectID: wallet,
		AmountMinor: 200000, Currency: "AOA", Status: "COMPLETED",
		Description: "Payment link: " + link[:12], Method: "Transferência Banzami · @banza",
		LedgerReference: txn, ConfirmedAt: &confirmed,
	})
	if err != nil {
		t.Fatal(err)
	}

	rec, err := semantics(f).TransferReceipt(f.ctx, txn, "SANDBOX", true)
	if err != nil {
		t.Fatal(err)
	}
	if rec.ProofReference != old.ProofReference {
		t.Fatalf("reference reissued: %s → %s", old.ProofReference, rec.ProofReference)
	}
	if rec.Payee.Handle != "lgb"+suffix || rec.Payee.DisplayName != "Legado Lda "+suffix ||
		rec.OperationKind != documents.OperationPayment || rec.Channel != documents.ChannelPaymentLink ||
		rec.Description != "REF-"+suffix {
		t.Fatalf("completed receipt = %+v", rec)
	}
	var count int
	var amount int64
	var method, hash string
	var at time.Time
	if err := f.pool.QueryRow(f.ctx, `SELECT (SELECT count(*) FROM transaction_proof_corrections WHERE proof_id=p.id), p.amount_minor, p.confirmed_at, p.method, p.proof_hash
	      FROM transaction_proofs p WHERE p.transaction_id=$1`, txn).Scan(&count, &amount, &at, &method, &hash); err != nil {
		t.Fatal(err)
	}
	if amount != 200000 || !at.Equal(confirmed) || method != "Saldo Banzami" || hash == old.ProofHash {
		t.Fatalf("after correction: amount %d at %v method %q hash changed=%v", amount, at, method, hash != old.ProofHash)
	}
	if count < 8 {
		t.Fatalf("corrections recorded = %d, want every changed field", count)
	}
	// Idempotent: completing again changes and records nothing more.
	if _, err := semantics(f).TransferReceipt(f.ctx, txn, "SANDBOX", true); err != nil {
		t.Fatal(err)
	}
	var again int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM transaction_proof_corrections c JOIN transaction_proofs p ON p.id=c.proof_id WHERE p.transaction_id=$1`, txn).Scan(&again)
	if again != count {
		t.Fatalf("second pass recorded %d more corrections", again-count)
	}
}

// Reading a receipt without issuing writes nothing.
func TestReceipt_ReadingDoesNotIssue(t *testing.T) {
	f := newSemFixture(t)
	suffix := strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	txn := f.transfer(f.consumer("rd"+suffix, ""), f.consumer("dr"+suffix, ""), "rd-"+suffix, "")
	rec, err := semantics(f).TransferReceipt(f.ctx, txn, "SANDBOX", false)
	if err != nil {
		t.Fatal(err)
	}
	var n int
	_ = f.pool.QueryRow(f.ctx, `SELECT count(*) FROM transaction_proofs WHERE transaction_id=$1`, txn).Scan(&n)
	if n != 0 || rec.ProofReference != "" || rec.OperationKind != documents.OperationP2PTransfer {
		t.Fatalf("read issued a proof (%d) or returned a reference %q", n, rec.ProofReference)
	}
}

func TestMerchantContextValidation(t *testing.T) {
	ok := map[string]any{"merchant_reference": "DOA-55791091", "display_context": "Vaquinha · Jornada economica fresca"}
	if ref, ctx, err := MerchantContextFromMetadata(ok); err != nil || ref != "DOA-55791091" || ctx == "" {
		t.Fatalf("valid metadata refused: %v", err)
	}
	for _, bad := range []map[string]any{
		{"merchant_reference": "<script>"},
		{"merchant_reference": strings.Repeat("A", 65)},
		{"merchant_reference": 42},
		{"display_context": "Pague a @outro"},
		{"display_context": "veja https://x.test"},
		{"display_context": "linha\nnova"},
		{"display_context": strings.Repeat("a", 121)},
	} {
		if _, _, err := MerchantContextFromMetadata(bad); err == nil {
			t.Errorf("accepted %v", bad)
		}
	}
	if _, _, err := MerchantContextFromMetadata(map[string]any{"campaign_id": "uuid-here"}); err != nil {
		t.Fatalf("other metadata keys are opaque and must pass: %v", err)
	}
}
