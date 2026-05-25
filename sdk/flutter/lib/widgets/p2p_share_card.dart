import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/banza_theme.dart';
import '../utils/money_format.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

Future<void> showP2PShareModal(
  BuildContext context, {
  required String handle,
  String? displayName,
  required String qrPayload,
  required String shareUrl,
  int? amountMinor,
  String? currency,
  String? note,
  bool isSandbox = false,
  Widget? logoWidget,
}) {
  return showModalBottomSheet<void>(
    context:            context,
    isScrollControlled: true,
    backgroundColor:    Colors.transparent,
    builder: (_) => _P2PShareModal(
      handle:      handle,
      displayName: displayName,
      qrPayload:   qrPayload,
      shareUrl:    shareUrl,
      amountMinor: amountMinor,
      currency:    currency,
      note:        note,
      isSandbox:   isSandbox,
      logoWidget:  logoWidget,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

class _P2PShareModal extends StatefulWidget {
  final String  handle;
  final String? displayName;
  final String  qrPayload;
  final String  shareUrl;
  final int?    amountMinor;
  final String? currency;
  final String? note;
  final bool    isSandbox;
  final Widget? logoWidget;

  const _P2PShareModal({
    required this.handle,
    this.displayName,
    required this.qrPayload,
    required this.shareUrl,
    this.amountMinor,
    this.currency,
    this.note,
    required this.isSandbox,
    this.logoWidget,
  });

  @override
  State<_P2PShareModal> createState() => _P2PShareModalState();
}

class _P2PShareModalState extends State<_P2PShareModal> {
  final _cardKey = GlobalKey();
  bool  _busy    = false;

  // ── Image capture ──────────────────────────────────────────────────────────

  Future<Uint8List?> _captureCardPng() async {
    try {
      final boundary =
          _cardKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) return null;
      final image = await boundary.toImage(pixelRatio: 3.0);
      final data  = await image.toByteData(format: ui.ImageByteFormat.png);
      return data?.buffer.asUint8List();
    } catch (e) {
      debugPrint('[P2PShare] captureCard error: $e');
      return null;
    }
  }

  Future<File?> _writeTempFile(Uint8List bytes, String name) async {
    try {
      final file = File('${Directory.systemTemp.path}/$name');
      await file.writeAsBytes(bytes);
      return file;
    } catch (_) {
      return null;
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<void> _shareImage() async {
    if (_busy) return;
    HapticFeedback.lightImpact();
    setState(() => _busy = true);
    try {
      final bytes = await _captureCardPng();
      if (bytes == null) throw Exception('Captura falhou');
      final file = await _writeTempFile(
          bytes, 'banza_share_${widget.handle}.png');
      if (file == null) throw Exception('Ficheiro temporário falhou');
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        subject: 'Pagar @${widget.handle} com Banza',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Erro ao partilhar: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _copyLink() async {
    HapticFeedback.selectionClick();
    await Clipboard.setData(ClipboardData(text: widget.shareUrl));
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Link copiado')));
    }
  }

  Future<void> _shareWhatsApp() async {
    HapticFeedback.lightImpact();

    final sb = StringBuffer();
    if (widget.isSandbox) sb.writeln('🧪 SANDBOX — dinheiro de teste\n');
    sb.writeln('💸 Envie-me um pagamento no Banza\n');

    final name = widget.displayName ?? '@${widget.handle}';
    sb.write(name);
    if (widget.displayName != null) sb.write(' (@${widget.handle})');
    sb.writeln('\n');

    if (widget.amountMinor != null && widget.amountMinor! > 0) {
      sb.writeln(formatMinor(widget.amountMinor!, widget.currency ?? 'AOA'));
    }
    if (widget.note != null && widget.note!.isNotEmpty) {
      sb.writeln('"${widget.note}"');
    }
    sb.writeln('\nPagar agora:\n${widget.shareUrl}');

    final text  = Uri.encodeComponent(sb.toString().trim());
    final waUrl = Uri.parse('https://wa.me/?text=$text');

    if (await canLaunchUrl(waUrl)) {
      await launchUrl(waUrl, mode: LaunchMode.externalApplication);
    } else {
      await Share.share(sb.toString().trim(),
          subject: 'Pagar @${widget.handle} com Banza');
    }
  }

  Future<void> _saveQr() async {
    if (_busy) return;
    HapticFeedback.lightImpact();
    setState(() => _busy = true);
    try {
      final bytes = await _captureCardPng();
      if (bytes == null) throw Exception('Captura falhou');
      final file = await _writeTempFile(
          bytes, 'banza_qr_${widget.handle}.png');
      if (file == null) throw Exception('Ficheiro temporário falhou');
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        subject: 'QR Banza — @${widget.handle}',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Erro ao guardar: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final initials = _initials(widget.displayName ?? widget.handle);

    return Container(
      decoration: const BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [

            // Drag handle
            const SizedBox(height: 8),
            Container(
              width: 36, height: 4,
              decoration: const BoxDecoration(
                color:        BanzaColors.gray200,
                borderRadius: BanzaRadius.fullAll,
              ),
            ),
            const SizedBox(height: 14),

            // ── Avatar + name + handle ──────────────────────────────────────
            _AvatarRow(
              initials:    initials,
              displayName: widget.displayName,
              handle:      widget.handle,
            ),

            const SizedBox(height: 12),

            // ── Share card preview (also captured for PNG export) ───────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
              child: RepaintBoundary(
                key: _cardKey,
                child: P2PShareCardBuilder(
                  handle:      widget.handle,
                  displayName: widget.displayName,
                  qrPayload:   widget.qrPayload,
                  amountMinor: widget.amountMinor,
                  currency:    widget.currency,
                  note:        widget.note,
                  isSandbox:   widget.isSandbox,
                  logoWidget:  widget.logoWidget,
                ),
              ),
            ),

            const SizedBox(height: 10),

            // ── Actions ─────────────────────────────────────────────────────
            const Divider(height: 1),

            _ActionTile(
              icon:  Icons.image_rounded,
              label: _busy ? 'A processar…' : 'Partilhar imagem',
              onTap: _busy ? null : _shareImage,
            ),
            _ActionTile(
              icon:  Icons.link_rounded,
              label: 'Copiar link',
              onTap: _copyLink,
            ),
            _ActionTile(
              icon:  Icons.chat_rounded,
              label: 'Partilhar WhatsApp',
              color: const Color(0xFF25D366),
              onTap: _shareWhatsApp,
            ),
            _ActionTile(
              icon:  Icons.download_rounded,
              label: _busy ? 'A guardar…' : 'Guardar QR',
              onTap: _busy ? null : _saveQr,
            ),

            const Divider(height: 1),

            // ── Close ───────────────────────────────────────────────────────
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(
                minimumSize:     const Size(double.infinity, 44),
                foregroundColor: BanzaColors.gray600,
              ),
              child: const Text(
                'Fechar',
                style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Premium share card — used as modal preview and PNG export source
// ─────────────────────────────────────────────────────────────────────────────

class P2PShareCardBuilder extends StatelessWidget {
  final String  handle;
  final String? displayName;
  final String  qrPayload;
  final int?    amountMinor;
  final String? currency;
  final String? note;
  final bool    isSandbox;
  final Widget? logoWidget;

  const P2PShareCardBuilder({
    super.key,
    required this.handle,
    this.displayName,
    required this.qrPayload,
    this.amountMinor,
    this.currency,
    this.note,
    required this.isSandbox,
    this.logoWidget,
  });

  @override
  Widget build(BuildContext context) {
    final hasAmount  = amountMinor != null && amountMinor! > 0;
    final amountText = hasAmount
        ? formatMinor(amountMinor!, currency ?? 'AOA')
        : 'Pagamento livre';

    return Container(
      decoration: const BoxDecoration(
        color:        Color(0xFFFCF6F5),
        borderRadius: BanzaRadius.xxlAll,
        boxShadow:    BanzaShadows.cardElevated,
      ),
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [

          // ── Wine gradient inner card ────────────────────────────────────
          ClipRRect(
            borderRadius: BanzaRadius.lgAll,
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(gradient: BanzaGradients.wine),
              child: DecoratedBox(
                position: DecorationPosition.foreground,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin:  Alignment.topCenter,
                    end:    Alignment.center,
                    colors: [
                      Colors.white.withValues(alpha: 0.07),
                      Colors.transparent,
                    ],
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical:   16,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [

                        // SANDBOX badge
                        if (isSandbox) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: BanzaSpacing.md,
                              vertical:   3,
                            ),
                            decoration: const BoxDecoration(
                              color:        BanzaColors.gold,
                              borderRadius: BanzaRadius.fullAll,
                            ),
                            child: const Text(
                              'SANDBOX',
                              style: TextStyle(
                                color:         Colors.white,
                                fontSize:      10,
                                fontWeight:    FontWeight.w700,
                                fontFamily:    'Inter',
                                letterSpacing: 1.2,
                                decoration:    TextDecoration.none,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],

                        // QR on white background
                        Container(
                          padding:    const EdgeInsets.all(10),
                          decoration: const BoxDecoration(
                            color:        Colors.white,
                            borderRadius: BanzaRadius.lgAll,
                          ),
                          child: CustomPaint(
                            size: const Size(140, 140),
                            painter: QrPainter(
                              data:                 qrPayload,
                              version:              QrVersions.auto,
                              errorCorrectionLevel: QrErrorCorrectLevel.H,
                              eyeStyle: const QrEyeStyle(
                                eyeShape: QrEyeShape.square,
                                color:    BanzaColors.wine,
                              ),
                              dataModuleStyle: const QrDataModuleStyle(
                                dataModuleShape: QrDataModuleShape.square,
                                color:           BanzaColors.gray900,
                              ),
                            ),
                          ),
                        ),

                        const SizedBox(height: 8),

                        // Amount
                        Text(
                          amountText,
                          style: TextStyle(
                            color:      Colors.white,
                            fontSize:   hasAmount ? 22 : 14,
                            fontWeight: hasAmount ? FontWeight.w700 : FontWeight.w400,
                            fontFamily: 'Inter',
                            fontStyle:  hasAmount ? FontStyle.normal : FontStyle.italic,
                            decoration: TextDecoration.none,
                          ),
                          textAlign: TextAlign.center,
                        ),

                        // Note
                        if (note != null && note!.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(
                            '"$note"',
                            style: TextStyle(
                              color:      Colors.white.withValues(alpha: 0.72),
                              fontSize:   12,
                              fontFamily: 'Inter',
                              fontStyle:  FontStyle.italic,
                              decoration: TextDecoration.none,
                            ),
                            textAlign: TextAlign.center,
                            maxLines:  2,
                            overflow:  TextOverflow.ellipsis,
                          ),
                        ],

                        const SizedBox(height: 8),

                        // "Receber com Banza" label
                        Text(
                          'Receber com Banza',
                          style: TextStyle(
                            color:         Colors.white.withValues(alpha: 0.50),
                            fontSize:      11,
                            fontFamily:    'Inter',
                            letterSpacing: 0.3,
                            decoration:    TextDecoration.none,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

          const SizedBox(height: 8),

          // ── Footer ───────────────────────────────────────────────────────
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (logoWidget != null) ...[
                logoWidget!,
                const SizedBox(width: 6),
              ],
              Text(
                'Pague instantaneamente com Banza',
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _AvatarRow extends StatelessWidget {
  final String  initials;
  final String? displayName;
  final String  handle;

  const _AvatarRow({
    required this.initials,
    this.displayName,
    required this.handle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width:  48,
          height: 48,
          decoration: const BoxDecoration(
            gradient: BanzaGradients.wine,
            shape:    BoxShape.circle,
          ),
          child: Center(
            child: Text(
              initials,
              style: const TextStyle(
                color:      Colors.white,
                fontSize:   19,
                fontWeight: FontWeight.w700,
                fontFamily: 'Inter',
              ),
            ),
          ),
        ),
        const SizedBox(height: 5),
        if (displayName != null) ...[
          Text(
            displayName!,
            style: BanzaTextStyles.headingSm.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 1),
        ],
        Text(
          '@$handle',
          style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
        ),
      ],
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData      icon;
  final String        label;
  final VoidCallback? onTap;
  final Color         color;

  const _ActionTile({
    required this.icon,
    required this.label,
    this.onTap,
    this.color = BanzaColors.gray900,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveColor = onTap == null ? BanzaColors.gray400 : color;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Row(
          children: [
            Icon(icon, color: effectiveColor, size: 20),
            const SizedBox(width: 16),
            Text(
              label,
              style: BanzaTextStyles.bodyMd.copyWith(
                color:      effectiveColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

String _initials(String name) {
  final clean = name.startsWith('@') ? name.substring(1) : name;
  final parts = clean.trim().split(RegExp(r'\s+'));
  if (parts.length >= 2) {
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }
  return clean.isNotEmpty ? clean[0].toUpperCase() : '?';
}
