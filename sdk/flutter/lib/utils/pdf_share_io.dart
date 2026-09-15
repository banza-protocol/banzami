import 'dart:io';

import 'package:flutter/widgets.dart' show Rect;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Native (iOS/Android): write the official PDF to a temp file, open the OS
/// share sheet, then delete the file so receipts never accumulate.
Future<void> sharePdfBytes(
  List<int> bytes,
  String filename, {
  String? subject,
  Rect? shareOrigin,
}) async {
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(bytes, flush: true);
  try {
    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'application/pdf')],
      subject: subject,
      sharePositionOrigin: shareOrigin,
    );
  } finally {
    try {
      await file.delete();
    } catch (_) {}
  }
}
