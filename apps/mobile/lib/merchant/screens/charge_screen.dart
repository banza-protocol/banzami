import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../branding_assets.dart';
import '../config.dart';
import '../services/merchant_session_service.dart';
import 'split_track_screen.dart';

/// Cria uma cobrança (link de pagamento) e exibe o QR + link para partilhar.
///
/// Dois modos:
///  • Simples   — uma cobrança, um QR/link (comportamento original).
///  • Dividida  — o valor total é dividido igualmente por N pessoas como uma
///                Collection do protocolo (BANZA ADR-036): um único objeto
///                financeiro com N partes (shares) que se pagam de forma
///                independente e liquidam direto na carteira do comerciante.
///                O acompanhamento (quem pagou / o que falta) fica no
///                `SplitTrackScreen`.
///
/// Fluxo protocol-first (BANZA ADR-035): o conceito nasce no protocolo
/// (Collections), é implementado pelo operador, exposto pelo SDK
/// (`createEqualSplitCollection`) e só aqui consumido pela app. `AppConfig.
/// splitChargeEnabled` controla apenas a visibilidade do modo na UI.
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

  // Charge type — false = simple (one link), true = split (N links).
  bool _split  = false;
  int  _people = 2;

  static const int _kMinPeople = 2;
  static const int _kMaxPeople = 20;

  bool         _creating = false;
  bool         _sharing  = false;
  String?      _error;
  PaymentLink? _link;          // simple result
  ui.Image?    _logoUiImage;

  @override
  void initState() {
    super.initState();
    _loadLogo();
    _amountCtrl.addListener(() => setState(() {})); // live per-person preview
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
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
    if (mounted) setState(() => _logoUiImage = composed);
  }

  // Amounts are entered and displayed in WHOLE kwanzas (cêntimos are not used in
  // practice) with a space thousands separator: "50 000 Kz". `parseAmountInput`
  // strips the spaces; the ledger stores minor units (× 100).
  static const int _maxKz = 10000000; // 10 million Kz sanity cap

  /// The typed total in whole kwanzas (0 when empty/invalid).
  int get _amountKz => parseAmountInput(_amountCtrl.text);

  /// Per-person parts in whole kwanzas, distributing any remainder across the
  /// first participants so the sum is ALWAYS exactly the total. Empty until a
  /// valid total + people count exist.
  List<int> get _splitParts => (_amountKz > 0 && _amountKz <= _maxKz && _people >= _kMinPeople)
      ? splitEvenly(_amountKz, _people)
      : const [];

  /// Kwanzas left over after an even division (0 when it divides exactly).
  int get _splitRemainder => _amountKz % _people;

  // ── Simple charge ────────────────────────────────────────────────────────────

  Future<void> _create() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _creating = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();

    // Whole kwanzas → minor units. Empty ⇒ free amount (null).
    final kz = _amountKz;
    final int? amountMinor = kz > 0 ? kz * 100 : null;

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

  // ── Split charge ─────────────────────────────────────────────────────────────

  Future<void> _createSplit() async {
    final parts = _splitParts;
    if (parts.isEmpty) return; // guarded by button state
    setState(() { _creating = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();
    final desc    = _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim();

    // One protocol Collection (BANZA ADR-036) with a fixed share per person.
    // We send the exact per-person amounts (remainder already distributed) so
    // the preview matches the created shares and the core validates that the
    // parts sum to the total. Each share settles into the merchant wallet when
    // paid; no money moves until then.
    try {
      final result = await client.createFixedAmountsCollection(
        walletId:         session.walletId,
        totalAmountMinor: _amountKz * 100,
        amountsMinor:     parts.map((p) => p * 100).toList(),
        title:            desc,
      );
      if (!mounted) return;
      _reset();
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => SplitTrackScreen(
          collectionId:      result.collection.id,
          initialCollection: result.collection,
          initialShares:     result.shares,
        ),
      ));
    } on BanzamiApiException catch (e) {
      setState(() => _error = e.message);
    } on BanzamiNetworkException {
      setState(() => _error = 'Sem ligação. Verifique a sua rede.');
    } catch (_) {
      setState(() => _error = 'Não foi possível criar a cobrança dividida.');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  // ── Sharing ──────────────────────────────────────────────────────────────────

  String get _payUrl => '${AppConfig.payBaseUrl}/${_link?.slug ?? ''}';

  Future<void> _shareLink(PaymentLink link) async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final subject = link.amountMinor != null
          ? 'Pagamento Banzami — ${formatMinor(link.amountMinor!, link.currency)}'
          : 'Pagamento Banzami';
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

  void _reset() => setState(() {
        _link       = null;
        _error      = null;
        _amountCtrl.clear();
        _descCtrl.clear();
        _people = _kMinPeople;
        _split  = false;
      });

  @override
  Widget build(BuildContext context) {
    final Widget body;
    if (_link != null) {
      body = _buildResult();
    } else {
      body = _buildForm();
    }

    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      appBar: const BanzamiAppBar(
        title:           'Nova cobrança',
        backgroundColor: BanzamiColors.white,
      ),
      body: body,
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
          // ── Type toggle ──────────────────────────────────────────────────
          // Pre-protocol: the split mode only appears when explicitly enabled.
          // When disabled, the toggle is hidden and the screen is the original
          // simple charge (no way to set _split = true). See Banzami ADR-019.
          if (AppConfig.splitChargeEnabled) ...[
            _ChargeTypeToggle(
              split: _split,
              onChanged: (v) => setState(() { _split = v; _error = null; }),
            ),
            const SizedBox(height: BanzamiSpacing.xl),
          ],

          Text(
            _split ? 'Cobrança dividida' : 'Detalhes da cobrança',
            style: BanzamiTextStyles.headingSm,
          ),
          const SizedBox(height: BanzamiSpacing.xl),

          TextFormField(
            controller:  _amountCtrl,
            keyboardType: TextInputType.number,
            inputFormatters: const [_ThousandsSpaceFormatter()],
            decoration: InputDecoration(
              labelText:  _split ? 'Valor total em Kz (ex: 50 000)' : 'Valor em Kz (ex: 250)',
              hintText:   _split ? null : 'Deixe em branco para valor livre',
              prefixIcon: const Icon(Icons.payments_outlined),
              suffixText: 'Kz',
            ),
            validator: (v) {
              final kz = parseAmountInput(v ?? '');
              if (kz == 0) {
                // Total is required for split; free amount is allowed for simple.
                return _split ? 'Indique o valor total' : null;
              }
              if (kz > _maxKz) {
                return 'Valor demasiado alto.';
              }
              return null;
            },
          ),
          const SizedBox(height: BanzamiSpacing.lg),

          if (_split) ..._buildSplitFields(),

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
            _ErrorBox(message: _error!),
          ],

          const SizedBox(height: BanzamiSpacing.xxl),

          SizedBox(
            width: double.infinity,
            child: BanzamiPrimaryButton(
              label:     _split ? 'Gerar cobrança dividida' : 'Gerar cobrança',
              onPressed: _creating
                  ? null
                  : (_split ? (_splitParts.isNotEmpty ? _createSplit : null) : _create),
              isLoading: _creating,
            ),
          ),
        ]),
      ),
    );
  }

  // Split-only fields: people stepper + per-person preview + helper copy.
  List<Widget> _buildSplitFields() {
    final parts = _splitParts;

    return [
      // People stepper
      Container(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg, vertical: BanzamiSpacing.sm),
        decoration: BoxDecoration(
          color:        BanzamiColors.offWhite,
          borderRadius: BanzamiRadius.lgAll,
          border:       Border.all(color: BanzamiColors.gray200),
        ),
        child: Row(children: [
          const Icon(Icons.group_outlined, color: BanzamiColors.gray400, size: 20),
          const SizedBox(width: BanzamiSpacing.sm),
          const Expanded(
            child: Text('Número de pessoas', style: BanzamiTextStyles.bodyMd),
          ),
          _StepButton(
            icon:    Icons.remove_rounded,
            onTap:   _people > _kMinPeople
                ? () => setState(() => _people--)
                : null,
          ),
          SizedBox(
            width: 36,
            child: Text(
              '$_people',
              textAlign: TextAlign.center,
              style: BanzamiTextStyles.headingSm,
            ),
          ),
          _StepButton(
            icon:    Icons.add_rounded,
            onTap:   _people < _kMaxPeople
                ? () => setState(() => _people++)
                : null,
          ),
        ]),
      ),
      const SizedBox(height: BanzamiSpacing.lg),

      // Division preview — one line per person. The remainder is distributed
      // across the first participants, so the sum is always exactly the total.
      if (parts.isNotEmpty) ...[
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          decoration: BoxDecoration(
            color:        BanzamiColors.primary.withValues(alpha: 0.06),
            borderRadius: BanzamiRadius.lgAll,
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Total',
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
              MoneyAmount.kwanza(_amountKz, size: MoneySize.md),
            ]),
            const SizedBox(height: BanzamiSpacing.sm),
            const Divider(height: 1, color: BanzamiColors.gray200),
            const SizedBox(height: BanzamiSpacing.sm),
            for (var i = 0; i < parts.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('Pessoa ${i + 1}', style: BanzamiTextStyles.bodyMd),
                  MoneyAmount.kwanza(parts[i], size: MoneySize.sm, tone: MoneyTone.brand),
                ]),
              ),
          ]),
        ),
        const SizedBox(height: BanzamiSpacing.sm),
        if (_splitRemainder != 0)
          Text(
            'Este valor não divide exatamente. Ajustámos automaticamente a diferença '
            'de ${formatKwanza(_splitRemainder)} entre os primeiros participantes.',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        const SizedBox(height: 2),
        Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.check_circle_rounded, size: 14, color: BanzamiColors.success),
          const SizedBox(width: 4),
          Text('A soma das partes é sempre igual ao valor total.',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
        ]),
      ],

      const SizedBox(height: BanzamiSpacing.md),
      Text(
        'Cada pessoa paga a sua parte e o dinheiro entra na sua carteira '
        'imediatamente. Vai poder acompanhar quem já pagou.',
        style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
      ),
      const SizedBox(height: BanzamiSpacing.lg),
    ];
  }

  // ---------------------------------------------------------------------------
  // Resultado — cobrança simples (QR + link)
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
          MoneyAmount(link.amountMinor!, currency: link.currency,
              size: MoneySize.xl, tone: MoneyTone.brand, align: TextAlign.center),
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
            borderRadius: BanzamiRadius.fieldAll,
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
                color:    BanzamiColors.primary,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color:           BanzamiColors.gray900,
              ),
              embeddedImage:      _logoUiImage,
              embeddedImageStyle: _logoUiImage != null
                  ? const QrEmbeddedImageStyle(
                      size: Size(220 * kQrEmbeddedBoxFraction, 220 * kQrEmbeddedBoxFraction))
                  : null,
            ),
          ),
        ),

        const SizedBox(height: BanzamiSpacing.xl),

        // Partilhar
        SizedBox(
          width: double.infinity,
          child: BanzamiPrimaryButton(
            key:       _shareButtonKey,
            label:     'Partilhar link',
            isLoading: _sharing,
            onPressed: _sharing ? null : () => _shareLink(link),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.md),

        // Nova cobrança
        BanzamiSecondaryButton(
          label:     'Nova cobrança',
          onPressed: _reset,
        ),
      ]),
    );
  }

}

// =============================================================================
// Charge-type segmented toggle (Simples / Dividida) — built from existing tokens
// =============================================================================

class _ChargeTypeToggle extends StatelessWidget {
  final bool split;
  final ValueChanged<bool> onChanged;

  const _ChargeTypeToggle({required this.split, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color:        BanzamiColors.offWhite,
        borderRadius: BanzamiRadius.xlAll,
        border:       Border.all(color: BanzamiColors.gray200),
      ),
      child: Row(children: [
        _segment(label: 'Simples',  selected: !split, onTap: () => onChanged(false)),
        _segment(label: 'Dividida', selected: split,  onTap: () => onChanged(true)),
      ]),
    );
  }

  Widget _segment({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap:    onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration:   const Duration(milliseconds: 180),
          curve:      Curves.easeInOut,
          padding:    const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color:        selected ? BanzamiColors.white : Colors.transparent,
            borderRadius: BanzamiRadius.lgAll,
            boxShadow: selected
                ? [BoxShadow(
                    color:      BanzamiColors.gray400.withValues(alpha: 0.18),
                    blurRadius: 8, offset: const Offset(0, 2))]
                : null,
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: BanzamiTextStyles.label.copyWith(
              fontSize:   14,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color:      selected ? BanzamiColors.primary : BanzamiColors.gray400,
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// People stepper button
// =============================================================================

class _StepButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _StepButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap:    onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width:  36, height: 36,
        decoration: BoxDecoration(
          color: enabled
              ? BanzamiColors.primary.withValues(alpha: 0.10)
              : BanzamiColors.gray100,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 20,
            color: enabled ? BanzamiColors.primary : BanzamiColors.gray400),
      ),
    );
  }
}

// =============================================================================
// Live thousands-space input formatter — "50000" shows as "50 000" while typing.
// Whole kwanzas only (cêntimos are not used in practice); the ' Kz' suffix is
// rendered by the field decoration, not stored in the value.
// =============================================================================

class _ThousandsSpaceFormatter extends TextInputFormatter {
  const _ThousandsSpaceFormatter();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final formatted = formatAmountInput(newValue.text);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}

// =============================================================================
// Inline error box (reused for API errors)
// =============================================================================

class _ErrorBox extends StatelessWidget {
  final String message;
  const _ErrorBox({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color:        BanzamiColors.error.withValues(alpha: 0.08),
        borderRadius: BanzamiRadius.lgAll,
      ),
      child: Row(children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(message,
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error))),
      ]),
    );
  }
}
