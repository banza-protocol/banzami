import 'dart:ui';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'pin_pad.dart';

/// A fresh-PIN re-authentication dialog for a high-impact action (account
/// deletion). It COLLECTS a 6-digit PIN on the canonical randomized keypad and
/// returns it; the caller sends it to the server, which decides correctness.
/// Returns the entered PIN, or null if cancelled/dismissed.
///
/// This is a PIN entry, so it uses the shared randomized [PinPad] (new layout on
/// open; after a failed server check the caller reopens the dialog, which
/// reshuffles). The PIN is obscured, never logged, and lives only in this
/// dialog's state until handed back.
Future<String?> showReauthPinDialog({
  required BuildContext context,
  required String title,
  required String description,
  String confirmLabel = 'Confirmar',
}) {
  HapticFeedback.mediumImpact();
  return showGeneralDialog<String>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Fechar',
    barrierColor: Colors.transparent,
    transitionDuration: const Duration(milliseconds: 240),
    pageBuilder: (ctx, _, __) => _ReauthPinContent(title: title, description: description),
    transitionBuilder: (ctx, anim, _, child) {
      final eased = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
      return Stack(
        children: [
          FadeTransition(
            opacity: eased,
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.42),
                child: const SizedBox.expand(),
              ),
            ),
          ),
          FadeTransition(
            opacity: eased,
            child: ScaleTransition(
              scale: Tween<double>(begin: 0.94, end: 1).animate(eased),
              child: child,
            ),
          ),
        ],
      );
    },
  );
}

class _ReauthPinContent extends StatefulWidget {
  const _ReauthPinContent({required this.title, required this.description});

  final String title;
  final String description;

  @override
  State<_ReauthPinContent> createState() => _ReauthPinContentState();
}

class _ReauthPinContentState extends State<_ReauthPinContent> {
  String _pin = '';

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Material(
            color: Colors.transparent,
            child: Container(
              constraints: const BoxConstraints(maxWidth: 380),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(26),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.28),
                    blurRadius: 60,
                    offset: const Offset(0, 24),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: BanzamiColors.primary.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(Icons.lock_outline_rounded,
                        color: BanzamiColors.primary, size: 26),
                  ),
                  const SizedBox(height: 16),
                  Text(widget.title, style: BanzamiTextStyles.headingSm, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(widget.description,
                      textAlign: TextAlign.center,
                      style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                  const SizedBox(height: 20),
                  // Canonical randomized 6-digit keypad; returns the PIN on complete.
                  PinPad(
                    onChanged: (v) => _pin = v,
                    onComplete: () => Navigator.of(context).pop(_pin),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Cancelar'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
