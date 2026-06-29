package handler

import (
	"net/http"

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
func (h *PlatformHandler) Mode(w http.ResponseWriter, r *http.Request) {
	mode := "SANDBOX"
	if h.svc != nil {
		mode = h.svc.Mode(r.Context())
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
