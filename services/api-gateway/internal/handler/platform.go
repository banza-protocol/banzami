package handler

import (
	"net/http"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
	"github.com/banzami/banzami/services/api-gateway/internal/service"
)

// PlatformHandler exposes the public platform mode so the website (and future
// apps/SDKs) can render a SANDBOX banner without a rebuild. It never leaks any
// internal config — only mode + a public banner label/message.
type PlatformHandler struct {
	svc *service.PlatformReadService
}

func NewPlatformHandler(svc *service.PlatformReadService) *PlatformHandler {
	return &PlatformHandler{svc: svc}
}

// GET /v1/platform-mode  (public, no auth)
//
// An unreadable mode answers 503 PLATFORM_MODE_UNAVAILABLE, never a guessed
// SANDBOX (A2-17): the proof verifier chooses which stack to ask from this, and
// a guess sent it to the Sandbox stack whatever the platform was. Readers that
// only draw a banner already treat any non-2xx as Sandbox — the restricted
// answer — so they are unaffected.
func (h *PlatformHandler) Mode(w http.ResponseWriter, r *http.Request) {
	mode, ok := h.svc.Lookup(r.Context())
	if !ok {
		w.Header().Set("Cache-Control", "no-store")
		apierror.Respond(w, r, http.StatusServiceUnavailable, "PLATFORM_MODE_UNAVAILABLE",
			"the platform mode could not be read")
		return
	}
	sandbox := mode == "SANDBOX"
	// Short cache: the mode changes rarely; readers pick up a change within ~30s.
	w.Header().Set("Cache-Control", "public, max-age=30")
	// Production is silent: LIVE returns only {mode, public_banner:false}. SANDBOX
	// is the only state communicated, with a public message.
	resp := map[string]any{
		"mode":          mode,
		"public_banner": sandbox,
	}
	if sandbox {
		resp["message"] = "Esta plataforma encontra-se em ambiente de testes."
	}
	writeJSON(w, http.StatusOK, resp)
}
