import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('ConsumerPublicClient token', () {
    test('after clearToken nothing is sent with the old token', () async {
      final auth = <String?>[];
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          auth.add(req.headers['Authorization']);
          return http.Response(jsonEncode({'id': 'c', 'handle': 'ana'}), 200);
        }),
      )..setToken('old.jwt.token');

      await client.checkAuth();
      client.clearToken();
      await client.checkAuth().catchError((_) {});
      expect(auth.first, 'Bearer old.jwt.token');
      expect(auth.last, isNull);
      expect(client.token, isNull);
    });

    test('an empty token is no token', () {
      final client = ConsumerPublicClient(baseUrl: 'https://api.test')..setToken('');
      expect(client.token, isNull);
    });
  });
}
