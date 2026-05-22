import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

/// Persistent amber ribbon displayed on every screen when the app is built
/// with ENVIRONMENT=sandbox. Never shown in LIVE builds.
///
/// Two variants:
///  - [SandboxBanner] — full-width card with icon + two lines of text.
///  - [SandboxRibbon] — compact single-line top bar for MainScreen overlay.
class SandboxBanner extends StatelessWidget {
  const SandboxBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:   double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.md, vertical: 10),
      decoration: BoxDecoration(
        color:        const Color(0xFFFEF3C7),
        borderRadius: BanzaRadius.lgAll,
        border:       Border.all(color: const Color(0xFFFCD34D)),
      ),
      child: Row(children: [
        const Icon(Icons.science_rounded, size: 16, color: Color(0xFF92400E)),
        const SizedBox(width: BanzaSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize:       MainAxisSize.min,
            children: [
              Text(
                'Ambiente de teste',
                style: BanzaTextStyles.label.copyWith(
                  color: const Color(0xFF92400E), fontSize: 12,
                ),
              ),
              Text(
                'O saldo e as transferências são simulados.',
                style: BanzaTextStyles.bodySm.copyWith(
                  color: const Color(0xFFB45309), fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ]),
    );
  }
}

/// Thin top ribbon — sits just below the status bar inside MainScreen.
class SandboxRibbon extends StatelessWidget {
  const SandboxRibbon({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:   double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 5),
      color:   const Color(0xFFFEF3C7),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.science_rounded, size: 11, color: Color(0xFF92400E)),
          const SizedBox(width: 5),
          Text(
            'SANDBOX · Dinheiro de teste · Sem valor real',
            style: BanzaTextStyles.label.copyWith(
              color:         const Color(0xFF92400E),
              fontSize:      10,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

/// Small inline badge — appended to screen titles or footers.
class SandboxBadge extends StatelessWidget {
  const SandboxBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color:        const Color(0xFFFEF3C7),
        borderRadius: BanzaRadius.fullAll,
        border:       Border.all(color: const Color(0xFFFCD34D)),
      ),
      child: Text(
        'SANDBOX',
        style: BanzaTextStyles.label.copyWith(
          color:         const Color(0xFF92400E),
          fontSize:      9,
          letterSpacing: 0.8,
          fontWeight:    FontWeight.w700,
        ),
      ),
    );
  }
}
