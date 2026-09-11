import 'package:flutter/material.dart';

import '../../branding_assets.dart';

/// Covers the Business App whenever it is not in the foreground, so the app
/// switcher's snapshot never shows the balance, payments or a customer's
/// @banza — the same protection the consumer app has
/// (SecureAppLifecycleGuard's privacy overlay).
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
    // Android does. Only a resumed app shows its content.
    final covered = state != AppLifecycleState.resumed;
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
