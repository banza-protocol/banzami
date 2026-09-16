import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/business_receive_point.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/error_messages.dart';
import '../utils/idempotency_intent.dart';
import '../widgets/app_screen_header.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_components.dart';
import 'payment_link_screen.dart';

/// Paying a scanned Business Receive Point (ADR-065).
///
/// The QR is persistent and resolves a public Business identity; the payer enters
/// an amount and a FRESH Payment Session is minted for it. Settlement reuses the
/// proven payment-link screen — the mint returns the link the payer pays. The
/// destination is server-resolved from the slug; nothing here chooses the payee.
class BanzamiReceivePointScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String slug;
  final String? ownHandle;
  final void Function(Transfer) onSuccess;
  final bool isSandbox;
  final String? logoAssetPath;

  const BanzamiReceivePointScreen({
    super.key,
    required this.client,
    required this.slug,
    this.ownHandle,
    required this.onSuccess,
    this.isSandbox = false,
    this.logoAssetPath,
  });

  @override
  State<BanzamiReceivePointScreen> createState() =>
      _BanzamiReceivePointScreenState();
}

class _BanzamiReceivePointScreenState extends State<BanzamiReceivePointScreen> {
  final IdempotencyIntent _intent = IdempotencyIntent();

  BusinessReceivePointResolution? _business;
  bool _loading = true;
  bool _retryable = false;
  bool _submitting = false;
  String? _error;

  int _amountMinor = 0;
  String? _amountError;

  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    if (!_loading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final b = await widget.client.resolveReceivePoint(widget.slug);
      if (!mounted) return;
      // Fail closed on a business that cannot receive — never present a payable
      // screen for one that resolved but is not ACTIVE.
      if (!b.isActive) {
        setState(() {
          _error = 'Este negócio não pode receber pagamentos neste momento.';
          _retryable = false;
          _loading = false;
        });
        return;
      }
      setState(() {
        _business = b;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      final notFound = e is BanzamiApiException && e.statusCode == 404;
      setState(() {
        _error = notFound
            ? 'Este QR de recebimento não foi encontrado.'
            : banzamiErrorMessage(e);
        _retryable = !notFound;
        _loading = false;
      });
    }
  }

  Future<void> _continue() async {
    final business = _business;
    if (business == null || _submitting) return;
    if (_amountMinor <= 0) {
      setState(() => _amountError = 'Introduza um montante válido');
      return;
    }
    setState(() {
      _submitting = true;
      _amountError = null;
    });
    // One key per (receive point, amount) intent: coming back and tapping again
    // mints the SAME session, never a second one.
    final key = _intent.keyFor((widget.slug, _amountMinor));
    try {
      final minted = await widget.client.payReceivePoint(
        widget.slug,
        amountMinor: _amountMinor,
        idempotencyKey: key,
      );
      if (!mounted) return;
      setState(() => _submitting = false);
      if (minted.paymentLinkSlug.isEmpty) {
        setState(() => _error = 'Não foi possível iniciar o pagamento.');
        return;
      }
      // Settle through the proven payment-link screen: the minted link is
      // fixed-amount, so it confirms and pays without asking again.
      await Navigator.of(context).push(BanzamiPageRoute(
        page: BanzamiPaymentLinkScreen(
          client: widget.client,
          slug: minted.paymentLinkSlug,
          ownHandle: widget.ownHandle,
          onSuccess: widget.onSuccess,
          isSandbox: widget.isSandbox,
          logoAssetPath: widget.logoAssetPath,
        ),
      ));
      // Returning from settlement: this receive point can be paid again (a new
      // session), so reset the intent for a fresh amount.
      if (mounted) _intent.reset();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _amountError = banzamiErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return _shell(const Center(
        child: CircularProgressIndicator(color: BanzamiColors.primary),
      ));
    }
    final business = _business;
    if (_error != null || business == null) {
      return _shell(Center(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.storefront_outlined,
                color: BanzamiColors.error, size: 48),
            const SizedBox(height: BanzamiSpacing.lg),
            Text(_error ?? 'Este QR de recebimento não foi encontrado.',
                style: BanzamiTextStyles.bodyMd
                    .copyWith(color: BanzamiColors.gray400),
                textAlign: TextAlign.center),
            const SizedBox(height: BanzamiSpacing.xl),
            if (_retryable) ...[
              BanzamiPrimaryButton(label: 'Tentar novamente', onPressed: _resolve),
              const SizedBox(height: BanzamiSpacing.sm),
            ],
            BanzamiGhostButton(
              label: 'Voltar',
              onPressed: () => Navigator.of(context).pop(),
            ),
          ]),
        ),
      ));
    }

    return _shell(SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _BusinessIdentityCard(business: business),
          const SizedBox(height: BanzamiSpacing.xl),
          BanzamiAmountInput(
            currency: business.currency,
            onChanged: (m) => setState(() {
              _amountMinor = m;
              _amountError = null;
            }),
            errorText: _amountError,
            enabled: !_submitting,
          ),
          const SizedBox(height: BanzamiSpacing.xl),
          BanzamiPrimaryButton(
            label: 'Continuar',
            isLoading: _submitting,
            onPressed: _submitting ? null : _continue,
          ),
        ],
      ),
    ));
  }

  Widget _shell(Widget body) => Scaffold(
        backgroundColor: BanzamiColors.offWhite,
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppScreenHeader(
                title: 'Pagar',
                onBack: () => Navigator.of(context).pop(),
              ),
              Expanded(child: body),
            ],
          ),
        ),
      );
}

class _BusinessIdentityCard extends StatelessWidget {
  final BusinessReceivePointResolution business;
  const _BusinessIdentityCard({required this.business});

  @override
  Widget build(BuildContext context) {
    return BanzamiCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(Icons.storefront_rounded,
              color: BanzamiColors.primary, size: 40),
          const SizedBox(height: BanzamiSpacing.md),
          Text('A pagar a', style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          const SizedBox(height: BanzamiSpacing.xs),
          Text(
            business.displayName,
            style: BanzamiTextStyles.headingSm,
            textAlign: TextAlign.center,
          ),
          if (business.handle.isNotEmpty) ...[
            const SizedBox(height: BanzamiSpacing.xs),
            Text('@${business.handle}',
                style: BanzamiTextStyles.bodyMd
                    .copyWith(color: BanzamiColors.primary)),
          ],
        ],
      ),
    );
  }
}
