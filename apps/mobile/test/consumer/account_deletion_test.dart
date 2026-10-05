import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import 'package:banzami_mobile/screens/profile_screen.dart';
import 'package:banzami_mobile/services/session_service.dart';
import 'package:banzami_mobile/widgets/reauth_pin_dialog.dart';

// "Suprimir conta" is account deletion; "Remover deste dispositivo" is a local
// wipe (logout). They are distinct actions with distinct names, and only the
// first ever calls the server deletion endpoint. These tests pin that contract.

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final store = <String, String>{};

  setUp(() {
    store.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async {
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        switch (call.method) {
          case 'write':
            store[args['key'] as String] = args['value'] as String;
            return null;
          case 'read':
            return store[args['key'] as String];
          case 'delete':
            store.remove(args['key']);
            return null;
          case 'deleteAll':
            store.clear();
            return null;
          case 'readAll':
            return Map<String, String>.from(store);
          case 'containsKey':
            return store.containsKey(args['key']);
          default:
            return null;
        }
      },
    );
  });

  // A SessionService with a live session, seeded through its own createSession.
  Future<SessionService> seededSession() async {
    final svc = SessionService();
    await svc.createSession(
      consumerId: 'c-1',
      walletId: 'w-1',
      handle: 'tester',
      displayName: 'Tester',
      pin: '1234',
      token: 'tok',
    );
    return svc;
  }

  Widget host(SessionService svc, ConsumerPublicClient client) => MultiProvider(
        providers: [
          ChangeNotifierProvider<SessionService>.value(value: svc),
          Provider<ConsumerPublicClient>.value(value: client),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      );

  testWidgets('the Account section offers both device-removal and deletion, named distinctly', (t) async {
    final svc = await seededSession();
    final client = ConsumerPublicClient(
      baseUrl: 'http://test',
      httpClient: MockClient((_) async => http.Response('{}', 200)),
    )..setToken('tok');

    await t.pumpWidget(host(svc, client));
    await t.pump();

    expect(find.text('Remover deste dispositivo'), findsOneWidget);
    expect(find.text('Suprimir conta'), findsOneWidget);
    // The old ambiguous "Remover conta" label is gone.
    expect(find.text('Remover conta'), findsNothing);
  });

  testWidgets('"Remover deste dispositivo" never calls the deletion endpoint', (t) async {
    final svc = await seededSession();
    final paths = <String>[];
    final client = ConsumerPublicClient(
      baseUrl: 'http://test',
      httpClient: MockClient((req) async {
        paths.add(req.url.path);
        return http.Response('{}', 200);
      }),
    )..setToken('tok');

    await t.pumpWidget(host(svc, client));
    await t.pump();

    final row = find.text('Remover deste dispositivo');
    await t.ensureVisible(row);
    await t.pumpAndSettle();
    await t.tap(row);
    await t.pumpAndSettle();
    // Confirm in the premium dialog.
    await t.tap(find.text('Remover'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));

    expect(paths, isNot(contains('/v1/me/deletion')));
  });

  group('showReauthPinDialog', () {
    testWidgets('returns the entered PIN when confirmed', (t) async {
      String? result = 'unset';
      await t.pumpWidget(MaterialApp(
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  result = await showReauthPinDialog(
                    context: ctx,
                    title: 'Confirme',
                    description: 'PIN',
                    confirmLabel: 'Suprimir',
                  );
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ));
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      // The reauth dialog now uses the randomized 6-digit keypad; tapping six
      // digits auto-submits the PIN (digits are all present whatever the order).
      for (final d in '123456'.split('')) {
        await t.tap(find.text(d));
        await t.pump();
      }
      await t.pumpAndSettle();
      expect(result, '123456');
    });

    testWidgets('returns null when cancelled', (t) async {
      String? result = 'unset';
      await t.pumpWidget(MaterialApp(
        home: Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () async {
                  result = await showReauthPinDialog(
                    context: ctx,
                    title: 'Confirme',
                    description: 'PIN',
                  );
                },
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ));
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('Cancelar'));
      await t.tap(find.text('Cancelar'));
      await t.pumpAndSettle();
      expect(result, isNull);
    });
  });
}
