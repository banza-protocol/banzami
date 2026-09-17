// Save-or-share a receipt PDF, as a platform adapter (the same conditional-import
// pattern as web_location.dart). The Business screens fetch the official Banzami
// PDF (Document Engine: dados + QR de verificação) and hand its bytes here:
//
//   • native (iOS/Android) → write a temp file and open the OS share sheet,
//     then delete the temp file (share_plus + path_provider + dart:io);
//   • web                  → trigger a same-origin browser download of the bytes.
//
// history_screen imports ONLY this file, so it carries no `dart:io` and compiles
// for Web while the native behaviour stays byte-identical (the io impl is the
// exact code that shipped).
export 'receipt_share_io.dart' if (dart.library.html) 'receipt_share_web.dart';
