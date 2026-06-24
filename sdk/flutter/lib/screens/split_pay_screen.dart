import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_components.dart';
import '../widgets/banzami_verified_mark.dart';

/// Premium pay-into-split screen (P2P-002). Resolves the split session, shows
/// the group total and how much is still owed, and lets the payer contribute
/// their share via `ConsumerPublicClient.paySplit`. The server caps each
/// contribution at the remaining amount (no over-collection).
class BanzamiSplitPayScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String splitId;
  final String payerHandle;
  final String currency;
  final bool isSandbox;
  final void Function(dynamic result) onSuccess;

  const BanzamiSplitPayScreen({
    super.key,
    required this.client,
    required this.splitId,
    required this.payerHandle,
    required this.onSuccess,
    this.currency = 'AOA',
    this.isSandbox = false,
  });

  @override
  State<BanzamiSplitPayScreen> createState() => _BanzamiSplitPayScreenState();
}

class _BanzamiSplitPayScreenState extends State<BanzamiSplitPayScreen>
    with SingleTickerProviderStateMixin {
  bool _resolving = true;
  bool _sending = false;
  bool _paid = false;
  bool _entered = false;
  String? _error;
  String? _amountError;

  int _totalMinor = 0;
  int _paidMinor = 0;
  int _remainingMinor = 0;
  String _status = 'OPEN';
  String _currency = 'AOA';

  int _enteredMinor = 0;
  int _resultPaidMinor = 0;
  int _resultRemainingMinor = 0;
  bool _resultComplete = false;
  dynamic _result;

  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseScale;

  @override
  void initState() {
    super.initState();
    _currency = widget.currency;
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
    _resolve();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  Future<void> _resolve() async {
    try {
      final s = await widget.client.getSplit(widget.splitId);
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _totalMinor = (s['total_minor'] as num?)?.toInt() ?? 0;
        _paidMinor = (s['paid_minor'] as num?)?.toInt() ?? 0;
        _remainingMinor = (s['remaining_minor'] as num?)?.toInt() ?? 0;
        _status = (s['status'] as String?) ?? 'OPEN';
        _currency = (s['currency'] as String?) ?? widget.currency;
        _enteredMinor = _remainingMinor; // default to settling the rest
      });
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _error = e.message.isNotEmpty ? e.message : 'Divisão não encontrada.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _resolving = false;
        _error = 'Não foi possível abrir a divisão.';
      });
    }
  }

  Future<void> _pay() async {
    if (_sending) return;
    final amount = _enteredMinor;
    if (amount <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }
    if (amount > _remainingMinor) {
      setState(() => _amountError =
          'Máximo ${formatMinor(_remainingMinor, _currency)} em falta');
      return;
    }

    HapticFeedback.mediumImpact();
    setState(() {
      _sending = true;
      _error = null;
    });
    _pulseCtrl.repeat(reverse: true);

    try {
      final result = await widget.client.paySplit(
        id: widget.splitId,
        payer: widget.payerHandle,
        amountMinor: amount,
      );
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() {
        _sending = false;
        _paid = true;
        _result = result;
        _resultPaidMinor = (result['paid_minor'] as num?)?.toInt() ?? 0;
        _resultRemainingMinor = (result['remaining_minor'] as num?)?.toInt() ?? 0;
        _resultComplete = (result['completed'] as bool?) ?? false;
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
        'AMOUNT_EXCEEDS_REMAINING' =>
          'Esse valor excede o que falta nesta divisão.',
        'SPLIT_NOT_OPEN' => 'Esta divisão já foi concluída.',
        'KYC_REQUIRED' =>
          'Conta limitada. Verifique a sua identidade para pagar.',
        'KYC_NOT_APPROVED' => 'A sua verificação de identidade não foi aprovada.',
        'LIMIT_EXCEEDED' => 'Este pagamento excede o seu limite atual.',
        'PAYER_WALLET_NOT_ACTIVE' => 'A sua carteira não está activa.',
        _ => e.message.isNotEmpty ? e.message : 'Pagamento falhou. Tente novamente.',
      };

  // ── Review UI ──────────────────────────────────────────────────────────────

  Widget _buildAvatar() => Container(
        width: 72,
        height: 72,
        decoration: const BoxDecoration(
          gradient: BanzamiGradients.primary,
          shape: BoxShape.circle,
        ),
        child: const Center(
          child: Icon(Icons.groups_rounded, color: BanzamiColors.white, size: 36),
        ),
      );

  Widget _progressBar() {
    final frac = _totalMinor == 0 ? 0.0 : (_paidMinor / _totalMinor).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(BanzamiRadius.full),
          child: LinearProgressIndicator(
            value: frac,
            minHeight: 8,
            backgroundColor: BanzamiColors.gray100,
            valueColor: const AlwaysStoppedAnimation(BanzamiColors.primary),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.sm),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('${formatMinor(_paidMinor, _currency)} pago',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
            Text('${formatMinor(_remainingMinor, _currency)} em falta',
                style: BanzamiTextStyles.bodySm.copyWith(
                    color: BanzamiColors.gray900, fontWeight: FontWeight.w600)),
          ],
        ),
      ],
    );
  }

  Widget _buildReviewUI() {
    final closed = _status != 'OPEN' || _remainingMinor <= 0;
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
                    BanzamiSpacing.xl, 40, BanzamiSpacing.xl, BanzamiSpacing.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    _buildAvatar(),
                    const SizedBox(height: BanzamiSpacing.md),
                    Text('Divisão de conta',
                        style: BanzamiTextStyles.headingSm.copyWith(
                            color: BanzamiColors.gray900, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text('Total ${formatMinor(_totalMinor, _currency)}',
                        style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                    const SizedBox(height: BanzamiSpacing.lg),
                    _progressBar(),
                    const SizedBox(height: BanzamiSpacing.xl),
                    if (closed)
                      BanzamiErrorBanner(
                          message: _status != 'OPEN'
                              ? 'Esta divisão já está concluída.'
                              : 'Esta divisão já está totalmente paga.')
                    else ...[
                      Text('A sua parte',
                          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                      const SizedBox(height: BanzamiSpacing.sm),
                      BanzamiAmountInput(
                        initialAmountMinor: _remainingMinor,
                        onChanged: (v) => setState(() {
                          _enteredMinor = v;
                          _amountError = null;
                        }),
                        errorText: _amountError,
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: BanzamiSpacing.md),
                      BanzamiErrorBanner(message: _error!),
                    ],
                  ],
                ),
              ),
            ),
            if (!closed)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    BanzamiSpacing.xl, 8, BanzamiSpacing.xl, BanzamiSpacing.xl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    BanzamiPrimaryButton(
                      label: _enteredMinor > 0
                          ? 'Pagar ${formatMinor(_enteredMinor, _currency)}'
                          : 'Pagar',
                      isLoading: false,
                      height: 58,
                      onPressed: _pay,
                    ),
                    const SizedBox(height: BanzamiSpacing.sm),
                    Text('Pagamento irreversível',
                        style: BanzamiTextStyles.bodySm
                            .copyWith(color: BanzamiColors.gray400, fontSize: 12),
                        textAlign: TextAlign.center),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ── Sending overlay ──────────────────────────────────────────────────────

  Widget _buildOrb() => Container(
        width: 118,
        height: 118,
        decoration: BoxDecoration(
          shape:    BoxShape.circle,
          gradient: BanzamiGradients.primary,
          boxShadow: [
            BoxShadow(
                color: BanzamiColors.primary.withValues(alpha: 0.38),
                blurRadius: 52,
                spreadRadius: 6),
            BoxShadow(
                color: BanzamiColors.primaryLight.withValues(alpha: 0.20),
                blurRadius: 88,
                spreadRadius: 18),
          ],
        ),
        child: const Icon(Icons.arrow_upward_rounded, color: BanzamiColors.white, size: 46),
      );

  Widget _buildProgressOverlay() {
    return Positioned.fill(
      child: ColoredBox(
        color: BanzamiColors.offWhite,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
            child: Column(
              children: [
                const Spacer(),
                ScaleTransition(scale: _pulseScale, child: _buildOrb()),
                const SizedBox(height: BanzamiSpacing.xxl + BanzamiSpacing.md),
                Text('A pagar a sua parte...',
                    style: BanzamiTextStyles.bodyLg.copyWith(
                        color: BanzamiColors.gray600,
                        fontWeight: FontWeight.w500)),
                const SizedBox(height: BanzamiSpacing.xl),
                Text(formatMinor(_enteredMinor, _currency),
                    style: BanzamiTextStyles.monoLg.copyWith(
                        color: BanzamiColors.gray900, fontSize: 38, fontWeight: FontWeight.w700)),
                const Spacer(),
                const SizedBox(height: BanzamiSpacing.xl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSuccessUI() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
        child: Column(
          children: [
            const Spacer(),
            const BanzamiVerifiedMark(size: 96, onLight: true),
            const SizedBox(height: BanzamiSpacing.xl),
            Text(_resultComplete ? 'Divisão concluída!' : 'Parte paga',
                style: BanzamiTextStyles.headingSm.copyWith(
                    color: BanzamiColors.gray900, fontWeight: FontWeight.w700)),
            const SizedBox(height: BanzamiSpacing.sm),
            Text(formatMinor(_resultComplete ? _resultPaidMinor : _enteredMinor, _currency),
                style: BanzamiTextStyles.monoLg.copyWith(
                    color: BanzamiColors.primary, fontSize: 34, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(
              _resultComplete
                  ? 'O total foi atingido'
                  : '${formatMinor(_resultRemainingMinor, _currency)} ainda em falta',
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
            ),
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
        appBar: BanzamiAppBar(title: 'Divisão', showBack: true),
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_paid) {
      return BanzamiScaffold(body: _buildSuccessUI());
    }
    return BanzamiScaffold(
      appBar: _sending ? null : const BanzamiAppBar(title: 'Dividir conta', showBack: true),
      body: Stack(
        children: [
          if (!_sending) SafeArea(child: _buildReviewUI()),
          if (_sending) _buildProgressOverlay(),
        ],
      ),
    );
  }
}
