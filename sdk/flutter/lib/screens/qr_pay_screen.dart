import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/error_messages.dart';
import '../utils/idempotency_intent.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_components.dart';
import 'receipt_screen.dart';

// ---------------------------------------------------------------------------
// BanzamiQrPayScreen
// ---------------------------------------------------------------------------

/// Confirm-and-pay for a scanned structured Banzami QR (CAP-PAY-003).
///
/// SCAN → CONFIRM → PAID: one screen between the scanner and the receipt, and
/// one call — `POST /v1/qr/pay`, which resolves the code, verifies it against
/// its signed record and settles it. The payer is this session's consumer and
/// is in no request field.
///
/// ## What this screen honestly knows
///
/// Almost nothing, and it says so rather than filling the gap. The scanned
/// payload is all it has:
///
///   • dynamic — `{"t":"D","id":…,"sig":…}`: an id and a signature. The amount
///     lives in the signed server-side record, not here.
///   • static — `{"t":"S","oid":…,"ot":"C"|"M","c":…}`: an owner id and type,
///     unsigned. Nothing in it is verified until the server resolves it.
///
/// So this screen names no payee and invents no amount. It does NOT read the
/// static payload's owner type to announce "Negócio": that field is not signed,
/// and a claim the client cannot verify has no place on a confirmation screen.
/// The payee is named by the canonical receipt, which comes from the ledger.
///
/// For a dynamic code the payer therefore confirms a fixed amount they have not
/// seen — stated plainly in the copy instead of hidden behind a guess. The
/// settled amount comes back in the response ([QrPayment.amountMinor]) and is
/// what the receipt shows. A resolve-before-confirm route would remove that
/// compromise; until one exists, a fabricated preview would be worse than an
/// honest "we do not know yet".
class BanzamiQrPayScreen extends StatefulWidget {
  /// The scanned payload, forwarded verbatim — the server resolves it.
  final String payload;

  /// Static (open amount, payer chooses) or dynamic (fixed amount in the
  /// signed record). Comes from [BanzamiQrParser], which reads only the `t`
  /// tag — the one part of the payload whose meaning does not depend on trust.
  final bool isStatic;

  final ConsumerPublicClient client;
  final String? ownHandle;
  final void Function(Transfer) onSuccess;
  final bool isSandbox;
  final String? logoAssetPath;

  const BanzamiQrPayScreen({
    super.key,
    required this.client,
    required this.payload,
    required this.isStatic,
    this.ownHandle,
    required this.onSuccess,
    this.isSandbox = false,
    this.logoAssetPath,
  });

  @override
  State<BanzamiQrPayScreen> createState() => _BanzamiQrPayScreenState();
}

class _BanzamiQrPayScreenState extends State<BanzamiQrPayScreen>
    with SingleTickerProviderStateMixin {
  /// Only ever set for a static code. A dynamic code's amount is the signed
  /// record's; the server ignores anything sent with it, so nothing here is
  /// allowed to become one.
  int _amountMinor = 0;
  String? _amountError;

  bool _sending = false;
  String? _error;

  /// The last attempt got no answer (network, timeout, 5xx): the payment may
  /// have been made. The button then repeats the SAME request with the same
  /// idempotency key — the server answers with the original outcome.
  bool _retrySame = false;
  bool _entered = false;

  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseScale;

  /// One key per intent to pay this code for this amount, reused by every
  /// retry. A key minted per tap would turn a double tap into two payments.
  final IdempotencyIntent _intent = IdempotencyIntent();

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
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  // ── Payment ────────────────────────────────────────────────────────────────

  Future<void> _pay() async {
    // The first tap owns the request; a second one while it is in flight is the
    // same intent, not another payment.
    if (_sending) return;

    if (widget.isStatic && _amountMinor <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }

    HapticFeedback.mediumImpact();
    // A dynamic code has one intent per code; a static one has an intent per
    // amount, so changing the amount mints a new key.
    final idem = _intent.keyFor(widget.isStatic ? _amountMinor : null);
    setState(() {
      _sending = true;
      _error = null;
    });
    _pulseCtrl.repeat(reverse: true);

    try {
      final payment = await widget.client.payStructuredQr(
        widget.payload,
        // Sent only for a static code. Sending one with a dynamic code would
        // suggest the payer can change a fixed amount; they cannot.
        amountMinor: widget.isStatic ? _amountMinor : null,
        idempotencyKey: idem,
      );

      // Paid: a later tap is a new payment, never a replay of this one.
      _intent.complete();
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      setState(() => _sending = false);

      // The settled amount is the server's, never `_amountMinor` — for a
      // dynamic code the client never held the real figure, and for a static
      // one only the server's answer is what the ledger recorded.
      final transfer = Transfer(
        transferId: payment.transferId,
        sender: widget.ownHandle ?? '',
        // The payload names no payee. Left empty on purpose: the receipt
        // screen shows "A obter…" until the canonical receipt names them,
        // rather than this screen guessing.
        recipient: '',
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        status: 'COMPLETED',
        createdAt: payment.paidAt ?? DateTime.now(),
        completedAt: payment.paidAt,
      );

      await Navigator.of(context).push(BanzamiPageRoute(
        page: BanzamiReceiptScreen(
          transfer: transfer,
          ownHandle: widget.ownHandle,
          onDone: widget.onSuccess,
          isSandbox: widget.isSandbox,
          logoAssetPath: widget.logoAssetPath,
          // A QR pays a merchant or a person; which one is the receipt's to
          // say, so nothing here prefixes an "@" to a name it does not have.
          recipientIsHandle: false,
          fetchReceiptPdf: () =>
              widget.client.fetchReceiptPdf(transfer.transferId),
          fetchReceipt: () => widget.client.fetchReceipt(transfer.transferId),
        ),
      ));
    } catch (e) {
      if (!mounted) return;
      _pulseCtrl.stop();
      _pulseCtrl.reset();
      HapticFeedback.heavyImpact();
      setState(() {
        _sending = false;
        _retrySame = isOutcomeUnknown(e);
        _error = _retrySame
            ? kPaymentOutcomeUnknownMessage
            // Every code /v1/qr/pay sends is worded in
            // lib/utils/error_messages.dart — they are QR codes, not this
            // screen's private vocabulary.
            : banzamiErrorMessage(e);
      });
    }
  }

  // ── Review UI ──────────────────────────────────────────────────────────────

  String get _buttonLabel {
    if (_retrySame) return 'Verificar';
    if (widget.isStatic && _amountMinor > 0) {
      return 'Pagar ${formatMinor(_amountMinor, 'AOA')}';
    }
    return 'Pagar';
  }

  Widget _buildCodeCard() {
    return BanzamiCard(
      shadow: BanzamiShadows.cardElevated,
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              gradient: BanzamiGradients.primary,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.qr_code_rounded,
                color: BanzamiColors.white, size: 28),
          ),
          const SizedBox(height: BanzamiSpacing.md),
          Text(
            'Código Banzami',
            style: BanzamiTextStyles.headingSm.copyWith(
              color: BanzamiColors.gray900,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            widget.isStatic
                ? 'Este código não traz montante. Escreva quanto quer pagar.'
                : 'Este código traz um montante fixo, definido por quem o criou.',
            style:
                BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            'Quem recebe é confirmado no comprovativo.',
            style:
                BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildMethodRow() {
    return Row(
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
    );
  }

  Widget _buildReviewUI() {
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
                  32,
                  BanzamiSpacing.xl,
                  BanzamiSpacing.xl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _buildCodeCard(),
                    const SizedBox(height: 16),

                    // A static code is the ONLY case with an amount field. A
                    // dynamic code's amount is fixed in its signed record, so
                    // offering a field would invite the payer to change
                    // something the server will ignore.
                    if (widget.isStatic)
                      BanzamiAmountInput(
                        // Editing is only possible when nothing is pending: a
                        // changed amount is a new intent, and a new key.
                        enabled: !_retrySame,
                        onChanged: (v) => setState(() {
                          _amountMinor = v;
                          _amountError = null;
                        }),
                        errorText: _amountError,
                      )
                    else
                      const BanzamiWarningBanner(
                        message:
                            'O montante exacto é cobrado pelo código e aparece '
                            'no comprovativo. Pague apenas se confia em quem '
                            'lhe mostrou este código.',
                      ),

                    const SizedBox(height: BanzamiSpacing.xl),
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
                    label: _buttonLabel,
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

  // ── Progress ───────────────────────────────────────────────────────────────

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
      child: const Icon(Icons.qr_code_rounded,
          color: BanzamiColors.white, size: 46),
    );
  }

  Widget _buildProgressOverlay() {
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
                // Only a static code has an amount to show here. A dynamic one
                // is still unknown at this point, and a placeholder figure
                // would be a number the payer could mistake for the charge.
                if (widget.isStatic)
                  Text(
                    formatMinor(_amountMinor, 'AOA'),
                    style: BanzamiTextStyles.monoLg.copyWith(
                      color: BanzamiColors.gray900,
                      fontSize: 38,
                      fontWeight: FontWeight.w700,
                    ),
                  )
                else
                  Text(
                    'A confirmar o montante do código…',
                    style: BanzamiTextStyles.bodyMd
                        .copyWith(color: BanzamiColors.gray400),
                    textAlign: TextAlign.center,
                  ),
                const Spacer(),
                const BanzamiSecondaryButton(
                    label: 'Cancelar', onPressed: null),
                const SizedBox(height: BanzamiSpacing.xl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // No way back while the payment is in flight: leaving would lose its
    // answer, and the only safe next step is the same request again.
    return PopScope(
      canPop: !_sending,
      child: BanzamiScaffold(
        appBar: _sending
            ? null
            : const BanzamiAppBar(title: 'Confirmar pagamento', showBack: true),
        body: Stack(
          children: [
            if (!_sending) SafeArea(child: _buildReviewUI()),
            if (_sending) _buildProgressOverlay(),
          ],
        ),
      ),
    );
  }
}
