import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart' show BanzamiColors;

/// On a wide browser viewport, present the App Banzami surface centred at phone
/// width on a neutral Banzami canvas (WEB-APP-001 §31/§42). This is NOT a nested
/// device frame (MOBILE_WEB_NESTED_DEVICE_FRAME=0) and NOT a desktop redesign —
/// it is the same Flutter UI, given a phone-shaped stage on large screens so it
/// is not stretched edge to edge. Narrow viewports (phones, and the homepage
/// portal) render full-bleed. A no-op off the Web, so iOS/Android are untouched.
class WebDesktopShell extends StatelessWidget {
  const WebDesktopShell({super.key, required this.child});

  final Widget child;

  /// Below this width the app is full-bleed (phones, embedded portal).
  static const double _wideBreakpoint = 640;

  /// The phone-width the surface is constrained to on large screens.
  static const double _surfaceWidth = 430;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return child;
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < _wideBreakpoint) return child;
        final vPad = constraints.maxHeight > 900 ? 28.0 : 0.0;
        final innerHeight = (constraints.maxHeight - vPad * 2).clamp(0.0, double.infinity);
        final radius = vPad > 0 ? 28.0 : 0.0;
        return DecoratedBox(
          decoration: const BoxDecoration(
            // A soft, brand-tinted neutral canvas — not a device mockup.
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [BanzamiColors.offWhite, BanzamiColors.gray100],
            ),
          ),
          child: Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: vPad),
              child: Container(
                width: _surfaceWidth,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(radius),
                  boxShadow: vPad > 0
                      ? const [
                          BoxShadow(
                            color: Color(0x22000000),
                            blurRadius: 48,
                            spreadRadius: 0,
                            offset: Offset(0, 18),
                          ),
                        ]
                      : null,
                ),
                clipBehavior: Clip.antiAlias,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(radius),
                  // The app inside believes it is a phone-width surface, so its
                  // own responsive layout behaves exactly as on a device.
                  child: MediaQuery(
                    data: MediaQuery.of(context).copyWith(
                      size: Size(_surfaceWidth, innerHeight),
                    ),
                    child: SizedBox(
                      width: _surfaceWidth,
                      height: innerHeight,
                      child: child,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
