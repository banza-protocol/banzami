# Banzami QR Engine — the canonical QR of the ecosystem

**Status:** Phase 1 shipped (server engine) · **Version:** 1.0 · **Owner:** Banzami design system

A Banzami QR must look **identical** everywhere it appears — merchant app, consumer
app, PDF receipts, BANZADMIN, the pay/checkout web pages, DOA. Historically each
surface drew its own (different ECC, different colours, some with a logo, some
plain black). This document defines the single canonical spec and the engine that
enforces it.

> **Rule:** no application draws a QR by hand. It either calls the canonical
> engine for its platform, or — preferably — displays the SVG the operator
> renders. The QR is a design-system component, not a per-app implementation.

Note: the QR **payload** (what the code encodes — `banzami.com/r/…`, pay links, QR
schemes) is a separate concern owned by the BANZA protocol / operator payload
rules. This document is about **rendering** (the visual, which is Banzami product
/ design system, not a protocol concept).

---

## 1. Architecture — the server is the single renderer

```
                    ┌─────────────────────────────┐
                    │   Canonical QR Engine (Go)   │
                    │  services/common/documents   │
                    │   QRCodeSVG / QRCodePNG      │
                    └──────────────┬──────────────┘
                                   │ one spec, one output
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                         ▼
   PDF receipts            Gateway /qr endpoint         (future) any
   (documents engine)      png · svg  ─────────────┐    server surface
                                                    │
                          consumed as an image by:  ▼
                 pay/checkout web · DOA · BANZADMIN · apps
```

SVG is rendered **once**, server-side, from the design-system spec. Every surface
that can, displays that SVG (an `<img>`/inline SVG) instead of re-implementing a
renderer. This guarantees pixel parity and means a spec change is a one-line edit
in one place.

Native apps that must render offline (Flutter) use a platform widget that mirrors
the **exact same spec** (below) — see the roadmap.

---

## 2. The spec (never diverge per surface)

| Token | Value | Why |
|-------|-------|-----|
| **Error correction** | **H** (~30%) | A centre logo occludes the matrix; H is what makes that safe. Never L/M. |
| **Quiet zone** | **4 modules** | Fixed for the whole ecosystem; apps don't choose. |
| **Data modules** | `#111111` | Near-black — maximum contrast/scan, softer than pure black in print. |
| **Finder "eyes"** | `#B5101F` (Hero Red) | Brand identity; the three corner 7×7 patterns. |
| **Background** | `#FFFFFF` | — |
| **Centre logo** | Official Banzami mark on a white padded box | Single shared asset; ~4.8% area (0.22 side), far inside the H budget and clear of the finders. |
| **Format** | **SVG** (official), PNG (fallback) | SVG = infinite scale, perfect print/PDF/offset/laser/web. PNG only when a raster is required. |

### Size presets

Apps pick a preset; nothing invents its own size (SVG scales losslessly, so these
set the rendered width/height):

| Preset | px |
|--------|----|
| SM | 96 |
| MD | 160 |
| LG | 256 |
| XL | 512 |
| PRINT | 1024 |

---

## 3. The engine (Go, Phase 1)

`services/common/documents/qrengine.go` — the shared module already imported by
the gateway and public-api (it owns the PDF renderer too), so both server QR
consumers call one function.

```go
// Branded canonical SVG — red finders, #111111 data, white bg, ECC H,
// quiet zone 4, centre logo. Deterministic per (payload, opts).
documents.QRCodeSVG(payload, documents.QROptions{Size: documents.QRSizeLG, ShowLogo: true})

// Raster fallback (ECC H, high-contrast, unbranded). Prefer SVG.
documents.QRCodePNG(payload, documents.QRSizeXL)
```

Consumers wired in Phase 1:

- **PDF receipts** — `documents.go` `qrSVG` delegates to `QRCodeSVG`; the receipt
  CSS scales the SVG into its box. The PDF QR is now byte-identical to what the
  gateway serves.
- **Gateway `/qr` endpoint** — `internal/handler/qr_render.go` serves
  `QRCodeSVG` (svg) and `QRCodePNG` (png). Any web/app/admin surface that fetches
  `…/qr?format=svg` gets the canonical QR.

---

## 4. The PDF never draws its own QR

Before: the PDF built a separate matrix (ECC M, no logo) that differed from the
app. Now the PDF asks the engine for the SVG and embeds it. No parallel renderer.

---

## 5. Accessibility & readability

- ECC **H** + a logo occlusion capped at ~5% area (unit-tested) keeps the symbol
  decodable with the mark present.
- Quiet zone 4 is mandatory — the #1 cause of camera-scan failures is a missing
  quiet zone.
- `role="img"` + `aria-label="Banzami QR"` on the SVG.
- Near-black `#111111` on pure white keeps contrast well above scan thresholds.

---

## 6. Tests

`qrengine_test.go` guards the invariants that make the QR both branded and
readable: canonical tokens present, no logo when `ShowLogo=false`, quiet zone = 4
(no module inside the border), logo within the ECC-H budget, deterministic output
(so PDF == gateway), PNG magic bytes, and frozen size presets. `documents_test.go`
asserts the receipt embeds the canonical (grouped `#111111` + `#B5101F`) QR.

---

## 7. Roadmap — the rest of the ecosystem

Phase 1 (this doc) makes the **server** the single renderer and unifies the two
Go surfaces (PDF + gateway). Remaining phases make every other surface consume
that same output or match the same spec:

- **Phase 2 — Flutter.** One `BanzamiQr` widget in `sdk/flutter` (ECC H, red
  finders, `#111111` data, logo, presets). Migrate the merchant screens
  (`charge_screen`, `split_track_screen`) off raw `qr_flutter`, and align
  `BanzamiQrDisplay`. Consumer already routes through `BanzamiQrScheme`.
- **Phase 3 — Web (pay / checkout).** Replace `qrcode` / `react-qr-code` usages
  with the gateway SVG (`/qr?format=svg`) or a thin `<BanzamiQr>` React wrapper
  bound to the same tokens.
- **Phase 4 — DOA.** Campaign QR (`lib/campaigns/qr.ts`, `BanzamiQrCard.tsx`)
  consumes the gateway SVG instead of rendering its own PNG.

Until a surface is migrated it still produces a scannable QR — only the styling
lags. Each phase is independently shippable.

---

## 8. Final criterion

One engine, one spec. The PDF QR is visually identical to the QR the gateway
serves and the app displays: same ECC (H), same quiet zone (4), same colours
(`#111111` data, `#B5101F` finders), same centre logo, same brand. The QR is a
Banzami design-system component — not a per-application implementation.
