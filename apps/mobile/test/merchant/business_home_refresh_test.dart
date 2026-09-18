import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/services/merchant_refresh_bus.dart';
import 'package:banzami_mobile/merchant/services/payment_notification_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// BUSINESS-HOME-REFRESH-001 — the Business Home must learn that it was paid.
//
// Found by the first real Validation Run (BZV-20260918-0003, S15). A charge was
// created and paid; the ledger and the API both moved to 70 000 minor; the
// Business Home showed 0 Kz for thirty seconds and only ever showed the truth
// after a manual reload. The Consumer Home converges in ~2 ms.
//
// The cause was not realtime at all. The payment POLLER — the only thing that
// tells the Business Home a payment landed — was started behind a `kIsWeb`
// guard meant for the local-notification plugin, so on Web it never ran. The
// guard's own comment claimed "Home loads and refreshes over the BFF like every
// other screen"; the dashboard loaded once in initState and then only on
// pull-to-refresh.
//
// Detection and notification are now two jobs. These hold them apart.

final _future = DateTime.now().add(const Duration(hours: 1));

/// A client that reports NO payments until [paid] flips — the shape reality has.
/// The tracker's first poll only records what is already there, so a payment
/// that was always present is not "newly received" and must not announce itself.
class _Merchant {
  bool paid = false;
  late final BanzamiClient client = BanzamiClient(
    jwt: 't', jwtExpiresAt: _future, baseUrl: 'https://api.test', maxRetries: 0,
    httpClient: MockClient((req) async {
      final p = req.url.path;
      if (p.contains('wallet-payments')) {
        return http.Response(paid
            ? '{"items":[{"id":"wp1","amount_minor":70000,"currency":"AOA",'
              '"status":"COMPLETED","created_at":"2026-09-18T21:45:13Z"}]}'
            : '{"items":[]}', 200);
      }
      if (p.contains('transactions')) return http.Response('{"data":[]}', 200);
      return http.Response('{}', 200);
    }),
  );
}

/// Count the bus pings across one baseline poll, a payment, and the next poll.
Future<int> _pingsAcrossPayment({required bool isWeb}) async {
  final m = _Merchant();
  final svc = PaymentNotificationService(m.client, isWeb: isWeb);
  await svc.pollOnce(); // baseline: nothing received yet
  var pings = 0;
  void listener() => pings++;
  MerchantRefreshBus.instance.addListener(listener);
  m.paid = true;
  await svc.pollOnce(); // the payment lands
  MerchantRefreshBus.instance.removeListener(listener);
  return pings;
}

void main() {
  test('the bus notifies its listeners', () {
    var pings = 0;
    void listener() => pings++;
    MerchantRefreshBus.instance.addListener(listener);
    MerchantRefreshBus.instance.signal();
    MerchantRefreshBus.instance.removeListener(listener);
    expect(pings, 1);
  });

  // THE regression. On Web the notification plugin does not exist, but the
  // refresh must still happen — that coupling is what broke the Home.
  test('isWeb=true: a newly received payment signals the Home to refetch',
      () async {
    expect(await _pingsAcrossPayment(isWeb: true), 1,
        reason: 'the Web Business Home has no other way to learn it was paid');
  });

  test('isWeb=false: native behaviour is unchanged — it signals too', () async {
    expect(await _pingsAcrossPayment(isWeb: false), 1);
  });
}
