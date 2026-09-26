// ignore_for_file: deprecated_member_use
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

/// Web: navigate the current tab to [url]. Same-document navigation is not
/// subject to popup blocking, so it works even when triggered after the press
/// animation's async gap (unlike window.open). Always succeeds.
Future<bool> openExternalUrl(String url) async {
  html.window.location.assign(url);
  return true;
}
