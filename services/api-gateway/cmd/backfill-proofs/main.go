// Materialise the proofs that should already exist.
//
// Between the receipt feature shipping and the proof service being wired, four
// receipt generators printed a public reference derived from an object id and
// never minted anything behind it. The documents are in people's hands; their QR
// codes resolve to "does not exist or may have been forged". BZM-F993-… is
// one of them.
//
// This reconstructs those proofs from the ledger-backed records, using the exact
// LEGACY_HEX_V0 reference the retired generators printed, so an already-issued
// PDF becomes verifiable rather than being replaced by one nobody has.
//
// It is a command and not a migration on purpose. A proof carries a SHA-256 hash
// over a canonical, ordered payload and an HMAC signature under the operator
// key. That key is a docker secret and is not, and must not be, reachable from a
// SQL session; reproducing Go's canonical encoding in SQL would be a second
// implementation of proof materialisation, which is the exact class of defect
// this release is closing. So the backfill runs through ProofService itself and
// every field — hash, signature, status normalisation, idempotency — comes from
// the one implementation.
//
// Safe to re-run: Ensure is idempotent on (transaction_id, environment).
//
//	docker run --rm --network <net> \
//	  -e DATABASE_URL=... -e BZM_PROOF_SIGNING_KEY=... \
//	  <gateway-image> /usr/local/bin/backfill-proofs [-apply]
//
// Without -apply it reports what it would do and writes nothing.
//
// -correct-semantics completes the display snapshot of proofs issued before
// migration 0125 (operation kind, channel, funding source) and fixes what the
// old receipt path got wrong by construction — the empty payee of a
// payment-link payment, the generated "Payment link: <slug>" description, the
// method line that mixed channel, namespace and network. It derives every
// value from the ledger's records through service.ReceiptSemantics — the same
// derivation new proofs use — and records each change, with the hash and
// signature the proof carried before, in transaction_proof_corrections. The
// reference, amount, currency and instants are never touched. A proof whose
// source cannot be classified is reported, not guessed.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/banzami/banzami/services/common/env"
)

// The two families. Both once printed a derived reference:
//
//	transfers       → consumer/P2P receipts (public-api)
//	wallet_payments → merchant QR receipts (api-gateway)
//
// The SELECTs mirror proofInputFromTransfer and proofInputFromPayment exactly,
// including the Method strings and the ledger reference, so a backfilled proof
// is indistinguishable from one the live path would have minted — apart from the
// reference, which is the whole point.
//
// They deliberately do NOT filter on the source row's environment, and the proof
// does not inherit it. Those rows are exactly the ones 0113 repairs: most of them
// still say LIVE because their writer omitted the column. Reading the universe
// off a row we already know is mislabelled would be circular, and it would force
// the backfill to run after the migration — leaving a window in which a receipt
// request mints a SECURE_V1 proof for a record whose legacy reference is already
// printed on somebody's PDF, killing that reference permanently. The environment
// comes from platform_mode, which is the authority, and this can therefore run
// first.
const transfersQuery = `
	SELECT t.id::text,
	       t.sender_id::text, t.recipient_id::text,
	       COALESCE(cs.handle,''), COALESCE(NULLIF(TRIM(cs.display_name),''), '@'||cs.handle, ''),
	       COALESCE(cr.handle,''), COALESCE(NULLIF(TRIM(cr.display_name),''), '@'||cr.handle, ''),
	       t.amount_minor, t.currency, t.status, COALESCE(t.description,''),
	       COALESCE(t.updated_at, t.created_at)
	  FROM transfers t
	  LEFT JOIN consumers cs ON cs.id = t.sender_id
	  LEFT JOIN consumers cr ON cr.id = t.recipient_id
	 WHERE NOT EXISTS (SELECT 1 FROM transaction_proofs p
	                    WHERE p.transaction_id = t.id::text AND p.environment = $1)
	 ORDER BY t.created_at`

const walletPaymentsQuery = `
	SELECT wp.id::text,
	       wp.consumer_id::text, wp.merchant_id::text,
	       COALESCE(c.handle,''), COALESCE(NULLIF(TRIM(c.display_name),''), '@'||c.handle, ''),
	       COALESCE(m.name,''),
	       wp.amount_minor, wp.currency, wp.status,
	       wp.created_at
	  FROM wallet_payments wp
	  LEFT JOIN consumers c ON c.id = wp.consumer_id
	  LEFT JOIN merchants m ON m.id = wp.merchant_id
	 WHERE NOT EXISTS (SELECT 1 FROM transaction_proofs p
	                    WHERE p.transaction_id = wp.id::text AND p.environment = $1)
	 ORDER BY wp.created_at`

type outcome struct{ materialised, skipped, failed int }

func main() {
	apply := flag.Bool("apply", false, "write the proofs; without it, report only")
	correct := flag.Bool("correct-semantics", false, "complete/correct the display snapshot of existing proofs instead of materialising missing ones")
	flag.Parse()

	ctx := context.Background()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fatal("DATABASE_URL is not set")
	}

	// The platform's own declaration, checked here as well as in 0113. This
	// command mints LEGACY_HEX_V0 references, which the public lookup refuses
	// outside the Sandbox — a LIVE run would write rows nothing can read.
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fatal("database: %v", err)
	}
	defer pool.Close()

	var mode string
	if err := pool.QueryRow(ctx,
		`SELECT value FROM platform_settings WHERE key='platform_mode' AND environment='GLOBAL'`,
	).Scan(&mode); err != nil {
		fatal("could not read platform_mode: %v", err)
	}
	if !env.Parse(mode).IsSandbox() {
		fatal("refusing: platform_mode is %s, not SANDBOX", mode)
	}

	signingKey := os.Getenv("BZM_PROOF_SIGNING_KEY")
	if signingKey == "" {
		// An unsigned proof is a weaker record than no proof is a missing one:
		// it would sit in the table looking materialised while carrying an HMAC
		// under the empty key.
		fatal("refusing: BZM_PROOF_SIGNING_KEY is not set — a proof must be signed")
	}

	svc := service.NewProofService(pool, signingKey,
		os.Getenv("BZM_PROOF_KEY_ID"), os.Getenv("BZM_OPERATOR_ID"),
		os.Getenv("BZM_NETWORK"), os.Getenv("BZM_PROOF_PUBLIC_BASE"))

	if *correct {
		os.Exit(correctSemantics(ctx, pool, svc, *apply))
	}

	// The semantics of a receipt are derived by the one authority that derives
	// them for the live path — never written here as text. This pass used to
	// mint proofs carrying "Transferência Banzami · @banza" and no operation,
	// channel or funding source, which a second -correct-semantics run then had
	// to repair; a proof is signed when it is written, so it was wrong in the
	// record from the moment it existed (A7-61).
	sem := service.NewReceiptSemantics(pool, svc)

	total := outcome{}
	// env.SandboxName, not the string on the row: platform_mode is the authority
	// and the rows are the thing being corrected.
	total.add(run(ctx, pool, svc, sem, "transfers", transfersQuery, scanTransfer, env.SandboxName, *apply))
	total.add(run(ctx, pool, svc, sem, "wallet_payments", walletPaymentsQuery, scanWalletPayment, env.SandboxName, *apply))

	verb := "would materialise"
	if *apply {
		verb = "materialised"
	}
	fmt.Printf("\n%s %d proofs, %d already present, %d failed\n",
		verb, total.materialised, total.skipped, total.failed)
	if total.failed > 0 {
		os.Exit(1)
	}
}

// scannable is one row. Named so the two scanners read as what they are.
type scannable interface{ Scan(dest ...any) error }

type rowScanner func(r scannable, environment string) (sourceID string, in service.ProofInput, err error)

func scanTransfer(r scannable, environment string) (string, service.ProofInput, error) {
	var id, senderID, recipientID, senderHandle, senderName, recipientHandle, recipientName string
	var amount int64
	var currency, status, description string
	var confirmed time.Time
	if err := r.Scan(&id, &senderID, &recipientID, &senderHandle, &senderName,
		&recipientHandle, &recipientName, &amount, &currency, &status,
		&description, &confirmed); err != nil {
		return "", service.ProofInput{}, err
	}
	return id, service.ProofInput{
		TransactionID: id, TransferID: id, Environment: environment,
		PayerSubjectType: "consumer", PayerSubjectID: senderID,
		PayerDisplayName: senderName, PayerHandle: senderHandle,
		PayeeSubjectType: "consumer", PayeeSubjectID: recipientID,
		PayeeDisplayName: recipientName, PayeeHandle: recipientHandle,
		AmountMinor: amount, Currency: currency, Status: status,
		Description: description,
		// Method, operation, channel and funding source are NOT written here:
		// run() fills them from the live derivation (A7-61).
		// The live path uses the transfer id as the ledger reference; keeping it
		// identical matters because it is one of the signed fields.
		LedgerReference: id,
		ConfirmedAt:     &confirmed,
	}, nil
}

func scanWalletPayment(r scannable, environment string) (string, service.ProofInput, error) {
	var id, consumerID, merchantID, payerHandle, payerName, merchantName string
	var amount int64
	var currency, status string
	var created time.Time
	if err := r.Scan(&id, &consumerID, &merchantID, &payerHandle, &payerName,
		&merchantName, &amount, &currency, &status, &created); err != nil {
		return "", service.ProofInput{}, err
	}
	return id, service.ProofInput{
		TransactionID: id, Environment: environment,
		PayerSubjectType: "consumer", PayerSubjectID: consumerID,
		PayerDisplayName: payerName, PayerHandle: payerHandle,
		PayeeSubjectType: "merchant", PayeeSubjectID: merchantID,
		PayeeDisplayName: merchantName,
		AmountMinor:      amount, Currency: currency, Status: status,
		LedgerReference: id,
		ConfirmedAt:     &created,
	}, nil
}

func run(ctx context.Context, pool *pgxpool.Pool, svc *service.ProofService,
	sem *service.ReceiptSemantics, family, query string, scan rowScanner,
	environment string, apply bool) outcome {
	rows, err := pool.Query(ctx, query, environment)
	if err != nil {
		fatal("%s: %v", family, err)
	}
	type item struct {
		sourceID string
		in       service.ProofInput
	}
	var items []item
	for rows.Next() {
		sourceID, in, err := scan(rows, environment)
		if err != nil {
			fatal("%s: %v", family, err)
		}
		items = append(items, item{sourceID, in})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		fatal("%s: %v", family, err)
	}

	out := outcome{}
	fmt.Printf("%s: %d record(s) without a proof\n", family, len(items))
	for _, it := range items {
		// Operation, channel, funding source and the payee's public identity
		// come from the same derivation the live path uses. A record whose
		// semantics cannot be derived mints nothing: a signed proof that says
		// the wrong thing is worse than a missing one.
		derived, derr := deriveSemantics(ctx, sem, family, it.sourceID, it.in.Environment)
		if derr != nil {
			out.failed++
			slog.Error("semantics undeterminable — no proof minted",
				"family", family, "source_id", it.sourceID, "error", derr)
			continue
		}
		in := it.in
		in.OperationKind = derived.OperationKind
		in.Channel = derived.Channel
		in.FundingSource = derived.FundingSource
		in.Method = derived.Method
		if derived.PayeeHandle != "" {
			in.PayeeHandle = derived.PayeeHandle
			in.PayeeDisplayName = derived.PayeeDisplayName
			in.PayeeSubjectType = derived.PayeeSubjectType
			in.PayeeSubjectID = derived.PayeeSubjectID
		}
		if !apply {
			out.materialised++
			continue
		}
		p, err := svc.EnsureHistorical(ctx, it.sourceID, in)
		switch {
		case err == nil:
			out.materialised++
			// The reference is printed because it is already public — it is on a
			// PDF somebody holds. Nothing else about the proof is logged.
			fmt.Printf("  %s → %s\n", it.sourceID, p.ProofReference)
		case errors.Is(err, service.ErrHistoricalReferenceTaken):
			// Two records deriving the same 32-bit reference. Neither can own it
			// unambiguously, so the second is left alone and reported rather than
			// pointed at the first record's proof.
			out.failed++
			slog.Error("legacy reference collision", "family", family, "source_id", it.sourceID, "error", err)
		default:
			out.failed++
			slog.Error("could not materialise proof", "family", family, "source_id", it.sourceID, "error", err)
		}
	}
	return out
}

// correctSemantics completes every Sandbox proof that has no operation kind.
// Returns the process exit code.
func correctSemantics(ctx context.Context, pool *pgxpool.Pool, svc *service.ProofService, apply bool) int {
	sem := service.NewReceiptSemantics(pool, svc)
	rows, err := pool.Query(ctx, `
		SELECT p.id::text, p.transaction_id, p.environment,
		       EXISTS (SELECT 1 FROM transfers t WHERE t.id::text = p.transaction_id),
		       EXISTS (SELECT 1 FROM wallet_payments wp WHERE wp.id::text = p.transaction_id)
		  FROM transaction_proofs p
		 WHERE p.operation_kind IS NULL AND p.environment = $1
		 ORDER BY p.issued_at`, env.SandboxName)
	if err != nil {
		fatal("proofs: %v", err)
	}
	type item struct {
		proofID, txn, environment string
		transfer, walletPayment   bool
	}
	var items []item
	for rows.Next() {
		var it item
		if err := rows.Scan(&it.proofID, &it.txn, &it.environment, &it.transfer, &it.walletPayment); err != nil {
			fatal("proofs: %v", err)
		}
		items = append(items, it)
	}
	rows.Close()

	var corrected, undeterminable, failed int
	kinds := map[string]int{}
	fmt.Printf("proofs without semantics: %d\n", len(items))
	for _, it := range items {
		var derived service.ProofInput
		var derr error
		switch {
		case it.transfer && !it.walletPayment:
			derived, derr = sem.ForTransfer(ctx, it.txn, it.environment)
		case it.walletPayment && !it.transfer:
			derived, derr = sem.ForWalletPayment(ctx, it.txn)
		default:
			derr = service.ErrReceiptUndeterminable
		}
		if derr != nil {
			// Reported by proof id only: a proof reference is a bearer capability.
			undeterminable++
			fmt.Printf("  UNDETERMINABLE proof %s: %v\n", it.proofID, derr)
			continue
		}
		kinds[derived.OperationKind+"/"+derived.Channel]++
		if !apply {
			corrected++
			fmt.Printf("  would complete proof %s → %s/%s payee=@%s\n", it.proofID, derived.OperationKind, derived.Channel, derived.PayeeHandle)
			continue
		}
		p, err := svc.GetByTransaction(ctx, it.txn, it.environment)
		if err == nil {
			_, err = svc.CorrectSemantics(ctx, p, derived, service.SemanticsCorrectionBatch)
		}
		if err != nil {
			failed++
			slog.Error("could not complete proof", "proof_id", it.proofID, "error", err)
			continue
		}
		corrected++
		fmt.Printf("  completed proof %s → %s/%s payee=@%s\n", it.proofID, derived.OperationKind, derived.Channel, derived.PayeeHandle)
	}
	verb := "would complete"
	if apply {
		verb = "completed"
	}
	fmt.Printf("\n%s %d, undeterminable %d, failed %d, by kind %v\n", verb, corrected, undeterminable, failed, kinds)
	if failed > 0 {
		return 1
	}
	return 0
}

func (o *outcome) add(other outcome) {
	o.materialised += other.materialised
	o.skipped += other.skipped
	o.failed += other.failed
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "backfill-proofs: "+format+"\n", args...)
	os.Exit(1)
}

// deriveSemantics asks the live derivation what this record's receipt says.
func deriveSemantics(ctx context.Context, sem *service.ReceiptSemantics,
	family, sourceID, environment string) (service.ProofInput, error) {
	switch family {
	case "transfers":
		return sem.ForTransfer(ctx, sourceID, environment)
	case "wallet_payments":
		return sem.ForWalletPayment(ctx, sourceID)
	default:
		return service.ProofInput{}, service.ErrReceiptUndeterminable
	}
}
