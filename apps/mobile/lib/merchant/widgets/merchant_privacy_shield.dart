import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart' show AppPrivacyPolicy;

import '../../branding_assets.dart';

/// Covers the Business App whenever it is not in the foreground, so the app
/// switcher's snapshot never shows the balance, payments or a customer's
/// @banza — the same protection the consumer app has
/// (SecureAppLifecycleGuard's privacy overlay).
///
/// Gated on the SAME single policy the consumer uses
/// ([AppPrivacyPolicy.active.backgroundPrivacyShieldEnabled]) so the Business
/// behaves identically: in the Public Sandbox the shield is OFF (backgrounding
/// is not a security event), and it turns on only when a future Live policy
/// enables it. No bespoke per-app rule.
class MerchantPrivacyShield extends StatefulWidget {
  final Widget child;
  const MerchantPrivacyShield({super.key, required this.child});

  @override
  State<MerchantPrivacyShield> createState() => _MerchantPrivacyShieldState();
}

class _MerchantPrivacyShieldState extends State<MerchantPrivacyShield>
    with WidgetsBindingObserver {
  bool _covered = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // inactive is when iOS takes the app-switcher snapshot; paused/hidden when
    // Android does. Only a resumed app shows its content — AND only when policy
    // enables the shield (OFF in the Sandbox, matching the consumer app).
    final covered = AppPrivacyPolicy.active.backgroundPrivacyShieldEnabled &&
        state != AppLifecycleState.resumed;
    if (covered != _covered && mounted) setState(() => _covered = covered);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      textDirection: TextDirection.ltr,
      children: [
        widget.child,
        if (_covered) const _BusinessPrivacyCover(),
      ],
    );
  }
}

class _BusinessPrivacyCover extends StatelessWidget {
  const _BusinessPrivacyCover();

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: ColoredBox(
        color: const Color(0xFF3D0008),
        child: Center(
          child: SizedBox(
            width: 72,
            height: 72,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Image.asset(BrandingAssets.businessLogo),
            ),
          ),
        ),
      ),
    );
  }
}
