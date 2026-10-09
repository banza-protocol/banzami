import 'package:flutter/widgets.dart';

/// A non-zero rect for share_plus's `sharePositionOrigin`.
///
/// iOS anchors the share popover to this rect and REJECTS a zero rect — on the
/// current share_plus it throws a PlatformException before the sheet opens, so
/// every `Share.share` / `Share.shareXFiles` on iOS must pass a non-zero origin.
/// When [key] resolves to a laid-out render box, its on-screen rect is used (the
/// popover points at that widget); otherwise this falls back to a 1x1 rect at the
/// bottom-centre of the screen. It never returns [Rect.zero].
Rect shareOrigin(BuildContext context, {GlobalKey? key}) {
  final box = key?.currentContext?.findRenderObject() as RenderBox?;
  if (box != null && box.hasSize) {
    return box.localToGlobal(Offset.zero) & box.size;
  }
  final size = MediaQuery.of(context).size;
  return Rect.fromCenter(
    center: Offset(size.width / 2, size.height - 80),
    width: 1,
    height: 1,
  );
}
