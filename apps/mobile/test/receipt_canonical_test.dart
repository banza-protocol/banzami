// The comprovativo renders the canonical receipt — the one the PDF and the
// public verifier show — for the real reported payment: 2 000 Kz from @fm65 to
// @doa through a DOA payment link (synthetic proof reference).
import 'dart:async';
import 'dart:io';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

const _ref = 'BZM-Q7RT-CFAF-00ZT-ADSF-P4N7-FB0T';

Receipt _receipt({String? context = 'Vaquinha · Jornada economica fresca'}) => Receipt.fromJson({
      'proof_reference': _ref,
      'verification_url': 'https://banzami.com/r/$_ref',
      'operation_kind': 'PAYMENT',
      'channel': 'PAYMENT_LINK',
      'funding_source': 'BANZAMI_BALANCE',
      'status': 'CONFIRMED',
      'amount_minor': 200000,
      'currency': 'AOA',
      'payer': {'kind': 'PERSON', 'display_name': 'Fidel Monteiro', 'handle': 'fm65'},
      'payee': {'kind': 'BUSINESS', 'display_name': 'Doa', 'handle': 'doa'},
      'merchant_reference': 'DOA-55791091',
      if (context != null) 'display_context': context,
      'confirmed_at': '2026-09-10T19:13:27.687635Z',
      'environment': 'SANDBOX',
      'network': 'BANZA',
      'operator': 'Banzami',
      'transaction_id': '0056ead5-76b4-4831-afa3-6e4061b2095c',
    });

final _transfer = Transfer(
  transferId: '0056ead5-76b4-4831-afa3-6e4061b2095c',
  sender: 'fm65',
  recipient: 'Sandbox · Doa-Sandbox', // what the old link view said
  amountMinor: 200000,
  currency: 'AOA',
  status: 'COMPLETED',
  note: 'DOA-55791091',
  createdAt: DateTime.utc(2026, 9, 10, 19, 13, 27),
);

Future<void> _pump(WidgetTester tester, {Size size = const Size(390, 844), Receipt? receipt, Future<Receipt> Function()? fetch}) async {
  await tester.binding.setSurfaceSize(size);
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(
    home: BanzamiReceiptScreen(
      transfer: _transfer,
      ownHandle: 'fm65',
      onDone: (_) {},
      isSandbox: true,
      recipientIsHandle: false,
      receipt: receipt,
      fetchReceipt: fetch,
    ),
  ));
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  setUpAll(() async => initializeDateFormatting('pt'));

  testWidgets('a link payment reads as a payment to @doa, never the Project', (tester) async {
    await _pump(tester, receipt: _receipt());
    expect(find.text('Pagamento concluído'), findsOneWidget);
    expect(find.text('para @doa'), findsOneWidget);
    expect(find.text('@doa'), findsOneWidget); // the Para row
    expect(find.text('Doa · @doa'), findsNothing);
    expect(find.textContaining('Doa-Sandbox'), findsNothing);
    expect(find.textContaining('Sandbox · Doa'), findsNothing);
  });

  testWidgets('the Business reference and the campaign are their own rows', (tester) async {
    await _pump(tester, receipt: _receipt());
    expect(find.text('Referência do comerciante'), findsOneWidget);
    expect(find.text('DOA-55791091'), findsOneWidget);
    expect(find.text('Finalidade'), findsOneWidget);
    expect(find.text('Vaquinha · Jornada economica fresca'), findsOneWidget);
    expect(find.text('Nota'), findsNothing);
    expect(find.text('Operação'), findsOneWidget);
    expect(find.text('Pagamento · Link de pagamento'), findsOneWidget);
    expect(find.text('Saldo Banzami'), findsOneWidget);
    expect(find.textContaining('@banza'), findsNothing);
  });

  testWidgets('the reference is the proof’s; the transaction id never is', (tester) async {
    await _pump(tester, receipt: _receipt());
    expect(find.text('BZM-Q7RT-CFAF-…-FB0T'), findsOneWidget);
    expect(find.textContaining('0056EAD5'), findsNothing);
    expect(find.textContaining('0056ead5'), findsNothing);
    expect(find.textContaining('Comprovativo Banzami  •  BZM-Q7RT-CFAF-…-FB0T'), findsOneWidget);
  });

  testWidgets('copying the reference copies it whole', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    await _pump(tester, receipt: _receipt());
    await tester.tap(find.text('BZM-Q7RT-CFAF-…-FB0T'));
    await tester.pump();
    expect(copied, _ref);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('"Copiar detalhes" copies the canonical receipt and nothing internal', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    await _pump(tester, receipt: _receipt());
    await tester.ensureVisible(find.text('Copiar detalhes'));
    await tester.tap(find.text('Copiar detalhes'));
    await tester.pump();
    expect(copied, isNotNull);
    for (final line in [
      'Pagamento · Link de pagamento',
      'Montante: 2 000 Kz',
      'De: @fm65',
      'Para: @doa',
      'Referência do comerciante: DOA-55791091',
      'Finalidade: Vaquinha · Jornada economica fresca',
      'Data: 10 de setembro de 2026, 20:13 (WAT)',
      'Comprovativo: $_ref',
      'Verificar: https://banzami.com/r/$_ref',
    ]) {
      expect(copied, contains(line));
    }
    for (final leak in ['0056', 'Doa-Sandbox', 'Payment link', '@banza', 'Método']) {
      expect(copied, isNot(contains(leak)));
    }
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('the time is the official clock, labelled (19:13 UTC = 20:13 WAT)', (tester) async {
    await _pump(tester, receipt: _receipt());
    expect(find.text('10 de setembro de 2026, 20:13 (WAT)'), findsOneWidget);
    // The live clock is labelled as the screen's, not the payment's.
    expect(find.textContaining('Ecrã em direto'), findsOneWidget);
  });

  testWidgets('the receipt arrives by fetch when the pay response had none', (tester) async {
    var calls = 0;
    await _pump(tester, fetch: () async {
      calls++;
      return _receipt();
    });
    expect(calls, 1);
    expect(find.text('para @doa'), findsOneWidget);
    expect(find.text('BZM-Q7RT-CFAF-…-FB0T'), findsOneWidget);
  });

  testWidgets('if the receipt cannot be had, no reference is invented', (tester) async {
    await _pump(tester, fetch: () async => throw Exception('offline'));
    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(seconds: 3));
    expect(find.textContaining('BZM-'), findsNothing);
    expect(find.textContaining('0056'), findsNothing);
    expect(find.text('Indisponível — toque para tentar'), findsOneWidget);
  });

  for (final size in const [Size(320, 640), Size(390, 844)]) {
    testWidgets('fits at ${size.width.toInt()}×${size.height.toInt()} with a long context', (tester) async {
      await _pump(tester, size: size,
          receipt: _receipt(context: 'Vaquinha · Ajude a Maria Fernanda a concluir o tratamento no hospital em Luanda'));
      expect(tester.takeException(), isNull); // no RenderFlex overflow
      expect(find.text('@doa'), findsOneWidget);
      final shot = Platform.environment['RECEIPT_SHOT_DIR'];
      if (shot != null) {
        await expectLater(find.byType(BanzamiReceiptScreen),
            matchesGoldenFile('$shot/comprovativo-${size.width.toInt()}x${size.height.toInt()}.png'));
      }
    });
  }
}
