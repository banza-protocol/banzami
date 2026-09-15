// This file is only ever compiled into the Flutter Web build (selected by the
// conditional import in pdf_share.dart); dart:html is the right tool there.
// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:typed_data';

import 'package:flutter/widgets.dart' show Rect;

/// Web (app.banzami.com): there is no temp filesystem, so download the official
/// Banzami PDF — the browser download is the reliable way to keep and forward
/// it. [subject] and [shareOrigin] don't apply to a download and are ignored.
Future<void> sharePdfBytes(
  List<int> bytes,
  String filename, {
  String? subject,
  Rect? shareOrigin,
}) async {
  final blob = html.Blob(<Object>[Uint8List.fromList(bytes)], 'application/pdf');
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.AnchorElement(href: url)
    ..download = filename
    ..style.display = 'none';
  html.document.body!.append(anchor);
  anchor.click();
  anchor.remove();
  html.Url.revokeObjectUrl(url);
}
