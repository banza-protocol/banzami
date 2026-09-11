package documents

import (
	_ "embed"
	"encoding/base64"
	"fmt"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

// The official Banzami marks embedded at the centre of the QR — the SAME assets
// the apps use (apps/mobile/assets/banzami/icon.png and business/business_logo.png,
// downscaled), NOT a recreation. Consumer = the Banzami app icon; merchant = the
// Banzami Business logo.
//
//go:embed qr_logo_consumer.png
var qrLogoConsumerPNG []byte

//go:embed qr_logo_merchant.png
var qrLogoMerchantPNG []byte

var (
	qrLogoConsumerURI = "data:image/png;base64," + base64.StdEncoding.EncodeToString(qrLogoConsumerPNG)
	qrLogoMerchantURI = "data:image/png;base64," + base64.StdEncoding.EncodeToString(qrLogoMerchantPNG)
)

// QRLogo selects which official mark is embedded at the centre.
type QRLogo int

const (
	QRLogoConsumer QRLogo = iota // Banzami app icon (default)
	QRLogoMerchant               // Banzami Business logo
)

func (l QRLogo) dataURI() string {
	if l == QRLogoMerchant {
		return qrLogoMerchantURI
	}
	return qrLogoConsumerURI
}

// Canonical Banzami QR Engine (server-side, SVG-first).
//
// This is the single authorized source for rendering a Banzami QR across every
// server surface (PDF receipts, the gateway /qr endpoint that apps and web
// consume). It encodes the design-system spec so a QR looks identical wherever
// it appears — see docs/architecture/qr-engine.md.
//
// Spec (never diverge per-surface):
//   - Error correction: H (30%) — mandatory, because a centre logo occludes the
//     matrix. Never L/M.
//   - Quiet zone: 4 modules.
//   - Data modules: #111111 (near-black, max contrast/scan).
//   - Finder "eyes": Banzami Hero Red #B5101F.
//   - Background: #FFFFFF.
//   - Centre logo: the official Banzami mark, on a white padded box, occupying a
//     small fraction of the symbol (well within the H budget).
//   - SVG is the official format (infinite scale, perfect print/PDF). PNG is a
//     raster fallback only.
const (
	QRColorData   = "#111111"
	QRColorFinder = "#B5101F"
	QRColorBg     = "#FFFFFF"
	QRQuietZone   = 4 // modules, fixed for the whole ecosystem

	// qrLogoBoxFraction is the side of the centre white logo box as a fraction of
	// the symbol side. 0.22 → ~4.8% area occlusion, far inside the H (~30%) budget
	// and clear of the three corner finder patterns.
	qrLogoBoxFraction = 0.22
)

// Canonical pixel-size presets. Every app picks one of these; nothing invents
// its own size. (SVG scales losslessly, so these set the rendered width/height.)
const (
	QRSizeSM    = 96
	QRSizeMD    = 160
	QRSizeLG    = 256
	QRSizeXL    = 512
	QRSizePrint = 1024
)

// QROptions configures a render. Size is the rendered width/height in px
// (defaults to QRSizeLG); ShowLogo toggles the centre Banzami mark (default on —
// pass false only for a caller that truly cannot afford any occlusion).
type QROptions struct {
	Size     int
	ShowLogo bool
	// Logo selects which official mark to embed (default QRLogoConsumer).
	Logo QRLogo
}

// QRCodeSVG renders payload as the canonical branded Banzami QR (SVG string).
// ECC H, quiet zone 4, red finders, #111111 data, white bg, centre logo. The
// SVG is deterministic for a given (payload, opts) so every surface that calls
// it produces a byte-identical QR.
func QRCodeSVG(payload string, opts QROptions) (string, error) {
	size := opts.Size
	if size <= 0 {
		size = QRSizeLG
	}

	q, err := qrcode.New(payload, qrcode.Highest) // ECC H
	if err != nil {
		return "", err
	}
	q.DisableBorder = true // we add a fixed 4-module quiet zone ourselves
	bm := q.Bitmap()
	sym := len(bm)
	if sym == 0 {
		return "", fmt.Errorf("qrengine: empty bitmap")
	}
	total := sym + 2*QRQuietZone

	isFinder := func(sx, sy int) bool {
		topLeft := sx < 7 && sy < 7
		topRight := sx >= sym-7 && sy < 7
		bottomLeft := sx < 7 && sy >= sym-7
		return topLeft || topRight || bottomLeft
	}

	var b strings.Builder
	fmt.Fprintf(&b,
		`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" shape-rendering="crispEdges" role="img" aria-label="Banzami QR">`,
		size, size, total, total)
	// Background (includes the quiet zone).
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="%s"/>`, total, total, QRColorBg)

	// Modules. Group by colour so the SVG stays compact.
	var data, finder strings.Builder
	for sy := 0; sy < sym; sy++ {
		for sx := 0; sx < sym; sx++ {
			if !bm[sy][sx] {
				continue
			}
			x, y := sx+QRQuietZone, sy+QRQuietZone
			rect := fmt.Sprintf(`<rect x="%d" y="%d" width="1" height="1"/>`, x, y)
			if isFinder(sx, sy) {
				finder.WriteString(rect)
			} else {
				data.WriteString(rect)
			}
		}
	}
	fmt.Fprintf(&b, `<g fill="%s">%s</g>`, QRColorData, data.String())
	fmt.Fprintf(&b, `<g fill="%s">%s</g>`, QRColorFinder, finder.String())

	if opts.ShowLogo {
		b.WriteString(qrLogoGroup(sym, total, opts.Logo))
	}

	b.WriteString(`</svg>`)
	return b.String(), nil
}

// qrLogoGroup renders the white logo box + the official Banzami mark (the real
// embedded asset, not a recreation) centred on the symbol. Coordinates are in
// module units (the SVG viewBox unit).
func qrLogoGroup(sym, total int, logo QRLogo) string {
	box := float64(sym) * qrLogoBoxFraction
	c := float64(total) / 2
	x := c - box/2
	y := c - box/2
	rx := box * 0.2

	// The mark sits inside the white box with a small uniform margin.
	pad := box * 0.12
	img := box - 2*pad

	// Round the embedded mark's corners (≈ app icon rounding) so it matches the
	// polished look of the in-app QR, via a clip-path.
	imgX, imgY := x+pad, y+pad
	imgRx := img * 0.22

	var b strings.Builder
	fmt.Fprintf(&b,
		`<clipPath id="bzqr-logo"><rect x="%.3f" y="%.3f" width="%.3f" height="%.3f" rx="%.3f"/></clipPath>`,
		imgX, imgY, img, img, imgRx)
	// White padded box (with a faint border so it reads on busy symbols).
	fmt.Fprintf(&b,
		`<rect x="%.3f" y="%.3f" width="%.3f" height="%.3f" rx="%.3f" fill="%s" stroke="#F2E7E7" stroke-width="%.3f"/>`,
		x, y, box, box, rx, QRColorBg, box*0.02)
	// The official mark, embedded as an image (identical to the app asset), with
	// rounded corners clipped in.
	fmt.Fprintf(&b,
		`<image x="%.3f" y="%.3f" width="%.3f" height="%.3f" href="%s" preserveAspectRatio="xMidYMid slice" clip-path="url(#bzqr-logo)"/>`,
		imgX, imgY, img, img, logo.dataURI())
	return b.String()
}

// QRCodePNG renders payload as a raster QR at the given pixel size. ECC H and
// quiet zone are preserved; brand styling (red finders, centre logo) is
// SVG-only, so PNG is a plain high-contrast fallback for callers that require a
// bitmap. Prefer QRCodeSVG everywhere possible.
func QRCodePNG(payload string, size int) ([]byte, error) {
	if size <= 0 {
		size = QRSizeXL
	}
	return qrcode.Encode(payload, qrcode.Highest, size)
}
