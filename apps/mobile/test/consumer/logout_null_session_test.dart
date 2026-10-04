import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:banzami_mobile/services/session_service.dart';
import 'package:banzami_mobile/screens/profile_screen.dart';
import 'package:banzami_mobile/screens/security_screen.dart';

/// Regression: on logout the session is cleared and listeners rebuild before the
/// route is replaced by Welcome. The Profile/Security screens watch the session
/// and used to force-unwrap it (`svc.session!`), which crashed the rebuild with
/// "Null check operator used on a null value" and flashed the red error screen.
/// They must now render safely when the session is null.
void main() {
  Widget host(Widget screen, SessionService svc) =>
      ChangeNotifierProvider<SessionService>.value(
        value: svc,
        child: MaterialApp(home: screen),
      );

  testWidgets('ProfileScreen does not crash when the session is null', (t) async {
    final svc = SessionService(); // fresh service → session == null (as after logout)
    await t.pumpWidget(host(const ProfileScreen(), svc));
    await t.pump();
    expect(t.takeException(), isNull);
  });

  testWidgets('SecurityScreen does not crash when the session is null', (t) async {
    final svc = SessionService();
    await t.pumpWidget(host(const SecurityScreen(), svc));
    await t.pump();
    expect(t.takeException(), isNull);
  });
}
