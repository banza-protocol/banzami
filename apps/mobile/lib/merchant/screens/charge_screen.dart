import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../../branding_assets.dart';
import '../config.dart';
import '../services/merchant_session_service.dart';

/// Cria uma cobrança (link de pagamento) e exibe o QR + link para partilhar.
class ChargeScreen extends StatefulWidget {
  const ChargeScreen({super.key});

  @override
  State<ChargeScreen> createState() => _ChargeScreenState();
}

class _ChargeScreenState extends State<ChargeScreen> {
  final _formKey        = GlobalKey<FormState>();
  final _shareButtonKey = GlobalKey();
  final _amountCtrl     = TextEditingController();
  final _descCtrl       = TextEditingController();

  bool         _creating = false;
  bool         _sharing  = false;
  String?      _error;
  PaymentLink? _link;
  ui.Image?    _logoUiImage;

  @override
  void initState() {
    super.initState();
    _loadLogo();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadLogo() async {
    final data  = await rootBundle.load(BrandingAssets.icon);
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth:  160,
      targetHeight: 160,
    );
    final frame   = await codec.getNextFrame();
    final rounded = await roundQrLogoCorners(frame.image);
    if (mounted) setState(() => _logoUiImage = rounded);
  }

  // Converts a user-typed Kz string (e.g. "250" or "250,50") to minor units
  // (cêntimos). Accepts comma or period as decimal separator but NOT as
  // thousands separator — "2.500" is rejected to avoid 1000× mistakes.
  // Returns null if the input is invalid.
  static int? _parseKzToMinor(String raw) {
    // Normalise decimal separator, then reject anything with > 1 separator
    final normalised = raw.replaceAll(',', '.');
    if (normalised.split('.').length > 2) return null;    // multiple separators
    final value = double.tryParse(normalised);
    if (value == null || value <= 0) return null;
    const int maxKz = 10000000; // 10 million Kz sanity cap
    if (value > maxKz) return null;
    return (value * 100).round();
  }

  Future<void> _create() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _creating = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();

    // Parse Kz input → minor units (centimos). Reject comma/period as
    // thousands separator — only accept a single decimal part.
    final raw = _amountCtrl.text.trim();
    final int? amountMinor = raw.isEmpty
        ? null
        : _parseKzToMinor(raw);

    try {
      final link = await client.createPaymentLink(
        merchantId:  session.merchantId,
        walletId:    session.walletId,
        amountMinor: amountMinor,
        description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      );
      setState(() => _link = link);
    } on BanzamiApiException catch (e) {
      setState(() => _error = e.message);
    } on BanzamiNetworkException {
      setState(() => _error = 'Sem ligação. Verifique a sua rede.');
    } catch (_) {
      setState(() => _error = 'Não foi possível criar a cobrança.');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _shareLink(PaymentLink link) async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final subject = link.amountMinor != null
          ? 'Pagamento Banza — ${formatMinor(link.amountMinor!, link.currency)}'
          : 'Pagamento Banza';
      final box    = _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.share(_payUrl, subject: subject, sharePositionOrigin: origin);
    } catch (e) {
      if (mounted) {
        BanzamiToast.showError(context, 'Erro ao partilhar: $e');
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  String get _payUrl => '${AppConfig.payBaseUrl}/${_link?.slug ?? ''}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title: const Text('Nova cobrança', style: BanzamiTextStyles.headingSm),
      ),
      body: _link != null ? _buildResult() : _buildForm(),
    );
  }

  // ---------------------------------------------------------------------------
  // Formulário
  // ---------------------------------------------------------------------------

  Widget _buildForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Detalhes da cobrança', style: BanzamiTextStyles.headingSm),
          const SizedBox(height: BanzamiSpacing.xl),

          TextFormField(
            controller:  _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9,.]'))],
            decoration: const InputDecoration(
              labelText:  'Valor em Kz (ex: 250)',
              hintText:   'Deixe em branco para valor livre',
              prefixIcon: Icon(Icons.payments_outlined),
              suffixText: 'Kz',
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return null;
              if (_parseKzToMinor(v.trim()) == null) {
                return 'Valor inválido. Insira o montante em Kz (ex: 250)';
              }
              return null;
            },
          ),
          const SizedBox(height: BanzamiSpacing.lg),

          TextFormField(
            controller:  _descCtrl,
            maxLength:   120,
            decoration: const InputDecoration(
              labelText:  'Descrição (opcional)',
              hintText:   'Ex: Produto, serviço, referência…',
              prefixIcon: Icon(Icons.notes_rounded),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: BanzamiSpacing.lg),
            Container(
              padding: const EdgeInsets.all(BanzamiSpacing.md),
              decoration: BoxDecoration(
                color:        BanzamiColors.error.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(children: [
                const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text(_error!,
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error))),
              ]),
            ),
          ],

          const SizedBox(height: BanzamiSpacing.xxl),

          SizedBox(
            width: double.infinity,
            child: BanzamiButton(
              label:     'Gerar cobrança',
              onPressed: _creating ? null : _create,
              isLoading: _creating,
            ),
          ),
        ]),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Resultado — QR + link
  // ---------------------------------------------------------------------------

  Widget _buildResult() {
    final link    = _link!;
    final session = context.read<MerchantSessionService>().session!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(children: [
        const SizedBox(height: BanzamiSpacing.lg),

        Text(
          session.merchantName,
          style: BanzamiTextStyles.label.copyWith(
            color:          BanzamiColors.gray400,
            letterSpacing:  0.5,
          ),
        ),
        const SizedBox(height: BanzamiSpacing.xs),

        if (link.amountMinor != null)
          Text(
            formatMinor(link.amountMinor!, link.currency),
            style: BanzamiTextStyles.displayLg.copyWith(
              color:      BanzamiColors.wine,
              fontWeight: FontWeight.w700,
            ),
          ),
        if (link.description != null) ...[
          const SizedBox(height: 4),
          Text(link.description!,
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        ],

        const SizedBox(height: BanzamiSpacing.xl),

        // QR code
        Container(
          padding:     const EdgeInsets.all(BanzamiSpacing.lg),
          decoration:  BoxDecoration(
            color:        BanzamiColors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color:       BanzamiColors.gray400.withValues(alpha: 0.2),
                blurRadius:  16,
                offset:      const Offset(0, 4),
              ),
            ],
          ),
          child: CustomPaint(
            size: const Size(220, 220),
            painter: QrPainter(
              data:                 _payUrl,
              version:              QrVersions.auto,
              errorCorrectionLevel: QrErrorCorrectLevel.H,
              eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color:    BanzamiColors.wine,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color:           BanzamiColors.gray900,
              ),
              embeddedImage:      _logoUiImage,
              embeddedImageStyle: _logoUiImage != null
                  ? const QrEmbeddedImageStyle(size: Size(44, 44))
                  : null,
            ),
          ),
        ),

        const SizedBox(height: BanzamiSpacing.xl),

        // URL — tap to copy
        GestureDetector(
          onTap: () async {
            await Clipboard.setData(ClipboardData(text: _payUrl));
            if (!mounted) return;
            BanzamiToast.showSuccess(context, 'Link copiado');
          },
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.lg, vertical: BanzamiSpacing.md),
            decoration: BoxDecoration(
              color:        BanzamiColors.gray100,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              Expanded(child: Text(_payUrl,
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray700),
                  overflow: TextOverflow.ellipsis)),
              const SizedBox(width: 8),
              const Icon(Icons.copy_rounded, size: 18, color: BanzamiColors.gray400),
            ]),
          ),
        ),

        const SizedBox(height: BanzamiSpacing.xl),

        // Partilhar
        SizedBox(
          width: double.infinity,
          child: BanzamiButton(
            key:       _shareButtonKey,
            label:     'Partilhar link',
            isLoading: _sharing,
            onPressed: _sharing ? null : () => _shareLink(link),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.md),

        // Nova cobrança
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: () => setState(() { _link = null; _amountCtrl.clear(); _descCtrl.clear(); }),
            style: OutlinedButton.styleFrom(
              foregroundColor: BanzamiColors.wine,
              side:            const BorderSide(color: BanzamiColors.wine),
              padding:         const EdgeInsets.symmetric(vertical: 14),
              shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Nova cobrança'),
          ),
        ),
      ]),
    );
  }
}
