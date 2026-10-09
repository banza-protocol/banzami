import 'dart:io';
import 'dart:ui' show Rect;

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Native: write the PDF to a temp file, open the OS share sheet, then delete it
/// (never accumulate PDFs). This is the exact behaviour the Business history
/// screen shipped with on iOS/Android.
Future<void> saveOrShareReceiptPdf({
  required List<int> bytes,
  required String fileName,
  required String subject,
  // iOS anchors the share popover here and rejects a zero rect; callers pass a
  // non-zero rect (see shareOrigin). Null is tolerated on iPhone but a caller on
  // iPad must supply one.
  Rect? sharePositionOrigin,
}) async {
  File? file;
  try {
    final dir = await getTemporaryDirectory();
    file = File('${dir.path}/$fileName');
    await file.writeAsBytes(bytes, flush: true);
    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'application/pdf')],
      subject: subject,
      sharePositionOrigin: sharePositionOrigin,
    );
  } finally {
    if (file != null) {
      try {
        await file.delete();
      } catch (_) {/* best effort */}
    }
  }
}
