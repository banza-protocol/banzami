import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/merchant_session_service.dart';
import 'charge_screen.dart';

/// Ecrã "Receber" — mostra o QR estático do comerciante e permite criar
/// cobranças com valor fixo.
class MerchantQrScreen extends StatefulWidget {
  const MerchantQrScreen({super.key});

  @override
  State<MerchantQrScreen> createState() => _MerchantQrScreenState();
}

class _MerchantQrScreenState extends State<MerchantQrScreen> {
  String?   _qrPayload;
  bool      _loading = false;
  bool      _sharing = false;
  String?   _error;
  ui.Image? _logoImage;

  final _shareButtonKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _loadQr();
    _loadLogo();
  }

  Future<void> _loadLogo() async {
    final data  = await rootBundle.load('assets/images/banzami_icon.png');
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth:  160,
      targetHeight: 160,
    );
    final frame = await codec.getNextFrame();
    if (mounted) setState(() => _logoImage = frame.image);
  }

  Future<void> _loadQr() async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();

    try {
      final qr = await client.createStaticQr(
        ownerId:   session.merchantId,
        ownerType: 'MERCHANT',
        currency:  'AOA',
      );
      if (mounted) setState(() => _qrPayload = qr.payload);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível gerar o QR.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _shareQr(MerchantSession session) async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final painter = QrPainter(
        data:                 _qrPayload!,
        version:              QrVersions.auto,
        errorCorrectionLevel: QrErrorCorrectLevel.H,
        eyeStyle:        const QrEyeStyle(
          eyeShape: QrEyeShape.square,
          color:    BanzamiColors.wine,
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color:           BanzamiColors.gray900,
        ),
        embeddedImage:      _logoImage,
        embeddedImageStyle: const QrEmbeddedImageStyle(size: Size(80, 80)),
      );

      final byteData = await painter.toImageData(512);
      if (byteData == null) throw Exception('QR render retornou imagem vazia');
      final bytes = byteData.buffer.asUint8List();

      final file = File('${Directory.systemTemp.path}/qr_${session.merchantId}.png');
      await file.writeAsBytes(bytes);

      final box    = _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;

      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        subject:             'QR de pagamento — ${session.merchantName}',
        sharePositionOrigin: origin,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao partilhar: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session!;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor:        BanzamiColors.offWhite,
        foregroundColor:        BanzamiColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0,
        title: const Text('Receber', style: BanzamiTextStyles.headingSm),
        actions: [
          IconButton(
            icon:      const Icon(Icons.refresh_rounded, color: BanzamiColors.gray400),
            onPressed: _loadQr,
            tooltip:   'Regenerar QR',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: BanzamiColors.wine))
          : _error != null
              ? _buildError()
              : _buildBody(session),
    );
  }

  Widget _buildError() {
    return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
      const SizedBox(height: 12),
      Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
      const SizedBox(height: 16),
      TextButton(onPressed: _loadQr, child: const Text('Tentar novamente')),
    ]));
  }

  Widget _buildBody(MerchantSession session) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.xl,
        vertical:   BanzamiSpacing.lg,
      ),
      child: Column(children: [
        Text(
          'Mostre este QR ao cliente para receber pagamentos.',
          style:     BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: BanzamiSpacing.xl),

        Container(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          decoration: const BoxDecoration(
            color:        BanzamiColors.white,
            borderRadius: BanzamiRadius.xxlAll,
            boxShadow:    BanzamiShadows.card,
          ),
          child: Column(children: [
            QrImageView(
              data:                 _qrPayload!,
              version:              QrVersions.auto,
              size:                 256,
              errorCorrectionLevel: QrErrorCorrectLevel.H,
              eyeStyle:        const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color:    BanzamiColors.wine,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color:           BanzamiColors.gray900,
              ),
              embeddedImage:      const AssetImage('assets/images/banzami_icon.png'),
              embeddedImageStyle: const QrEmbeddedImageStyle(size: Size(48, 48)),
            ),
            const SizedBox(height: BanzamiSpacing.lg),
            Text(
              session.merchantName,
              style:     BanzamiTextStyles.headingSm,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              'Qualquer valor · AOA',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            ),
          ]),
        ),

        const SizedBox(height: BanzamiSpacing.xl),

        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            key:       _shareButtonKey,
            onPressed: _sharing ? null : () => _shareQr(session),
            icon:  _sharing
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: BanzamiColors.white),
                  )
                : const Icon(Icons.share_rounded),
            label: const Text('Partilhar QR'),
            style: ElevatedButton.styleFrom(
              backgroundColor: BanzamiColors.wine,
              foregroundColor: BanzamiColors.white,
              padding:         const EdgeInsets.symmetric(vertical: 16),
              shape:           const RoundedRectangleBorder(borderRadius: BanzamiRadius.lgAll),
              textStyle:       BanzamiTextStyles.headingSm,
              elevation:       0,
            ),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.md),

        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ChargeScreen()),
            ),
            icon:  const Icon(Icons.add_rounded),
            label: const Text('Cobrança com valor fixo'),
            style: OutlinedButton.styleFrom(
              foregroundColor: BanzamiColors.wine,
              side:            const BorderSide(color: BanzamiColors.wine),
              padding:         const EdgeInsets.symmetric(vertical: 16),
              shape:           const RoundedRectangleBorder(borderRadius: BanzamiRadius.lgAll),
              textStyle:       BanzamiTextStyles.headingSm,
            ),
          ),
        ),

        const SizedBox(height: BanzamiSpacing.page),
      ]),
    );
  }
}
