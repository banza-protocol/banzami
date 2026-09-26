import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/config.dart';
import 'package:banzami_mobile/merchant/screens/payout_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

/// Canonical Sandbox contract: WITHDRAWALS = UNAVAILABLE_SANDBOX.
///
/// `AppConfig.withdrawalsEnabled` is a compile-time policy (default false), so
/// the payout screen renders a deterministic unavailable state — never an active
/// withdrawal form, never a submit CTA — and issues no payout API call. These
/// tests assert that contract; the previous active-form assertions were removed
/// because the product contract changed, not to weaken coverage.
void main() {
  test('withdrawals are disabled by the default build policy', () {
    expect(AppConfig.withdrawalsEnabled, isFalse);
  });

  testWidgets('renders the unavailable state, not a withdrawal form', (t) async {
    await t.pumpWidget(const MaterialApp(home: PayoutScreen()));
    await t.pumpAndSettle();

    expect(find.text('Os levantamentos ainda não estão disponíveis na Sandbox.'), findsOneWidget);
    expect(find.text('Ficam disponíveis com as operações com dinheiro real.'), findsOneWidget);
    // No form: none of the withdrawal inputs (valor / IBAN / titular) are present.
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('has no active withdrawal submit CTA', (t) async {
    await t.pumpWidget(const MaterialApp(home: PayoutScreen()));
    await t.pumpAndSettle();
    // The old active form's "Pedir levantamento" submit and its confirm dialog
    // must both be gone — no control leads into a flow that cannot succeed.
    expect(find.widgetWithText(BanzamiPrimaryButton, 'Pedir levantamento'), findsNothing);
    expect(find.byType(BanzamiPrimaryButton), findsNothing);
    expect(find.text('Confirmar'), findsNothing);
  });

  testWidgets('makes no withdrawal API probe when policy disables withdrawals', (t) async {
    final requests = <Uri>[];
    await t.pumpWidget(MultiProvider(
      providers: [
        Provider<BanzamiClient>(
          create: (_) => BanzamiClient(
            apiKey: 'bz_test_key',
            baseUrl: 'https://api.test',
            maxRetries: 0,
            httpClient: MockClient((req) async {
              requests.add(req.url);
              return http.Response('{}', 200);
            }),
          ),
        ),
      ],
      child: const MaterialApp(home: PayoutScreen()),
    ));
    await t.pumpAndSettle();
    expect(requests, isEmpty, reason: 'an intentionally-unavailable screen must not call the payouts API');
  });

  testWidgets('deep-link / stale navigation stays safe: unavailable state, no trapped navigation', (t) async {
    // Arrive straight on the payout route, as a deep link or a stale push would.
    await t.pumpWidget(MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PayoutScreen()),
              ),
              child: const Text('go'),
            ),
          ),
        ),
      ),
    ));
    await t.tap(find.text('go'));
    await t.pumpAndSettle();

    expect(find.text('Os levantamentos ainda não estão disponíveis na Sandbox.'), findsOneWidget);
    // The in-flight PopScope guard (canPop:false) belongs to the form branch and
    // must never render here — leaving the screen is always allowed.
    for (final ps in t.widgetList<PopScope>(find.byType(PopScope))) {
      expect(ps.canPop, isTrue);
    }
  });

  testWidgets('disabled semantics: the reason is real accessible text, with no active control', (t) async {
    await t.pumpWidget(const MaterialApp(home: PayoutScreen()));
    await t.pumpAndSettle();
    // The reason is announced as text (not locked inside an image), and there is
    // no enabled submit the user could tap into an impossible flow.
    expect(find.text('Os levantamentos ainda não estão disponíveis na Sandbox.'), findsOneWidget);
    expect(find.byType(BanzamiPrimaryButton), findsNothing);
  });
}
