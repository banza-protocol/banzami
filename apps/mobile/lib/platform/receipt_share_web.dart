// This is a web-only platform adapter that legitimately uses dart:html; the
// non-web build never sees it. Silence the web-library and deprecation infos.
// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;

/// Web: hand the browser the official Banzami PDF as a download. There is no OS
/// share sheet in a browser tab, so "partilhar comprovativo" becomes "descarregar
/// comprovativo" — the same canonical document (Document Engine bytes from the
/// BFF), saved by the viewer. The object URL is revoked immediately after the
/// click so the bytes are not held in memory.
Future<void> saveOrShareReceiptPdf({
  required List<int> bytes,
  required String fileName,
  required String subject,
}) async {
  final blob = html.Blob(<Object>[bytes], 'application/pdf');
  final url = html.Url.createObjectUrlFromBlob(blob);
  try {
    html.AnchorElement(href: url)
      ..download = fileName
      ..style.display = 'none'
      ..click();
  } finally {
    html.Url.revokeObjectUrl(url);
  }
}
