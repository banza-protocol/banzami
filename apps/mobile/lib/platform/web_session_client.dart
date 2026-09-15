// Web platform adapter — the ONLY web-specific transport code (WEB-APP-001 §3,
// §8, §12). The shared Consumer widgets, screens, models and API client are
// unchanged across iOS, Android and Web; only how the browser reaches the
// Consumer API differs, and it differs here, at the edge.
//
// Two rules this adapter enforces, both browser-specific:
//
//  1. Credentialed same-origin requests. The Flutter Web app talks to its own
//     origin (app.banzami.com) — never cross-origin to the Consumer API. The
//     same-origin BFF holds the Consumer Bearer server-side, sealed in an
//     HttpOnly cookie the browser cannot read (WEB_CONSUMER_BEARER_VISIBLE_TO_JS
//     = 0). `withCredentials` makes the browser send that cookie and honour the
//     Set-Cookie the BFF returns at login.
//
//  2. Double-submit CSRF. Because the session is a cookie, a state-changing
//     request (POST/DELETE) must prove it came from this app and not a
//     cross-site form. The BFF sets a readable `bz_app_csrf` nonce cookie; this
//     adapter echoes it in `X-CSRF-Token`, which a cross-site caller cannot read
//     to forge (WEB_CSRF=PASS). Safe methods (GET/HEAD) never carry it.
//
// The Consumer client still attaches `Authorization: Bearer <sentinel>` — on Web
// that sentinel is worthless (the real Bearer is the cookie), and the BFF strips
// any inbound Authorization before injecting the server-side one.
import 'dart:html' as html;

import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

/// The CSRF nonce the BFF mirrors into a readable cookie (see lib/session in the
/// BFF). Not a credential — only the anti-CSRF nonce, deliberately readable.
const String _csrfCookie = 'bz_app_csrf';

String? _readCookie(String name) {
  final cookies = html.document.cookie ?? '';
  for (final part in cookies.split(';')) {
    final kv = part.trim();
    final eq = kv.indexOf('=');
    if (eq <= 0) continue;
    if (kv.substring(0, eq) == name) {
      return Uri.decodeComponent(kv.substring(eq + 1));
    }
  }
  return null;
}

/// A [http.Client] for Flutter Web that sends the session cookie and the CSRF
/// nonce. Pass it to [BanzamiApp] as the pinnedClient; the shared
/// [ConsumerPublicClient] uses it verbatim.
class WebSessionClient extends http.BaseClient {
  WebSessionClient() : _inner = BrowserClient()..withCredentials = true;

  final BrowserClient _inner;

  static const _unsafe = {'POST', 'PUT', 'PATCH', 'DELETE'};

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    if (_unsafe.contains(request.method.toUpperCase())) {
      final csrf = _readCookie(_csrfCookie);
      if (csrf != null && csrf.isNotEmpty) {
        request.headers['X-CSRF-Token'] = csrf;
      }
    }
    return _inner.send(request);
  }

  @override
  void close() => _inner.close();
}
