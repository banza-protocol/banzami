// Web implementation of the same-origin location helpers (ADR-066).
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

/// The first path segment of the current URL, e.g. 'business' for
/// `https://app.banzami.com/business/receive`. Empty for the Consumer root.
String currentTopSegment() {
  final segs = Uri.base.pathSegments.where((s) => s.isNotEmpty).toList();
  return segs.isEmpty ? '' : segs.first;
}

/// Navigate the whole document to a same-origin path (the context switch).
void navigateToPath(String path) {
  html.window.location.assign(path);
}

void reloadPage() {
  html.window.location.reload();
}
