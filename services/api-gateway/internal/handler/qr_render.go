package handler

import (
	"net/http"

	documents "github.com/banzami/banzami/services/common/documents"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
)

// renderQR renders `value` as a scannable QR in the requested format and writes
// the response. Returns true when it handled the request (wrote an image or an
// error), false when `format` is empty/unknown so the caller can fall back to
// JSON.
//
// Both formats go through the canonical Banzami QR Engine (the SAME code the PDF
// receipts use), so a QR served here is byte-for-byte the design-system QR:
// ECC H, quiet zone 4, red finders, #111111 data, centre logo (SVG). PNG is the
// raster fallback (high-contrast, unbranded — see docs/architecture/qr-engine.md).
// The app never renders a financial QR itself.
func renderQR(w http.ResponseWriter, r *http.Request, value, format string) bool {
	switch format {
	case "png":
		png, err := documents.QRCodePNG(value, documents.QRSizeXL)
		if err != nil {
			apierror.Respond(w, r, http.StatusInternalServerError, "QR_RENDER_FAILED", "could not render QR")
			return true
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "private, no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(png)
		return true
	case "svg":
		// The /qr endpoints are business-facing (payment sessions, merchant QR),
		// so they carry the Banzami Business mark.
		svg, err := documents.QRCodeSVG(value, documents.QROptions{Size: documents.QRSizeLG, ShowLogo: true, Logo: documents.QRLogoMerchant})
		if err != nil {
			apierror.Respond(w, r, http.StatusInternalServerError, "QR_RENDER_FAILED", "could not render QR")
			return true
		}
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Cache-Control", "private, no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(svg))
		return true
	case "pdf":
		apierror.Respond(w, r, http.StatusUnsupportedMediaType, "PDF_NOT_SUPPORTED",
			"PDF QR rendering is not yet available — use format=png or format=svg")
		return true
	default:
		return false
	}
}
