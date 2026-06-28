import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

// The full SANDBOX banner now lives in the SDK as the single shared component
// `BanzamiSandboxBanner` (package:banzami_flutter) — used by the Consumer home,
// Consumer profile and Merchant dashboard. This file only keeps the small inline
// badge below.

/// Small inline badge — appended contextually where financial content appears
/// (QR embeds, transaction rows, etc.).
class SandboxBadge extends StatelessWidget {
  const SandboxBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color:        const Color(0xFFFFF4D6),
        borderRadius: BanzamiRadius.fullAll,
        border:       Border.all(color: const Color(0xFFF6C453)),
      ),
      child: const Text(
        'SANDBOX',
        style: TextStyle(
          fontSize:      9,
          fontWeight:    FontWeight.w700,
          color:         Color(0xFF92400E),
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}
