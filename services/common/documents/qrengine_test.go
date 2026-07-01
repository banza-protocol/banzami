package documents

import (
	"regexp"
	"strconv"
	"strings"
	"testing"
)

const qrTestPayload = "https://banzami.com/r/BZM-8V32-35WD"

func TestQRCodeSVG_CanonicalStyle(t *testing.T) {
	svg, err := QRCodeSVG(qrTestPayload, QROptions{Size: QRSizeLG, ShowLogo: true})
	if err != nil {
		t.Fatalf("QRCodeSVG: %v", err)
	}
	if !strings.HasPrefix(svg, "<svg") || !strings.Contains(svg, "viewBox=") {
		t.Fatal("not a well-formed svg")
	}
	// Design-system tokens must be present.
	for _, want := range []string{
		`fill="` + QRColorBg + `"`,     // white background
		`fill="` + QRColorData + `"`,   // #111111 data
		`fill="` + QRColorFinder + `"`, // Hero Red finders
	} {
		if !strings.Contains(svg, want) {
			t.Errorf("SVG missing token %q", want)
		}
	}
	// Centre logo present.
	if !strings.Contains(svg, "translate(") {
		t.Error("logo group missing when ShowLogo=true")
	}
}

func TestQRCodeSVG_NoLogoOption(t *testing.T) {
	svg, err := QRCodeSVG(qrTestPayload, QROptions{Size: QRSizeMD, ShowLogo: false})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(svg, "translate(") {
		t.Error("logo rendered despite ShowLogo=false")
	}
	// Still branded (finders + data), still has a symbol.
	if !strings.Contains(svg, QRColorFinder) || !strings.Contains(svg, QRColorData) {
		t.Error("no-logo QR lost its branding")
	}
}

// The quiet zone is fixed at 4 modules: every module rect is offset by >= 4, and
// none sits in the border.
func TestQRCodeSVG_QuietZone(t *testing.T) {
	svg, _ := QRCodeSVG(qrTestPayload, QROptions{Size: QRSizeLG, ShowLogo: true})
	re := regexp.MustCompile(`<rect x="(\d+)" y="(\d+)" width="1" height="1"`)
	m := re.FindAllStringSubmatch(svg, -1)
	if len(m) == 0 {
		t.Fatal("no module rects found")
	}
	minX, minY := 1<<30, 1<<30
	for _, g := range m {
		x, _ := strconv.Atoi(g[1])
		y, _ := strconv.Atoi(g[2])
		if x < minX {
			minX = x
		}
		if y < minY {
			minY = y
		}
	}
	if minX < QRQuietZone || minY < QRQuietZone {
		t.Errorf("quiet zone violated: minX=%d minY=%d, want >= %d", minX, minY, QRQuietZone)
	}
}

// The centre logo must stay within the ECC-H (~30%) occlusion budget so the QR
// remains decodable — this is the invariant that makes "logo + always readable"
// safe. Guards against a future edit blowing the box up.
func TestLogoWithinErrorCorrectionBudget(t *testing.T) {
	area := qrLogoBoxFraction * qrLogoBoxFraction
	if area > 0.30 {
		t.Fatalf("logo occludes %.1f%% of the symbol — exceeds the ECC-H ~30%% budget", area*100)
	}
}

// Same (payload, opts) → byte-identical SVG. This is what guarantees the PDF and
// the gateway /qr endpoint emit the exact same QR (both call this function).
func TestQRCodeSVG_Deterministic(t *testing.T) {
	a, _ := QRCodeSVG(qrTestPayload, QROptions{Size: QRSizeLG, ShowLogo: true})
	b, _ := QRCodeSVG(qrTestPayload, QROptions{Size: QRSizeLG, ShowLogo: true})
	if a != b {
		t.Error("QRCodeSVG is not deterministic")
	}
	c, _ := QRCodeSVG(qrTestPayload+"x", QROptions{Size: QRSizeLG, ShowLogo: true})
	if a == c {
		t.Error("different payloads produced identical SVG")
	}
}

func TestQRCodePNG(t *testing.T) {
	png, err := QRCodePNG(qrTestPayload, QRSizeXL)
	if err != nil || len(png) == 0 {
		t.Fatalf("QRCodePNG: err=%v len=%d", err, len(png))
	}
	if string(png[1:4]) != "PNG" {
		t.Error("not a PNG")
	}
}

func TestQRPresets(t *testing.T) {
	if QRSizeSM != 96 || QRSizeMD != 160 || QRSizeLG != 256 || QRSizeXL != 512 || QRSizePrint != 1024 {
		t.Error("canonical size presets changed unexpectedly")
	}
}
