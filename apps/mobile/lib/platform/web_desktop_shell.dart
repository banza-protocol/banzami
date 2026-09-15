import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart' show BanzamiColors;

/// Presents App Banzami Web inside a realistic mobile DEVICE SHELL on desktop /
/// wide viewports (WEB-APP-001 device-shell milestone). The shell is pure
/// presentation — bezel, notch, safe areas, shadow, neutral canvas — and never
/// owns product/financial state; the real Flutter Consumer app renders inside.
///
/// Three modes, one primitive:
///  • native (not Web)           → the child, untouched (iOS/Android);
///  • narrow Web (real phone)    → full-bleed app, no device frame
///                                 (MOBILE_WEB_NESTED_DEVICE_FRAME=0);
///  • wide Web (desktop) OR the  → the phone shell: the app clipped inside a
///    homepage embed (?embed=phone)  bezel with a Dynamic-Island cutout and
///                                 safe areas, scaled to fit via a Flutter
///                                 transform (crisp CanvasKit, hit-test-correct).
///
/// The homepage hero loads app.banzami.com/?embed=phone so it shows this SAME
/// shell filling its iframe — one geometry, no drift, one Flutter runtime.
class WebDesktopShell extends StatelessWidget {
  const WebDesktopShell({super.key, required this.child});

  final Widget child;

  // ── Device geometry ─────────────────────────────────────────────────────────
  // Two portrait phone geometries, ONE Flutter app (same widgets, same design
  // system — only the logical viewport differs, so the app performs a REAL
  // responsive layout at each; nothing is ever stretched or scaled non-uniformly):
  //   • DIRECT (app.banzami.com)  → the accepted application device shell, a tall
  //     390×844 iPhone-like viewport. This must NOT change.
  //   • HERO (?embed=phone)       → a deliberate product-showcase geometry: a
  //     gently wider, slightly shorter portrait phone (410×800). The app lays out
  //     for real at 410 wide, so the balance, CTAs, banner and rows adapt
  //     naturally. It stays unmistakably a normal portrait phone (height well
  //     above width — not chunky, never a tablet), and shares the exact bezel /
  //     island / radius language.
  static const double _phoneW = 390; // DIRECT: logical points the app lays out at
  static const double _phoneH = 844;
  static const double _heroPhoneW = 410; // HERO: gently wider, slightly shorter
  static const double _heroPhoneH = 800;
  static const double _bezel = 14;
  static const double _outerRadius = 56;
  static const double _innerRadius = 44;
  static const double _topSafe = 50; // status area; the app's SafeArea uses this
  static const double _bottomSafe = 26; // home-indicator area
  static const double _wideBreakpoint = 640;

  // Cap for the standalone (app.banzami.com) device so it does not grow to fill
  // the whole window. Only the standalone view is capped; the hero embed fills
  // its own iframe (sized by the React container).
  static const double _maxSlotW = 352;
  static const double _maxSlotH = 734;

  static bool get _embedPhone {
    if (!kIsWeb) return false;
    return Uri.base.queryParameters['embed'] == 'phone';
  }

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return child;
    final embed = _embedPhone;
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= _wideBreakpoint;
        // Real phone browser (and not the homepage embed): full-bleed app.
        if (!embed && !wide) return child;

        final device = _PhoneDevice(embed: embed, app: child);
        // Two surfaces, one device (CanvasKit re-rasterises at device pixels, so
        // scaling stays crisp and hit-testing is transformed correctly —
        // DEVICE_SHELL_POINTER_ALIGNMENT):
        //  • hero embed — the phone fills the width of its iframe and is cropped
        //    at the bottom (fitWidth, top-aligned, clipped), so the React
        //    container's width sets how WIDE it is and its height sets how much
        //    of the phone shows: a wider, shorter phone that rises from the hero.
        //  • standalone (app.banzami.com) — the whole device, capped and centred
        //    on its off-white canvas with a drop shadow.
        final Widget content = embed
            // Hero embed: the WHOLE device, contain-fit (never cropped). The
            // React iframe is sized to the device's aspect ratio, so contain
            // fills it edge-to-edge with the complete phone — top bezel to bottom
            // bezel — visible. Its on-page size is driven by the container.
            ? Center(child: FittedBox(fit: BoxFit.contain, child: device))
            : Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                      maxWidth: _maxSlotW, maxHeight: _maxSlotH),
                  child: FittedBox(fit: BoxFit.contain, child: device),
                ),
              );
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: embed
                ? null
                : const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [BanzamiColors.offWhite, BanzamiColors.gray100],
                  ),
          ),
          child: Padding(
            // The embed fills the iframe edge-to-edge (width drives the size);
            // the standalone floats with a margin for its shadow.
            padding: EdgeInsets.all(embed ? 0.0 : 34.0),
            child: content,
          ),
        );
      },
    );
  }
}

class _PhoneDevice extends StatelessWidget {
  const _PhoneDevice({required this.embed, required this.app});

  final bool embed;
  final Widget app;

  @override
  Widget build(BuildContext context) {
    // Hero uses the wider/shorter showcase viewport; the direct app keeps the
    // accepted tall geometry. Bezel/island/radius language is shared.
    final screenW = embed ? WebDesktopShell._heroPhoneW : WebDesktopShell._phoneW;
    final screenH = embed ? WebDesktopShell._heroPhoneH : WebDesktopShell._phoneH;
    final w = screenW + WebDesktopShell._bezel * 2;
    final h = screenH + WebDesktopShell._bezel * 2;
    return SizedBox(
      width: w,
      height: h,
      child: DecoratedBox(
        // The device body: near-black bezel with a subtle depth shadow.
        decoration: BoxDecoration(
          color: const Color(0xFF0A0A0B),
          borderRadius: BorderRadius.circular(WebDesktopShell._outerRadius),
          // Standalone (app.banzami.com) floats on its off-white canvas with a
          // drop shadow. The hero embed has NO shadow: its canvas is transparent
          // and the shadow would clip against the iframe edge into a grey
          // rectangle over the marketing hero. The hero phone sits cleanly on the
          // hero background, nothing behind it.
          boxShadow: embed
              ? null
              : const [
                  BoxShadow(color: Color(0x33000000), blurRadius: 60, spreadRadius: 2, offset: Offset(0, 26)),
                  BoxShadow(color: Color(0x14000000), blurRadius: 10, offset: Offset(0, 4)),
                ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(WebDesktopShell._bezel),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(WebDesktopShell._innerRadius),
            // DEVICE_SHELL_CONTENT_OVERFLOW=0: the app is clipped to the screen.
            child: SizedBox(
              width: screenW,
              height: screenH,
              child: Stack(
                children: [
                  // The REAL app. It believes it is a notched phone: the safe
                  // areas keep its header/nav clear of the island and the
                  // home-indicator (the app already reads MediaQuery padding).
                  Positioned.fill(
                    child: MediaQuery(
                      data: MediaQuery.of(context).copyWith(
                        size: Size(screenW, screenH),
                        padding: const EdgeInsets.only(
                          top: WebDesktopShell._topSafe,
                          bottom: WebDesktopShell._bottomSafe,
                        ),
                        viewPadding: const EdgeInsets.only(
                          top: WebDesktopShell._topSafe,
                          bottom: WebDesktopShell._bottomSafe,
                        ),
                      ),
                      child: app,
                    ),
                  ),
                  // Decorative Dynamic Island — presentation only, never
                  // interactive, sits inside the top safe area.
                  const Positioned(
                    top: 11,
                    left: 0,
                    right: 0,
                    child: IgnorePointer(
                      child: Center(
                        child: _Island(),
                      ),
                    ),
                  ),
                  // Decorative home indicator.
                  Positioned(
                    bottom: 8,
                    left: 0,
                    right: 0,
                    child: IgnorePointer(
                      child: Center(
                        child: Container(
                          width: 134,
                          height: 5,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.28),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Island extends StatelessWidget {
  const _Island();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 122,
      height: 34,
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A0B),
        borderRadius: BorderRadius.circular(20),
      ),
    );
  }
}
