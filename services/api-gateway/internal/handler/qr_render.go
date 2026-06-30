package handler

import (
	"fmt"
	"net/http"
	"strings"

	qrcode "github.com/skip2/go-qrcode"

	"github.com/banzami/banzami/services/api-gateway/internal/apierror"
)

// renderQR renders `value` as a scannable QR in the requested format and writes the
// response. Returns true when it handled the request (wrote an image or an error),
// false when `format` is empty/unknown so the caller can fall back to JSON.
//
// PNG and SVG are produced server-side (the app never renders a financial QR). PDF
// is intentionally not yet supported without a real PDF toolchain (returns 415).
func renderQR(w http.ResponseWriter, r *http.Request, value, format string) bool {
	switch format {
	case "png":
		png, err := qrcode.Encode(value, qrcode.Medium, 512)
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
		svg, err := qrSVG(value)
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

// qrSVG builds a crisp, vector QR (scannable) from the QR bit matrix — quiet zone
// included. Brand-neutral black on white; an operator may restyle later.
func qrSVG(value string) (string, error) {
	q, err := qrcode.New(value, qrcode.Medium)
	if err != nil {
		return "", err
	}
	bm := q.Bitmap()
	n := len(bm)
	const quiet = 4
	size := n + quiet*2

	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" shape-rendering="crispEdges" role="img" aria-label="Payment QR">`, size, size)
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="#FFFFFF"/>`, size, size)
	b.WriteString(`<path fill="#000000" d="`)
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			if bm[y][x] {
				fmt.Fprintf(&b, "M%d %dh1v1h-1z", x+quiet, y+quiet)
			}
		}
	}
	b.WriteString(`"/></svg>`)
	return b.String(), nil
}
