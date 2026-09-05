import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_components.dart';
import '../widgets/banzami_verified_mark.dart';

/// Premium confirm-and-pay screen for a scanned structured Banzami QR (merchant
/// static or dynamic). Dynamic QR shows the fixed amount read from the record;
/// static QR lets the payer enter the amount. Settlement goes through
/// `ConsumerPublicClient.payStructuredQr` (POST /v1/qr/pay), which runs the
/// server-side resolve, Progressive-KYC gate, atomic claim and transfer.
class BanzamiStructuredQrPayScreen extends StatefulWidget {
  final ConsumerPublicClient client;

  /// The raw scanned payload, forwarded verbatim to the pay endpoint.
  final String payload;

  /// Static QR → payer enters the amount. Dynamic QR → fixed amount.
  final bool isStatic;

  /// The authenticated consumer's @banza handle (the payer).
  final String payerHandle;

  final String currency;
  final bool isSandbox;

  /// Called with the raw payment result map after a successful settlement.
  final void Function(dynamic result) onSuccess;

  const BanzamiStructuredQrPayScreen({
    super.key,
    required this.client,
    required this.payload,
    required this.isStatic,
    required this.payerHandle,
    required this.onSuccess,
    this.currency = 'AOA',
    this.isSandbox = false,
  });

  @override
  State<BanzamiStructuredQrPayScreen> createState() =>
      _BanzamiStructuredQrPayScreenState();
}

class _BanzamiStructuredQrPayScreenState
    extends State<BanzamiStructuredQrPayScreen>
    with SingleTickerProviderStateMixin {
  bool _resolving = true; // resolving the dynamic amount / owner
  bool _sending = false;
  bool _entered = false;
  bool _paid = false; // settled — showing the success state
  dynamic _result;
  String? _error;
  String? _amountError;

  int _enteredMinor = 0; // static QR
  int? _fixedAmountMinor; // dynamic QR
  String _ownerLabel = 'Pagamento';

  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseScale;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: BanzamiMotion.pulse,
    );
    _pulseScale = Tween<double>(begin: 0.96, end: 1.04).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: BanzamiMotion.standard),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _entered = true);
    });

    if (widget.isStatic) {
      _resolving = false;
      _ownerLabel = 'Comerciante';
    } else {
      _resolveDynamic();
    }
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  Future<void> _resolveDynamic() async {
    try {
      final parsed = await widget.client.decodeQr(widget.payload);
      final id = parsed['qr_code_id'] as String?;
      if (id == null) {
        if (mounted)
          setState(() {
            _resolving = false;
            _error = 'QR inválido.';
          });
        return;
      }
      final res = await widget.client.getQrCode(id);
      final qr = (res['qr_code'] as Map?) ?? const {};
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _fixedAmountMinor = (qr['amount_minor'] as num?)?.toInt();
        _ownerLabel =
            qr['owner_type'] == 'MERCHANT' ? 'Comerciante' : 'Pagamento';
      });
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _error = _humanError(e);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _error = 'Não foi possível ler o QR.';
      });
    }
  }

  int? get _amountMinor {
    if (!widget.isStatic) return _fixedAmountMinor;
    return _enteredMinor > 0 ? _enteredMinor : null;
  }

  Future<void> _pay() async {
    if (_sending) return;
    final amount = _amountMinor;
    if (amount == null || amount <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() {
      _sending = true;
      _error = null;
    });
    _pulseCtrl.repeat(reverse: true);

    try {
      final result = await widget.client.payStructuredQr(
        payer: widget.payerHandle,
        payload: widget.payload,
        amountMinor: widget.isStatic ? amount : null,
      );
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() {
        _sending = false;
        _paid = true;
        _result = result;
      });
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() {
        _sending = false;
        _error = _humanError(e);
      });
    } catch (_) {
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      setState(() {
        _sending = false;
        _error = 'Erro de ligação. Tente novamente.';
      });
    }
  }

  String _humanError(BanzamiApiException e) => switch (e.code) {
        'INSUFFICIENT_FUNDS' => 'Saldo insuficiente para este pagamento.',
        'KYC_REQUIRED' =>
          'Conta limitada. Verifique a sua identidade para pagar.',
        'KYC_NOT_APPROVED' =>
          'A sua verificação de identidade não foi aprovada.',
        'LIMIT_EXCEEDED' => 'Este pagamento excede o seu limite atual.',
        'QR_ALREADY_USED' => 'Este QR já foi utilizado.',
        'QR_EXPIRED' => 'Este QR expirou.',
        'QR_INVALID_SIGNATURE' => 'QR inválido ou adulterado.',
        'PAYER_WALLET_NOT_ACTIVE' => 'A sua carteira não está activa.',
        _ => e.message.isNotEmpty
            ? e.message
            : 'Pagamento falhou. Tente novamente.',
      };

  // ── Review UI ──────────────────────────────────────────────────────────────

  Widget _buildAvatar() {
    return Container(
      width: 72,
      height: 72,
      decoration: const BoxDecoration(
        gradient: BanzamiGradients.primary,
        shape: BoxShape.circle,
      ),
      child: const Center(
        child: Icon(Icons.storefront_rounded,
            color: BanzamiColors.white, size: 34),
      ),
    );
  }

  Widget _buildAmountChip(String amount) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.xl,
        vertical: BanzamiSpacing.md,
      ),
      decoration: BoxDecoration(
        color: BanzamiColors.primary,
        borderRadius: BorderRadius.circular(BanzamiRadius.full),
      ),
      child: Text(
        amount,
        style: BanzamiTextStyles.monoLg.copyWith(
          color: BanzamiColors.white,
          fontSize: 26,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
      ),
    );
  }

  Widget _buildMethodRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: BanzamiColors.gray100,
              borderRadius: BorderRadius.circular(BanzamiRadius.sm),
            ),
            child: const Icon(Icons.account_balance_wallet_rounded,
                size: 18, color: BanzamiColors.primary),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Método de pagamento',
                    style: BanzamiTextStyles.bodySm
                        .copyWith(color: BanzamiColors.gray400)),
                const SizedBox(height: 2),
                Text('Saldo Banzami',
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      color: BanzamiColors.gray900,
                      fontWeight: FontWeight.w600,
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReviewUI() {
    final amount = _amountMinor;
    final amountText =
        amount != null ? formatMinor(amount, widget.currency) : null;
    final buttonLabel = amountText != null ? 'Pagar $amountText' : 'Pagar';

    return AnimatedOpacity(
      opacity: _entered ? 1.0 : 0.0,
      duration: BanzamiMotion.slow,
      curve: Curves.easeOut,
      child: AnimatedSlide(
        offset: _entered ? Offset.zero : const Offset(0, 0.025),
        duration: BanzamiMotion.slow,
        curve: BanzamiMotion.decelerate,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  BanzamiSpacing.xl,
                  40,
                  BanzamiSpacing.xl,
                  BanzamiSpacing.xl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    _buildAvatar(),
                    const SizedBox(height: BanzamiSpacing.md),
                    Text(_ownerLabel,
                        style: BanzamiTextStyles.headingSm.copyWith(
                          color: BanzamiColors.gray900,
                          fontWeight: FontWeight.w700,
                        )),
                    const SizedBox(height: BanzamiSpacing.sm),
                    Text(
                      widget.isStatic
                          ? 'Introduza o montante a pagar'
                          : 'Pagamento por QR',
                      style: BanzamiTextStyles.bodySm
                          .copyWith(color: BanzamiColors.gray400),
                    ),
                    const SizedBox(height: BanzamiSpacing.xl),

                    // Amount — fixed chip (dynamic) or editable input (static).
                    if (!widget.isStatic && amountText != null)
                      _buildAmountChip(amountText)
                    else
                      BanzamiAmountInput(
                        onChanged: (v) => setState(() {
                          _enteredMinor = v;
                          _amountError = null;
                        }),
                        errorText: _amountError,
                      ),

                    const SizedBox(height: BanzamiSpacing.xxl),
                    const Divider(height: 1, color: BanzamiColors.gray100),
                    const SizedBox(height: BanzamiSpacing.lg),
                    _buildMethodRow(),
                    const SizedBox(height: BanzamiSpacing.lg),
                    const Divider(height: 1, color: BanzamiColors.gray100),

                    if (_error != null) ...[
                      const SizedBox(height: BanzamiSpacing.md),
                      BanzamiErrorBanner(message: _error!),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzamiSpacing.xl,
                8,
                BanzamiSpacing.xl,
                BanzamiSpacing.xl,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  BanzamiPrimaryButton(
                    label: buttonLabel,
                    isLoading: false,
                    height: 58,
                    onPressed: _pay,
                  ),
                  const SizedBox(height: BanzamiSpacing.sm),
                  Text(
                    'Pagamento irreversível',
                    style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.gray400,
                      fontSize: 12,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Sending overlay (mirrors BanzamiPaymentRequestScreen) ────────────────────

  Widget _buildOrb() {
    return Container(
      width: 118,
      height: 118,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: BanzamiGradients.primary,
        boxShadow: [
          BoxShadow(
            color: BanzamiColors.primary.withValues(alpha: 0.38),
            blurRadius: 52,
            spreadRadius: 6,
          ),
          BoxShadow(
            color: BanzamiColors.primaryLight.withValues(alpha: 0.20),
            blurRadius: 88,
            spreadRadius: 18,
          ),
        ],
      ),
      child: const Icon(Icons.arrow_upward_rounded,
          color: BanzamiColors.white, size: 46),
    );
  }

  Widget _buildProgressOverlay() {
    final amount = formatMinor(_amountMinor ?? 0, widget.currency);
    return Positioned.fill(
      child: ColoredBox(
        color: BanzamiColors.offWhite,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Spacer(),
                ScaleTransition(scale: _pulseScale, child: _buildOrb()),
                const SizedBox(height: BanzamiSpacing.xxl + BanzamiSpacing.md),
                Text(
                  'A pagar...',
                  style: BanzamiTextStyles.bodyLg.copyWith(
                    color: BanzamiColors.gray600,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: BanzamiSpacing.xl),
                Text(
                  amount,
                  style: BanzamiTextStyles.monoLg.copyWith(
                    color: BanzamiColors.gray900,
                    fontSize: 38,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: BanzamiSpacing.sm),
                Text(
                  _ownerLabel,
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    color: BanzamiColors.gray400,
                  ),
                ),
                const Spacer(),
                const SizedBox(height: BanzamiSpacing.xl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Success state ────────────────────────────────────────────────────────

  Widget _buildSuccessUI() {
    final amount = formatMinor(_amountMinor ?? 0, widget.currency);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
        child: Column(
          children: [
            const Spacer(),
            const BanzamiVerifiedMark(size: 96, onLight: true),
            const SizedBox(height: BanzamiSpacing.xl),
            Text('Pagamento concluído',
                style: BanzamiTextStyles.headingSm.copyWith(
                  color: BanzamiColors.gray900,
                  fontWeight: FontWeight.w700,
                )),
            const SizedBox(height: BanzamiSpacing.sm),
            Text(amount,
                style: BanzamiTextStyles.monoLg.copyWith(
                  color: BanzamiColors.primary,
                  fontSize: 34,
                  fontWeight: FontWeight.w700,
                )),
            const SizedBox(height: 4),
            Text(_ownerLabel,
                style: BanzamiTextStyles.bodyMd
                    .copyWith(color: BanzamiColors.gray400)),
            const Spacer(),
            BanzamiPrimaryButton(
              label: 'Concluir',
              height: 58,
              onPressed: () {
                widget.onSuccess(_result);
                Navigator.of(context).pop();
              },
            ),
            const SizedBox(height: BanzamiSpacing.xl),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_resolving) {
      return const BanzamiScaffold(
        appBar: BanzamiAppBar(title: 'Pagar', showBack: true),
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_paid) {
      return BanzamiScaffold(body: _buildSuccessUI());
    }
    return BanzamiScaffold(
      appBar: _sending
          ? null
          : const BanzamiAppBar(title: 'Confirmar pagamento', showBack: true),
      body: Stack(
        children: [
          if (!_sending) SafeArea(child: _buildReviewUI()),
          if (_sending) _buildProgressOverlay(),
        ],
      ),
    );
  }
}
