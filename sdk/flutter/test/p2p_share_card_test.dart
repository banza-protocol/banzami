// The Business "Receber → Partilhar QR" reuses the Consumer share card
// (showP2PShareModal) to present the merchant's persistent static receive
// identity: the official card (Sandbox badge, name, @banza, static QR) plus the
// image / WhatsApp / save actions — but NOT "Copiar link", because a Business
// receive QR is an identity card, not a copyable @banza pay URL. These lock that
// contract (and that the Consumer default still offers "Copiar link").
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

Future<void> _open(
  WidgetTester tester, {
  required bool isSandbox,
  required bool showCopyLink,
}) async {
  // Give the sheet a phone-sized surface so the full card + actions fit (the
  // default 800x600 test window is shorter than the card on a real device).
  await tester.binding.setSurfaceSize(const Size(500, 1100));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Builder(
        builder: (context) => Center(
          child: ElevatedButton(
            onPressed: () => showP2PShareModal(
              context,
              handle: 'doa',
              displayName: 'Doa',
              qrPayload: 'https://pay.banzami.com/b/SLUGslugSLUGslug01',
              shareUrl: 'https://pay.banzami.com/b/SLUGslugSLUGslug01',
              isSandbox: isSandbox,
              showCopyLink: showCopyLink,
            ),
            child: const Text('open'),
          ),
        ),
      ),
    ),
  ));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Business card: identity + static-QR actions, no Copiar link',
      (tester) async {
    await _open(tester, isSandbox: true, showCopyLink: false);

    // The official merchant card: Sandbox badge, display name, @banza.
    expect(find.text('SANDBOX'), findsOneWidget);
    expect(find.text('Doa'), findsOneWidget);
    expect(find.text('@doa'), findsWidgets);

    // Identity sharing actions only.
    expect(find.text('Partilhar imagem'), findsOneWidget);
    expect(find.text('Partilhar WhatsApp'), findsOneWidget);
    expect(find.text('Guardar QR'), findsOneWidget);
    expect(find.text('Fechar'), findsOneWidget);

    // No link/URL action for a Business receive QR.
    expect(find.text('Copiar link'), findsNothing);
  });

  testWidgets('Consumer default still offers Copiar link (no regression)',
      (tester) async {
    await _open(tester, isSandbox: false, showCopyLink: true);

    expect(find.text('Copiar link'), findsOneWidget);
    expect(find.text('Partilhar imagem'), findsOneWidget);
    // Not sandbox → no badge.
    expect(find.text('SANDBOX'), findsNothing);
  });

  // The handle is interpolated into a temp-file path. Whatever reaches it, the
  // name stays a plain file name inside the temp directory.
  group('shareCardFileName', () {
    test('a normal handle is used as is', () {
      expect(shareCardFileName('banzami_share', 'loja_da_ana'),
          'banzami_share_loja_da_ana.png');
    });
    test('path separators and traversal never survive', () {
      for (final hostile in [
        '../../etc/passwd',
        r'..\..\x',
        'a/b',
        'a\u0000b',
        '~/x',
        'a b.png/../c'
      ]) {
        final name = shareCardFileName('banzami_qr', hostile);
        expect(name, matches(RegExp(r'^banzami_qr_[a-z0-9_]{1,32}\.png$')),
            reason: hostile);
      }
    });
    test('an empty or symbol-only handle still yields a valid name', () {
      expect(shareCardFileName('banzami_qr', ''), 'banzami_qr_banzami.png');
      expect(
          shareCardFileName('banzami_qr', '../..'), 'banzami_qr_banzami.png');
    });
    test('the name is bounded', () {
      expect(shareCardFileName('p', 'a' * 500).length, lessThan(48));
    });
  });
}
