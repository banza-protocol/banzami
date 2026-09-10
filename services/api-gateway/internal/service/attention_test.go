package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// Operator attention counts only what waits for an operator, in the gateway's
// own environment. Delta-based: the shared test database already holds rows,
// so each case measures, seeds, and measures again.

func attentionNow(t *testing.T, s *AttentionService) map[string]int {
	t.Helper()
	sum, err := s.Summary(context.Background())
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	out := map[string]int{}
	for k, v := range sum.Categories {
		out[k] = v.Count
	}
	return out
}

func TestAttention_CountsOnlyWhatWaitsForAnOperator(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	svc := NewAttentionService(pool, "SANDBOX")
	before := attentionNow(t, svc)

	var cleanup []func()
	defer func() {
		for i := len(cleanup) - 1; i >= 0; i-- {
			cleanup[i]()
		}
	}()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("seed: %v\n%s", err, sql)
		}
	}

	// Applications: 3 need an operator (SUBMITTED, PROVISIONING_FAILED, an
	// approved Project application whose binding did not complete); 4 do not
	// (INFORMATION_REQUIRED waits for the applicant; APPROVED and REJECTED are
	// history; a SUBMITTED one on the other environment is not this console's).
	type app struct {
		status, env, origin string
		bound               bool
	}
	for _, a := range []app{
		{"SUBMITTED", "SANDBOX", "STANDALONE_BUSINESS", false},
		{"PROVISIONING_FAILED", "SANDBOX", "STANDALONE_BUSINESS", false},
		{"APPROVED", "SANDBOX", "DEVELOPER_PROJECT", false},
		{"INFORMATION_REQUIRED", "SANDBOX", "STANDALONE_BUSINESS", false},
		{"APPROVED", "SANDBOX", "DEVELOPER_PROJECT", true},
		{"REJECTED", "SANDBOX", "STANDALONE_BUSINESS", false},
		{"SUBMITTED", "LIVE", "STANDALONE_BUSINESS", false},
	} {
		id := uuid.NewString()
		var project any
		if a.origin == "DEVELOPER_PROJECT" {
			project = uuid.NewString()
		}
		info := any(nil)
		if a.status == "INFORMATION_REQUIRED" {
			info = "envie o registo comercial"
		}
		resolution := any(nil)
		if a.status == "APPROVED" {
			resolution = "PROVISIONED_NEW"
		}
		exec(`INSERT INTO merchant_applications (id, origin, project_id, status, environment, desired_handle, business_name, email,
		        provisioning_project_bound, information_request, information_requested_at, resolution)
		      VALUES ($1,$2,$3,$4,$5,$6,'Atenção Lda',$7,$8,$9, CASE WHEN $9::text IS NULL THEN NULL ELSE now() END, $10)`,
			id, a.origin, project, a.status, a.env, "at"+id[:8], id[:8]+"@example.test", a.bound, info, resolution)
		cleanup = append(cleanup, func() { _, _ = pool.Exec(ctx, `DELETE FROM merchant_applications WHERE id=$1`, id) })
	}

	// KYB: one Business with two pending documents counts once; a valid
	// document does not count.
	m := uuid.NewString()
	exec(`INSERT INTO merchants (id, name, email, status) VALUES ($1,'Atenção KYB',$2,'ACTIVE')`, m, m+"@example.test")
	cleanup = append(cleanup, func() { _, _ = pool.Exec(ctx, `DELETE FROM merchants WHERE id=$1`, m) })
	for _, st := range []string{"PENDING_REVIEW", "PENDING_REVIEW", "VALID"} {
		d := seedKybDoc(t, pool, m, st)
		cleanup = append(cleanup, func() { _, _ = pool.Exec(ctx, `DELETE FROM merchant_kyb_documents WHERE id=$1`, d) })
	}

	// KYC: a submitted case counts; one waiting for the consumer's documents does not.
	for _, st := range []string{"UNDER_REVIEW", "WAITING_DOCUMENTS"} {
		id := uuid.NewString()
		exec(`INSERT INTO kyc_cases (id, operator_id, subject_id, environment, status) VALUES ($1,'banzami',$2,'SANDBOX',$3)`, id, uuid.NewString(), st)
		cleanup = append(cleanup, func() { _, _ = pool.Exec(ctx, `DELETE FROM kyc_cases WHERE id=$1`, id) })
	}

	// Risk: an unresolved flag counts; a resolved one does not.
	for _, resolved := range []bool{false, true} {
		id := uuid.NewString()
		exec(`INSERT INTO risk_flags (id, entity_type, entity_id, flag_type, description, resolved) VALUES ($1,'MERCHANT',$2,'VELOCITY_BREACH','teste',$3)`, id, uuid.NewString(), resolved)
		cleanup = append(cleanup, func() { _, _ = pool.Exec(ctx, `DELETE FROM risk_flags WHERE id=$1`, id) })
	}

	// Application settlements: one stuck in flight counts; completed and failed do not.
	for _, st := range []string{"PENDING", "COMPLETED", "FAILED"} {
		id := uuid.NewString()
		exec(`INSERT INTO app_settlements (id, owner_ref, source_account_id, beneficiary_account_id,
		        gross_amount_minor, application_fee_minor, net_amount_minor, currency, engine_version,
		        pricing_snapshot_json, status, environment, idempotency_key)
		      VALUES ($1,'attention',$2,$3,1000,0,1000,'AOA',1,'{}'::jsonb,$4,'SANDBOX',$5)`,
			id, uuid.NewString(), uuid.NewString(), st, "attention-"+id)
		cleanup = append(cleanup, func() { _, _ = pool.Exec(ctx, `DELETE FROM app_settlements WHERE id=$1`, id) })
	}

	after := attentionNow(t, svc)
	for key, want := range map[string]int{
		"business_applications":   3,
		"kyb_documents":           1,
		"kyc_documents":           1,
		"risk_flags":              1,
		"application_settlements": 1,
	} {
		if got := after[key] - before[key]; got != want {
			t.Errorf("%s: +%d, want +%d", key, got, want)
		}
	}

	// The other environment sees its own SUBMITTED application and nothing of ours.
	live := NewAttentionService(pool, "LIVE")
	var liveApps int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM merchant_applications WHERE environment='LIVE' AND `+AttentionApplicationsSQL).Scan(&liveApps); err != nil {
		t.Fatal(err)
	}
	if got := attentionNow(t, live)["business_applications"]; got != liveApps {
		t.Errorf("LIVE attention = %d, want the LIVE rows only (%d)", got, liveApps)
	}
}

// The Candidaturas page filters with the same definition the badge counts.
func TestAttention_ApplicationsListMatchesTheBadge(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	for _, st := range []string{"SUBMITTED", "UNDER_REVIEW", "REJECTED", "INFORMATION_REQUIRED"} {
		id := uuid.NewString()
		info := any(nil)
		if st == "INFORMATION_REQUIRED" {
			info = "mais informação"
		}
		if _, err := pool.Exec(ctx, `INSERT INTO merchant_applications (id, origin, status, environment, desired_handle, business_name, email, information_request, information_requested_at)
		      VALUES ($1,'STANDALONE_BUSINESS',$2,'SANDBOX',$3,'Paridade',$4,$5, CASE WHEN $5::text IS NULL THEN NULL ELSE now() END)`,
			id, st, "pa"+id[:8], id[:8]+"@example.test", info); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM merchant_applications WHERE id=$1`, id) })
	}
	count := attentionNow(t, NewAttentionService(pool, "SANDBOX"))["business_applications"]
	list, err := NewPostgresMerchantApplicationAdminService(pool, nil).List(ctx, AttentionFilter, "SANDBOX")
	if err != nil {
		t.Fatal(err)
	}
	if count <= 200 && len(list) != count {
		t.Fatalf("badge %d, list with status=ATTENTION %d — the two must agree", count, len(list))
	}
	for _, a := range list {
		if a.Status == "REJECTED" || a.Status == "INFORMATION_REQUIRED" {
			t.Fatalf("the attention list holds a %s application", a.Status)
		}
	}
}

// A category whose table this environment does not have counts 0 instead of
// failing the whole summary (Postgres parses every relation in a statement).
func TestAttention_ToleratesAMissingTable(t *testing.T) {
	pool := dbPoolOrSkip(t)
	defer pool.Close()
	ctx := context.Background()
	var has bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.disputes') IS NOT NULL`).Scan(&has); err != nil {
		t.Fatal(err)
	}
	if has {
		if _, err := pool.Exec(ctx, `ALTER TABLE disputes RENAME TO disputes__hidden_for_attention_test`); err != nil {
			t.Skipf("cannot hide disputes: %v", err)
		}
		defer func() {
			if _, err := pool.Exec(context.Background(), `ALTER TABLE disputes__hidden_for_attention_test RENAME TO disputes`); err != nil {
				t.Errorf("could not restore disputes: %v", err)
			}
		}()
	}
	if got := attentionNow(t, NewAttentionService(pool, "SANDBOX"))["disputes"]; got != 0 {
		t.Fatalf("disputes without a table = %d, want 0", got)
	}
}
