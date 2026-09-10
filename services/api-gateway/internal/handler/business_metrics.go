package handler

import (
	"context"

	"github.com/banzami/banzami/services/api-gateway/internal/service"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Business onboarding and Business App counters.
//
// What they answer: are applications arriving, being reviewed, approved or
// refused; are Business logins succeeding; is anyone reaching for another
// Business's wallet; are documents arriving. Each has been, at some point, a
// question that could only be answered by reading logs one line at a time.
//
// Every label is a closed vocabulary written in this file. No application id,
// merchant id, handle, email, NIF or IP ever becomes a label: that would copy
// personal and institutional identifiers into every scrape and dashboard, and
// make the series count grow with the customer base.
var (
	businessApplicationEvents = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_business_application_events_total",
		Help: "Business application lifecycle actions by action and result.",
	}, []string{"action", "result"})

	businessAuthAttempts = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_business_auth_total",
		Help: "Business App handle+PIN sign-in attempts by result.",
	}, []string{"result"})

	businessTenantDenials = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_business_tenant_denials_total",
		Help: "Requests refused because the resource belongs to another Business.",
	}, []string{"surface"})

	businessLinkCodes = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_business_link_codes_total",
		Help: "Business consent codes for connecting a Developer Project, by result.",
	}, []string{"result"})

	businessApplicationDocuments = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "banzami_business_application_documents_total",
		Help: "Business application document uploads by result.",
	}, []string{"result"})
)

// Closed label vocabularies.
const (
	appActionSubmit             = "submit"
	appActionStartReview        = "start_review"
	appActionApprove            = "approve"
	appActionLink               = "link_existing"
	appActionReject             = "reject"
	appActionReissueActivation  = "reissue_activation"
	appActionRequestInformation = "request_information"
	appActionResubmit           = "resubmit"

	appResultOK       = "ok"
	appResultReplayed = "replayed" // an approval/link pressed again: nothing new happened
	appResultRefused  = "refused"  // the request was answered with a reasoned 4xx
	appResultFailed   = "failed"   // 5xx — something the operator must look at

	authResultIssued         = "issued"
	authResultRefused        = "refused"
	authResultLocked         = "locked"
	authResultOwnerMismatch  = "handle_owner_mismatch"
	authResultRefreshed      = "refreshed"
	authResultRefreshRefused = "refresh_refused"
	authResultRefreshReused  = "refresh_reused"

	tenantSurfaceWallet      = "wallet"
	tenantSurfaceQr          = "qr"
	tenantSurfacePaymentLink = "payment_link"
	tenantSurfaceCollection  = "collection"

	linkResultIssued   = "issued"
	linkResultRedeemed = "redeemed"
	linkResultRefused  = "refused"
	linkResultNotReady = "business_not_ready"

	docResultUploaded       = "uploaded"
	docResultContentRefused = "content_mismatch"
	docResultRefused        = "refused"
	docResultStorageOff     = "storage_unavailable"
	docResultFailed         = "failed"
)

// lifecycleActionLabel maps the human action phrase used in error messages to
// its metric label. Read-only actions are not counted.
var lifecycleActionLabel = map[string]string{
	"approve":                 appActionApprove,
	"reject":                  appActionReject,
	"start review of":         appActionStartReview,
	"link":                    appActionLink,
	"reissue activation for":  appActionReissueActivation,
	"request information for": appActionRequestInformation,
}

func observeApplication(action, result string) {
	businessApplicationEvents.WithLabelValues(action, result).Inc()
}

// walletReader is what an ownership check needs from the wallet service.
type walletReader interface {
	Get(ctx context.Context, id string) (*service.WalletRecord, error)
}

// ownsWallet reports whether the wallet exists and belongs to merchantID. Any
// lookup failure is "no": an ownership check that fails open is not one.
func ownsWallet(ctx context.Context, wallets walletReader, walletID, merchantID string) bool {
	if wallets == nil || walletID == "" || merchantID == "" {
		return false
	}
	w, err := wallets.Get(ctx, walletID)
	return err == nil && w != nil && w.MerchantID == merchantID
}
