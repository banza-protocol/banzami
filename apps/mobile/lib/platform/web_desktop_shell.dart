import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Brightness, SystemChrome;
import 'package:banzami_flutter/banzami_flutter.dart' show BanzamiColors;

import 'web_location.dart';

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
  //     gently wider, slightly shorter portrait phone (388×828). The app lays out
  //     for real at 388 wide, so the balance, CTAs, banner and rows adapt
  //     naturally. It stays unmistakably a normal portrait phone (height well
  //     above width — not chunky, never a tablet), and shares the exact bezel /
  //     island / radius language.
  static const double _phoneW = 390; // DIRECT: logical points the app lays out at
  static const double _phoneH = 844;
  static const double _heroPhoneW = 388; // HERO: gently wider, slightly shorter
  static const double _heroPhoneH = 828;
  static const double _bezel = 14;
  // Corner radii match the approved mock's ratios (outer 46/300, inner 38/280),
  // scaled to this device's logical width so the rendered corners read identically.
  static const double _outerRadius = 64;
  static const double _innerRadius = 53;
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
            // bezel — visible. Its on-page size is driven by the container. No
            // app switcher here: the marketing hero shows the phone alone.
            ? Center(child: FittedBox(fit: BoxFit.contain, child: device))
            // Standalone (app.banzami.com): the Personal↔Business switcher lives
            // in the OUTER web shell — above the phone frame, on the neutral
            // canvas — never inside the app viewport (APP-BANZAMI-WEB-DUAL-SHELL-001).
            // The two apps stay distinct; the switch is a hard navigation between
            // `/` and `/business`, each booting its own app.
            : Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const _WebAppSwitcher(),
                    const SizedBox(height: 18),
                    Flexible(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(
                            maxWidth: _maxSlotW, maxHeight: _maxSlotH),
                        child: FittedBox(fit: BoxFit.contain, child: device),
                      ),
                    ),
                  ],
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
                  // Status bar — ONE shell, every web surface (hero embed AND
                  // app.banzami.com). A REAL, live clock (never a fixed "9:41")
                  // with decorative signal/Wi-Fi/battery, flanking the island like
                  // iOS. Its colour adapts to the current screen (dark on the light
                  // home, white on the red welcome) via the app's overlay style.
                  const Positioned(
                    top: 17,
                    left: 27,
                    right: 25,
                    child: IgnorePointer(child: _StatusBar()),
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
      width: 128,
      height: 36,
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A0B),
        borderRadius: BorderRadius.circular(20),
      ),
    );
  }
}

/// iOS-style status bar for the hero embed: a REAL clock (device time, ticking),
/// with decorative signal/Wi-Fi/battery. White, so it reads on the app's coloured
/// hero screen. The clock is the point — never a fixed "9:41".
class _StatusBar extends StatefulWidget {
  const _StatusBar();

  @override
  State<_StatusBar> createState() => _StatusBarState();
}

class _StatusBarState extends State<_StatusBar> {
  late DateTime _now;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    // Tick every second: keeps the clock honest AND lets the colour follow the
    // current screen (the overlay style changes on navigation) within ~1s.
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  // 24-hour local time, no leading zero on the hour (e.g. "9:41", "14:07").
  String get _clock => '${_now.hour}:${_now.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    // Follow the app's own status-bar intent: statusBarIconBrightness.light means
    // light (white) icons for a dark/coloured screen; .dark means dark icons for a
    // light screen (the home, matching the reference). Default: dark. The current
    // screen sets this via its overlay style (main default + per-screen
    // AnnotatedRegion), which the framework mirrors onto SystemChrome.latestStyle;
    // read is null-safe, so a future SDK that drops it just falls back to dark.
    // ignore: invalid_use_of_visible_for_testing_member
    final iconBrightness = SystemChrome.latestStyle?.statusBarIconBrightness ?? Brightness.dark;
    final color = iconBrightness == Brightness.light
        ? Colors.white
        : const Color(0xFF16110F);
    return DefaultTextStyle(
      style: TextStyle(
        fontFamily: 'Inter',
        color: color,
        fontWeight: FontWeight.w700,
        fontSize: 14,
        letterSpacing: 0.2,
        decoration: TextDecoration.none,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(_clock),
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _SignalBars(color: color),
              const SizedBox(width: 6),
              SizedBox(
                width: 17,
                height: 12,
                child: CustomPaint(painter: _WifiPainter(color)),
              ),
              const SizedBox(width: 6),
              _Battery(color: color),
            ],
          ),
        ],
      ),
    );
  }
}

/// iOS-style signal — four rising bars, the last gently faded. Matches the mock.
class _SignalBars extends StatelessWidget {
  const _SignalBars({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    const heights = [4.0, 6.5, 9.0, 11.0];
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (var i = 0; i < heights.length; i++) ...[
          if (i > 0) const SizedBox(width: 2),
          Container(
            width: 3,
            height: heights[i],
            decoration: BoxDecoration(
              color: color.withValues(alpha: i == 3 ? 0.4 : 1.0),
              borderRadius: BorderRadius.circular(1),
            ),
          ),
        ],
      ],
    );
  }
}

/// iOS-style Wi-Fi — three concentric arcs plus a dot. Matches the mock.
class _WifiPainter extends CustomPainter {
  _WifiPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;
    final cx = size.width / 2;
    final cy = size.height * 0.9;
    for (final r in [size.width * 0.5, size.width * 0.34, size.width * 0.18]) {
      canvas.drawArc(
        Rect.fromCircle(center: Offset(cx, cy), radius: r),
        math.pi * 1.25,
        math.pi * 0.5,
        false,
        stroke,
      );
    }
    canvas.drawCircle(Offset(cx, cy), 1.0, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_WifiPainter oldDelegate) => oldDelegate.color != color;
}

/// iOS-style battery — a thin rounded body, a full fill and a small nub. Matches
/// the mock (never the bulky Material `battery_full`).
class _Battery extends StatelessWidget {
  const _Battery({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 22,
          height: 11,
          decoration: BoxDecoration(
            border: Border.all(color: color.withValues(alpha: 0.45), width: 1),
            borderRadius: BorderRadius.circular(3),
          ),
          child: Padding(
            padding: const EdgeInsets.all(1.6),
            child: Container(
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(1.6),
              ),
            ),
          ),
        ),
        const SizedBox(width: 1.5),
        Container(
          width: 1.6,
          height: 4,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(1),
          ),
        ),
      ],
    );
  }
}

/// Personal ↔ Business switcher — OUTER web-shell chrome only. It sits above the
/// device frame on the neutral canvas, never inside the phone viewport, so the app
/// screens stay faithful to native mobile (which has no such control). Switching is
/// a real navigation between the two distinct apps (`/` and `/business`); the BFF
/// session cookie carries both authorities, so the destination boots straight in.
class _WebAppSwitcher extends StatelessWidget {
  const _WebAppSwitcher();

  @override
  Widget build(BuildContext context) {
    final segs = Uri.base.pathSegments.where((s) => s.isNotEmpty).toList();
    final isBusiness = segs.isNotEmpty && segs.first == 'business';
    // This chrome sits in a bare Column OUTSIDE the app's Navigator/Scaffold, so
    // it has no Material ancestor. Without one, Flutter paints Text with its
    // "missing Material" indicator — a yellow double-underline — which is exactly
    // the residual line seen under the labels. A transparent Material gives the
    // labels a proper text context so they render clean (the pill keeps its own
    // white fill below).
    return Material(
      type: MaterialType.transparency,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0xFFEEE4E4)),
          boxShadow: const [
            BoxShadow(color: Color(0x14000000), blurRadius: 14, offset: Offset(0, 4)),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _segment('Pessoal', !isBusiness, () => navigateToPath('/')),
            _segment('Business', isBusiness, () => navigateToPath('/business')),
          ],
        ),
      ),
    );
  }

  Widget _segment(String label, bool active, VoidCallback onTap) {
    final seg = AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 9),
      decoration: BoxDecoration(
        color: active ? BanzamiColors.primary : Colors.transparent,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        // Explicit Inter: this is OUTER shell chrome that must render legibly no
        // matter which app's theme happens to wrap it. Without a family it falls
        // back to Roboto, which is NOT bundled for Web and renders as blank/tofu
        // (WEB_SWITCH_VISIBLE_TEXT_RENDERING). Strong contrast in both states:
        // white on Banzami red when active, near-black on white when not.
        style: TextStyle(
          fontFamily: 'Inter',
          color: active ? Colors.white : BanzamiColors.gray900,
          fontWeight: FontWeight.w700,
          fontSize: 14,
          letterSpacing: 0.1,
          decoration: TextDecoration.none,
        ),
      ),
    );
    if (active) return seg;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(onTap: onTap, child: seg),
    );
  }
}
