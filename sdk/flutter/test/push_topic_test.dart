import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

/// A6-06: the device subscribes to the topic the server names for the
/// signed-in account — a keyed name only that session learns — never one the
/// app derives from the account id.
void main() {
  const topic = 'sandbox_c_60fb69fab79d6d3c7a3ac844cc4712f7';

  group('ConsumerPublicClient.getPushTopic', () {
    test('asks the signed-in session and returns the server\'s name as is', () async {
      final requests = <http.Request>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          requests.add(req);
          return http.Response(jsonEncode({'topic': topic}), 200,
              headers: {'content-type': 'application/json'});
        }),
      )..setToken('consumer.jwt');
      expect(await client.getPushTopic(), topic);
      expect(requests.single.method, 'GET');
      expect(requests.single.url.path, '/v1/me/push-topic');
      expect(requests.single.headers['Authorization'], 'Bearer consumer.jwt');
    });

    test('no topic configured on the server: subscribe to nothing', () async {
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((_) async => http.Response(
            jsonEncode({'topic': null}), 200,
            headers: {'content-type': 'application/json'})),
      )..setToken('consumer.jwt');
      expect(await client.getPushTopic(), isNull);
    });
  });

  group('BanzamiClient.getMerchantPushTopic', () {
    test('asks the Business session for its topic', () async {
      final requests = <http.Request>[];
      final client = BanzamiClient(
        apiKey: 'bz_test_key',
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/token')) {
            return http.Response(
                jsonEncode({
                  'token': 'test.jwt.token',
                  'expires_at': DateTime.now()
                      .add(const Duration(hours: 1))
                      .toIso8601String(),
                }),
                200,
                headers: {'content-type': 'application/json'});
          }
          requests.add(req);
          return http.Response(jsonEncode({'topic': 'm_9db3b08df4b8f6f166e9052ffb76810f'}), 200,
              headers: {'content-type': 'application/json'});
        }),
      );
      expect(await client.getMerchantPushTopic(), 'm_9db3b08df4b8f6f166e9052ffb76810f');
      expect(requests.single.url.path, '/v1/merchant/push-topic');
    });
  });

  group('banzamiPushTopicFrom', () {
    test('only a valid FCM topic name is accepted', () {
      expect(banzamiPushTopicFrom({'topic': topic}), topic);
      for (final bad in [null, '', 42, 'has space', 'a/b', '../x', 'x' * 901]) {
        expect(banzamiPushTopicFrom({'topic': bad}), isNull, reason: '$bad');
      }
      expect(banzamiPushTopicFrom(const {}), isNull);
    });
  });
}
