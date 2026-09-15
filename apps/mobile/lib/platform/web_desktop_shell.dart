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

  // ── Device geometry (one canonical spec, iPhone-like proportions) ───────────
  static const double _phoneW = 390; // logical points the app lays out at
  static const double _phoneH = 844;
  static const double _bezel = 14;
  static const double _outerRadius = 56;
  static const double _innerRadius = 44;
  static const double _topSafe = 50; // status area; the app's SafeArea uses this
  static const double _bottomSafe = 26; // home-indicator area
  static const double _wideBreakpoint = 640;

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
        // One presentation for both the direct desktop view and the homepage
        // embed: the phone floats on a canvas with the same shadow. The embed
        // keeps that canvas TRANSPARENT so the homepage hero shows through and
        // the device is pixel-identical to app.banzami.com — no drift. The pad
        // leaves room for the drop shadow so it is never clipped.
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
            padding: const EdgeInsets.all(34.0),
            child: Center(
              // Scale the whole device (bezel + app) to fit, keeping aspect.
              // FittedBox is a Flutter transform: CanvasKit re-rasterises at
              // device pixels (no blur) and pointer hit-testing is transformed
              // correctly (DEVICE_SHELL_POINTER_ALIGNMENT).
              child: FittedBox(fit: BoxFit.contain, child: device),
            ),
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
    const w = WebDesktopShell._phoneW + WebDesktopShell._bezel * 2;
    const h = WebDesktopShell._phoneH + WebDesktopShell._bezel * 2;
    return SizedBox(
      width: w,
      height: h,
      child: DecoratedBox(
        // The device body: near-black bezel with a subtle depth shadow.
        decoration: BoxDecoration(
          color: const Color(0xFF0A0A0B),
          borderRadius: BorderRadius.circular(WebDesktopShell._outerRadius),
          // The SAME floating shadow in both modes, so the homepage embed is
          // pixel-identical to app.banzami.com (the reference). The standalone
          // values are unchanged; the embed now shares them instead of null.
          boxShadow: const [
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
              width: WebDesktopShell._phoneW,
              height: WebDesktopShell._phoneH,
              child: Stack(
                children: [
                  // The REAL app. It believes it is a notched phone: the safe
                  // areas keep its header/nav clear of the island and the
                  // home-indicator (the app already reads MediaQuery padding).
                  Positioned.fill(
                    child: MediaQuery(
                      data: MediaQuery.of(context).copyWith(
                        size: const Size(WebDesktopShell._phoneW, WebDesktopShell._phoneH),
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
