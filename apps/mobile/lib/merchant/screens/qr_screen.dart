import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../branding_assets.dart';
import '../../widgets/app_screen_header.dart';

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
    final data  = await rootBundle.load(BrandingAssets.businessLogo);
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth:  160,
      targetHeight: 160,
    );
    final frame    = await codec.getNextFrame();
    final composed = await composeQrCenterLogo(frame.image);
    if (mounted) setState(() => _logoImage = composed);
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
          color:    BanzamiColors.primary,
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color:           BanzamiColors.gray900,
        ),
        embeddedImage:      _logoImage,
        embeddedImageStyle: const QrEmbeddedImageStyle(
          size: Size(512 * kQrEmbeddedBoxFraction, 512 * kQrEmbeddedBoxFraction)),
      );

      final byteData = await painter.toImageData(512);
      if (byteData == null) throw Exception('QR render retornou imagem vazia');
      final bytes = byteData.buffer.asUint8List();

      // App-private cache directory — never a world-readable location for a
      // merchant payment QR. The file is removed again after sharing.
      final dir  = await getTemporaryDirectory();
      final file = File('${dir.path}/qr_${session.merchantId}.png');
      await file.writeAsBytes(bytes);

      final box    = _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;

      try {
        await Share.shareXFiles(
          [XFile(file.path, mimeType: 'image/png')],
          subject:             'QR de pagamento — ${session.merchantName}',
          sharePositionOrigin: origin,
        );
      } finally {
        if (await file.exists()) {
          try { await file.delete(); } catch (_) {/* best-effort cleanup */}
        }
      }
    } catch (e) {
      if (mounted) {
        BanzamiToast.showError(context, 'Erro ao partilhar: $e');
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session!;

    return BanzamiScaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppScreenHeader(
              title:    'Receber',
              subtitle: 'QR Code e ligação de pagamento',
              trailing: IconButton(
                icon:      const Icon(Icons.refresh_rounded, size: 20),
                color:     BanzamiColors.gray400,
                onPressed: _loadQr,
                tooltip:   'Regenerar QR',
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: BanzamiColors.primary))
                  : _error != null
                      ? _buildError()
                      : _buildBody(session),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
      const SizedBox(height: 12),
      Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
      const SizedBox(height: 16),
      BanzamiGhostButton(label: 'Tentar novamente', onPressed: _loadQr),
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
            CustomPaint(
              size: const Size(256, 256),
              painter: QrPainter(
                data:                 _qrPayload!,
                version:              QrVersions.auto,
                errorCorrectionLevel: QrErrorCorrectLevel.H,
                eyeStyle: const QrEyeStyle(
                  eyeShape: QrEyeShape.square,
                  color:    BanzamiColors.primary,
                ),
                dataModuleStyle: const QrDataModuleStyle(
                  dataModuleShape: QrDataModuleShape.square,
                  color:           BanzamiColors.gray900,
                ),
                embeddedImage:      _logoImage,
                embeddedImageStyle: _logoImage != null
                    ? const QrEmbeddedImageStyle(
                        size: Size(256 * kQrEmbeddedBoxFraction, 256 * kQrEmbeddedBoxFraction))
                    : null,
              ),
            ),
            const SizedBox(height: BanzamiSpacing.lg),
            Text(
              session.merchantName,
              style:     BanzamiTextStyles.headingSm,
              textAlign: TextAlign.center,
            ),
            if (session.banzaAddress != null) ...[
              const SizedBox(height: 2),
              Text(
                'Receber em ${session.banzaAddress}',
                style: BanzamiTextStyles.bodyMd.copyWith(
                  color: BanzamiColors.primary, fontWeight: FontWeight.w700),
                textAlign: TextAlign.center,
              ),
            ],
            const SizedBox(height: 4),
            Text(
              'Qualquer valor · AOA',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            ),
          ]),
        ),

        const SizedBox(height: BanzamiSpacing.xl),

        BanzamiPrimaryButton(
          key:       _shareButtonKey,
          label:     'Partilhar QR',
          icon:      Icons.share_rounded,
          isLoading: _sharing,
          onPressed: _sharing ? null : () => _shareQr(session),
        ),
        const SizedBox(height: BanzamiSpacing.md),

        BanzamiSecondaryButton(
          label:     'Cobrança com valor fixo',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const ChargeScreen()),
          ),
        ),

        const SizedBox(height: BanzamiSpacing.page),
      ]),
    );
  }
}
