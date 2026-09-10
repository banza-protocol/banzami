package service

import (
	"errors"
	"testing"
	"time"
)

// The requirements policy is one answer for every surface: what is missing is
// currently_due, what waits for the reviewer is pending_verification, what the
// reviewer refused (or asked about) is errors, and only an application with
// neither missing nor refused items can be decided on.

func completeApp() MerchantApplication {
	return MerchantApplication{
		Status: "SUBMITTED", BusinessName: "Loja", DesiredHandle: "loja", Category: "Retalho",
		Email: "l@example.test", Phone: "+244 923456789", Nif: "5001234567", Province: "Luanda",
		Municipality: "Talatona", Address: "Rua 1", LegalRepresentative: "João", RepresentativeRole: "Proprietário",
		BusinessActivity: "Loja",
	}
}

func codes(is []RequirementIssue) []string {
	out := []string{}
	for _, i := range is {
		out = append(out, i.Code)
	}
	return out
}

func TestRequirements_ACompleteApplicationWithUploadedDocumentsAwaitsTheReviewer(t *testing.T) {
	r := EvaluateRequirements(completeApp(), true, map[string]applicationDocState{
		"BUSINESS_REGISTRATION": {Status: "UPLOADED"}, "REPRESENTATIVE_ID": {Status: "ACCEPTED"},
	})
	if !r.Complete() || len(r.CurrentlyDue) != 0 {
		t.Fatalf("due=%v errors=%v", codes(r.CurrentlyDue), codes(r.Errors))
	}
	if got := codes(r.PendingVerification); len(got) != 1 || got[0] != "BUSINESS_REGISTRATION" {
		t.Fatalf("pending = %v", got)
	}
	if got := codes(r.Accepted); len(got) != 1 || got[0] != "REPRESENTATIVE_ID" {
		t.Fatalf("accepted = %v", got)
	}
}

func TestRequirements_MissingFieldsDocumentsAndTermsAreDue(t *testing.T) {
	a := completeApp()
	a.Nif, a.Address = "", "  "
	r := EvaluateRequirements(a, false, nil)
	want := map[string]bool{"nif": true, "address": true, "terms_accepted": true, "BUSINESS_REGISTRATION": true, "REPRESENTATIVE_ID": true}
	got := codes(r.CurrentlyDue)
	if len(got) != len(want) {
		t.Fatalf("due = %v", got)
	}
	for _, c := range got {
		if !want[c] {
			t.Fatalf("unexpected due item %s", c)
		}
	}
	if r.Complete() {
		t.Fatal("an incomplete application reported complete")
	}
}

func TestRequirements_ARefusedDocumentAndAnInformationRequestAreErrors(t *testing.T) {
	a := completeApp()
	a.Status, a.InformationRequest = "INFORMATION_REQUIRED", "O registo comercial está ilegível."
	r := EvaluateRequirements(a, true, map[string]applicationDocState{
		"BUSINESS_REGISTRATION": {Status: "REJECTED", RejectionReason: "ilegível"}, "REPRESENTATIVE_ID": {Status: "UPLOADED"},
	})
	if got := codes(r.Errors); len(got) != 2 || got[0] != "BUSINESS_REGISTRATION" || got[1] != "information_request" {
		t.Fatalf("errors = %v", got)
	}
	if r.Complete() {
		t.Fatal("a refused document must block a decision")
	}
}

func TestRequirements_EveryPolicyItemIsCheckedAndLabelled(t *testing.T) {
	seen := map[string]bool{}
	for _, it := range BusinessApplicationPolicy {
		if it.Label == "" || it.Capability == "" || seen[it.Code] {
			t.Fatalf("policy item %+v is unlabelled or duplicated", it)
		}
		seen[it.Code] = true
	}
	// An empty application is due on every item: none is silently skipped.
	r := EvaluateRequirements(MerchantApplication{}, false, nil)
	if len(r.CurrentlyDue) != len(BusinessApplicationPolicy) {
		t.Fatalf("%d of %d items due on an empty application", len(r.CurrentlyDue), len(BusinessApplicationPolicy))
	}
}

// ── the transitions, against Postgres ────────────────────────────────────────

func TestRequestInformation_HoldsTheReviewAndResubmitReturnsIt(t *testing.T) {
	f := newLifecycle(t)
	appID, _, _ := f.application("")
	seedRequiredDocs(f.ctx, t, f.pool, appID)
	svc := NewPostgresMerchantApplicationAdminService(f.pool, f.provisioner())

	if _, err := svc.RequestInformation(f.ctx, appID, "operator", "  "); !errors.Is(err, ErrInformationRequestRequired) {
		t.Fatalf("an empty request: %v", err)
	}
	if _, err := svc.RequestInformation(f.ctx, appID, "operator", "Envie o registo comercial actualizado."); err != nil {
		t.Fatal(err)
	}
	st, err := svc.PublicStatus(f.ctx, appID)
	if err != nil {
		t.Fatal(err)
	}
	if st.Status != "INFORMATION_REQUIRED" || st.InformationRequest == "" {
		t.Fatalf("status %+v", st)
	}
	// Held: it cannot be approved until it is resubmitted.
	if _, err := svc.Approve(f.ctx, appID, "operator", time.Hour); !errors.Is(err, ErrApplicationNotOpen) {
		t.Fatalf("approval while waiting for information: %v", err)
	}
	// A required document refused meanwhile blocks the resubmission.
	f.exec(`UPDATE merchant_application_documents SET status='REJECTED', rejection_reason='ilegível'
	         WHERE application_id=$1 AND document_type='BUSINESS_REGISTRATION'`, appID)
	if _, err := svc.Resubmit(f.ctx, appID); !errors.Is(err, ErrRequiredDocumentsMissing) {
		t.Fatalf("resubmitting with a refused document: %v", err)
	}
	f.exec(`UPDATE merchant_application_documents SET status='UPLOADED', rejection_reason=NULL
	         WHERE application_id=$1 AND document_type='BUSINESS_REGISTRATION'`, appID)
	st, err = svc.Resubmit(f.ctx, appID)
	if err != nil || st.Status != "SUBMITTED" || st.InformationRequest != "" {
		t.Fatalf("resubmit: %+v %v", st, err)
	}
	if _, err := svc.Resubmit(f.ctx, appID); !errors.Is(err, ErrNothingToResubmit) {
		t.Fatalf("resubmitting twice: %v", err)
	}
}

func TestPublicStatus_NamesNoPersonalData(t *testing.T) {
	f := newLifecycle(t)
	appID, _, email := f.application("")
	svc := NewPostgresMerchantApplicationAdminService(f.pool, f.provisioner())
	st, err := svc.PublicStatus(f.ctx, appID)
	if err != nil {
		t.Fatal(err)
	}
	for _, v := range []string{st.ApplicationID, st.Status, st.RequestedHandle, st.InformationRequest} {
		if v == email {
			t.Fatal("the public status carried the applicant's email")
		}
	}
	if _, err := svc.PublicStatus(f.ctx, "not-a-uuid"); !errors.Is(err, ErrApplicationNotFound) {
		t.Fatalf("a malformed reference: %v", err)
	}
}
