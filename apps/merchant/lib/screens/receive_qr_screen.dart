import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';

/// Permanent static "receive" QR for the merchant. The payer chooses the amount,
/// so this single code can be displayed at the counter or printed once and
/// reused indefinitely. Rendered at high resolution for printing and shareable.
class ReceiveQrScreen extends StatefulWidget {
  const ReceiveQrScreen({super.key});

  @override
  State<ReceiveQrScreen> createState() => _ReceiveQrScreenState();
}

class _ReceiveQrScreenState extends State<ReceiveQrScreen> {
  final GlobalKey _qrBoundaryKey = GlobalKey();

  String? _payload;
  String? _error;
  bool    _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();
    try {
      final payload = await client.createStaticQr(ownerId: session.merchantId);
      if (mounted) setState(() => _payload = payload);
    } on BanzamiApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on BanzamiNetworkException {
      if (mounted) setState(() => _error = 'Sem ligação. Verifique a sua rede.');
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível gerar o QR.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Capture the rendered QR card to a high-resolution PNG and share it
  /// (WhatsApp, SMS, etc.).
  Future<void> _share() async {
    try {
      final boundary = _qrBoundaryKey.currentContext!.findRenderObject()
          as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 4.0); // print-grade resolution
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      if (byteData == null) return;
      final bytes = byteData.buffer.asUint8List();

      final session = context.read<MerchantSessionService>().session!;
      await Share.shareXFiles(
        [XFile.fromData(bytes, name: 'banzami-qr.png', mimeType: 'image/png')],
        text: 'Paga-me com Banzami — ${session.merchantName}',
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível partilhar o QR.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session!;
    return Scaffold(
      backgroundColor: BanzamiColors.gray100,
      appBar: AppBar(
        title: const Text('Meu QR'),
        actions: [
          IconButton(
            tooltip: 'Regenerar',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(BanzamiSpacing.xl),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (_loading && _payload == null)
                  const Padding(
                    padding: EdgeInsets.all(BanzamiSpacing.xxl),
                    child: CircularProgressIndicator(color: BanzamiColors.wine),
                  )
                else if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(BanzamiSpacing.lg),
                    decoration: BoxDecoration(
                      color: BanzamiColors.gray100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(_error!,
                        style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.wine)),
                  )
                else if (_payload != null) ...[
                  // The captured card — white background so the print is clean.
                  RepaintBoundary(
                    key: _qrBoundaryKey,
                    child: Container(
                      padding: const EdgeInsets.all(BanzamiSpacing.xl),
                      decoration: BoxDecoration(
                        color: BanzamiColors.white,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: BanzamiColors.gray400.withValues(alpha: 0.2),
                            blurRadius: 16,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(session.merchantName,
                              style: BanzamiTextStyles.titleMd.copyWith(
                                color: BanzamiColors.gray900,
                                fontWeight: FontWeight.w700,
                              )),
                          const SizedBox(height: 4),
                          Text('Paga com Banzami',
                              style: BanzamiTextStyles.bodySm
                                  .copyWith(color: BanzamiColors.gray400)),
                          const SizedBox(height: BanzamiSpacing.lg),
                          QrImageView(
                            data: _payload!,
                            version: QrVersions.auto,
                            size: 260,
                            errorCorrectionLevel: QrErrorCorrectLevel.H,
                            eyeStyle: const QrEyeStyle(
                              eyeShape: QrEyeShape.square,
                              color: BanzamiColors.wine,
                            ),
                            dataModuleStyle: const QrDataModuleStyle(
                              dataModuleShape: QrDataModuleShape.square,
                              color: BanzamiColors.gray900,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: BanzamiSpacing.lg),
                  Text('Permanente — o cliente escolhe o valor.',
                      style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                  const SizedBox(height: BanzamiSpacing.xl),
                  SizedBox(
                    width: double.infinity,
                    child: BanzamiButton(
                      label: 'Partilhar QR',
                      onPressed: _share,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
