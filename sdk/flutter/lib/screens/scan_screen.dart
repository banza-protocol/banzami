import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/consumer_pay_link.dart';
import '../models/payment_link.dart';
import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_amount_input.dart';
import '../widgets/banza_button.dart';
import '../widgets/banza_qr_scanner.dart';

enum _ScanStep { scanning, resolving, confirm, error, success }

/// QR payload types resolved from a scanned code.
sealed class _Payload {}

class _HandlePayload extends _Payload {
  final String handle;
  final int? amountMinor;
  final String currency;
  _HandlePayload({required this.handle, this.amountMinor, this.currency = 'AOA'});
}

class _LinkPayload extends _Payload {
  final PaymentLink link;
  _LinkPayload(this.link);
}

class _ConsumerPayLinkPayload extends _Payload {
  final ConsumerPayLink link;
  _ConsumerPayLinkPayload(this.link);
}

/// Scan-to-pay flow.
///
/// Supports two QR formats:
///  • `banzami:@{handle}[?amount={minor}&currency=AOA]` — P2P transfer
///  • Any URL — payment link: extracts slug from the path
///
/// On success [onSuccess] is called with the resulting [Transfer] or the
/// [PaymentLink] returned by [POST /v1/payment-links/{slug}/pay].
class BanzamiScanScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final void Function(dynamic result) onSuccess;

  const BanzamiScanScreen({
    super.key,
    required this.client,
    required this.onSuccess,
  });

  @override
  State<BanzamiScanScreen> createState() => _BanzamiScanScreenState();
}

class _BanzamiScanScreenState extends State<BanzamiScanScreen> {
  _ScanStep _step     = _ScanStep.scanning;
  _Payload? _payload;
  dynamic   _result;
  String?   _error;
  bool      _processing = false;
  int       _enteredAmount = 0;

  // ---------------------------------------------------------------------------
  // QR parsing (client-side, no API call for handle QRs)
  // ---------------------------------------------------------------------------

  Future<void> _onScanned(String raw) async {
    setState(() { _step = _ScanStep.resolving; _error = null; });

    // Consumer pay link: banza://pay?request=CODE (or banza-sandbox://...)
    if ((raw.startsWith('banza://pay') || raw.startsWith('banza-sandbox://pay'))) {
      final uri  = Uri.tryParse(raw);
      final code = uri?.queryParameters['request'];
      if (code != null && code.isNotEmpty) {
        try {
          final link = await widget.client.getConsumerPayLinkByCode(code);
          if (mounted) setState(() { _payload = _ConsumerPayLinkPayload(link); _step = _ScanStep.confirm; });
        } on BanzamiApiException {
          if (mounted) setState(() { _error = 'Link de pagamento não encontrado'; _step = _ScanStep.error; });
        } catch (_) {
          if (mounted) setState(() { _error = 'Não foi possível verificar o link. Tente novamente.'; _step = _ScanStep.error; });
        }
        return;
      }
    }

    // Handle QR: banzami:@fm65  or  banzami:@fm65?amount=5000&currency=AOA
    if (raw.startsWith('banzami:@')) {
      final withScheme = raw.replaceFirst('banzami:', 'https:');
      final uri = Uri.tryParse(withScheme);
      final handle = (uri?.host.isNotEmpty == true)
          ? uri!.host
          : raw.substring('banzami:@'.length).split('?').first;
      final amountStr = uri?.queryParameters['amount'];
      final currency  = uri?.queryParameters['currency'] ?? 'AOA';
      setState(() {
        _payload = _HandlePayload(
          handle:      handle,
          amountMinor: amountStr != null ? int.tryParse(amountStr) : null,
          currency:    currency,
        );
        _step = _ScanStep.confirm;
      });
      return;
    }

    // Payment link URL: extract slug from last path segment.
    try {
      final uri = Uri.parse(raw);
      final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segments.isNotEmpty) {
        final slug = segments.last;
        final link = await widget.client.getPaymentLinkBySlug(slug);
        if (mounted) setState(() { _payload = _LinkPayload(link); _step = _ScanStep.confirm; });
        return;
      }
    } on BanzamiApiException catch (e) {
      final msg = e.isNotFound
          ? 'Link de pagamento não encontrado'
          : 'Não foi possível verificar o QR. Tente novamente.';
      if (mounted) setState(() { _error = msg; _step = _ScanStep.error; });
      return;
    } catch (_) {
      // Not a parseable URL — fall through to generic error.
    }

    if (mounted) setState(() { _error = 'Código QR não reconhecido'; _step = _ScanStep.error; });
  }

  // ---------------------------------------------------------------------------
  // Payment execution
  // ---------------------------------------------------------------------------

  Future<void> _pay() async {
    setState(() { _processing = true; _error = null; });
    try {
      final p = _payload!;
      if (p is _HandlePayload) {
        final amount = p.amountMinor ?? _enteredAmount;
        final transfer = await widget.client.sendByHandle(
          recipientHandle: p.handle,
          amountMinor:     amount,
          currency:        p.currency,
        );
        if (mounted) setState(() { _result = transfer; _step = _ScanStep.success; });
      } else if (p is _LinkPayload) {
        final amount = p.link.amountMinor ?? _enteredAmount;
        final updated = await widget.client.payPaymentLink(
          p.link.slug,
          amountMinor: amount > 0 ? amount : null,
        );
        if (mounted) setState(() { _result = updated; _step = _ScanStep.success; });
      } else if (p is _ConsumerPayLinkPayload) {
        if (!p.link.isActive) {
          setState(() { _error = 'Este link de pagamento já não está ativo.'; _processing = false; });
          return;
        }
        final paid = await widget.client.payConsumerPayLink(p.link.linkCode);
        if (mounted) setState(() { _result = paid; _step = _ScanStep.success; });
      }
    } on BanzamiApiException catch (e) {
      setState(() => _error = switch (e.code) {
        'INSUFFICIENT_FUNDS'          => 'Saldo insuficiente',
        'LINK_NOT_ACTIVE'             => 'Link de pagamento já não está disponível',
        'NO_WALLET'                   => 'Não tem carteira activa para esta moeda',
        'WALLET_NOT_FOUND'            => 'Destino sem carteira activa',
        'NOT_FOUND'                   => 'Link de pagamento não encontrado',
        'SELF_TRANSFER'               => 'Não pode pagar o seu próprio link',
        'SELF_TRANSFER_NOT_ALLOWED'   => 'Não pode pagar o seu próprio pedido',
        'ACCOUNT_FROZEN'              => 'A sua conta está suspensa',
        _                             => 'Erro de pagamento. Tente novamente.',
      });
    } catch (_) {
      setState(() => _error = 'Pagamento falhou. Tente novamente.');
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  void _rescan() => setState(() {
    _step          = _ScanStep.scanning;
    _payload       = null;
    _result        = null;
    _error         = null;
    _enteredAmount = 0;
  });

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final bool cameraActive = _step == _ScanStep.scanning || _step == _ScanStep.resolving;
    return Scaffold(
      backgroundColor: cameraActive ? Colors.black : BanzaColors.offWhite,
      body: switch (_step) {
        _ScanStep.scanning  => BanzaQrScanner(
            onDetected: _onScanned,
            onCancel:   () => Navigator.of(context).pop(),
          ),
        _ScanStep.resolving => const Center(
            child: CircularProgressIndicator(color: BanzaColors.wine),
          ),
        _ScanStep.confirm   => _buildConfirm(),
        _ScanStep.error     => _buildError(),
        _ScanStep.success   => _buildSuccess(),
      },
    );
  }

  Widget _buildConfirm() {
    final p = _payload!;
    final bool needsAmount = switch (p) {
      _HandlePayload()          => p.amountMinor == null,
      _LinkPayload()            => p.link.amountMinor == null,
      _ConsumerPayLinkPayload() => false, // always locked
    };
    final String? fixedLabel = switch (p) {
      _HandlePayload() when p.amountMinor != null =>
          formatMinor(p.amountMinor!, p.currency),
      _LinkPayload() when p.link.amountMinor != null =>
          formatMinor(p.link.amountMinor!, p.link.currency),
      _ConsumerPayLinkPayload() when p.link.amountMinor != null =>
          formatMinor(p.link.amountMinor!, p.link.currency),
      _ => null,
    };
    final String title = switch (p) {
      _HandlePayload()          => 'Enviar para @${p.handle}',
      _LinkPayload() when p.link.merchantName != null => p.link.merchantName!,
      _LinkPayload()            => 'Pagar link',
      _ConsumerPayLinkPayload() => 'Pagar @${p.link.receiverHandle}',
    };
    final String? subtitle = switch (p) {
      _LinkPayload()            => p.link.description,
      _ConsumerPayLinkPayload() => p.link.note,
      _                         => null,
    };

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(BanzaSpacing.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: BanzaSpacing.xl),

            // Header card
            Container(
              padding:    const EdgeInsets.symmetric(
                horizontal: BanzaSpacing.xl,
                vertical:   BanzaSpacing.xxl,
              ),
              decoration: const BoxDecoration(
                gradient:     BanzaGradients.wine,
                borderRadius: BanzaRadius.xlAll,
              ),
              child: Column(children: [
                Icon(
                  p is _HandlePayload ? Icons.person_rounded : Icons.link_rounded,
                  size:  40,
                  color: BanzaColors.white,
                ),
                const SizedBox(height: BanzaSpacing.md),
                Text(
                  title,
                  style:     BanzaTextStyles.headingMd.copyWith(color: BanzaColors.white),
                  textAlign: TextAlign.center,
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: BanzaSpacing.xs),
                  Text(
                    subtitle,
                    style:     BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.white.withValues(alpha: 0.75)),
                    textAlign: TextAlign.center,
                  ),
                ],
                if (fixedLabel != null) ...[
                  const SizedBox(height: BanzaSpacing.lg),
                  Text(
                    fixedLabel,
                    style: BanzaTextStyles.displayMd.copyWith(color: BanzaColors.white),
                  ),
                ],
              ]),
            ),

            const SizedBox(height: BanzaSpacing.xl),

            // Amount input for open links/transfers
            if (needsAmount) ...[
              Container(
                padding:    const EdgeInsets.all(BanzaSpacing.xl),
                decoration: const BoxDecoration(
                  color:        BanzaColors.white,
                  borderRadius: BanzaRadius.lgAll,
                  boxShadow:    BanzaShadows.card,
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Montante', style: BanzaTextStyles.headingSm),
                  const SizedBox(height: BanzaSpacing.md),
                  BanzaAmountInput(onChanged: (v) => setState(() => _enteredAmount = v)),
                ]),
              ),
              const SizedBox(height: BanzaSpacing.xl),
            ],

            // Error banner
            if (_error != null) ...[
              Container(
                padding:    const EdgeInsets.all(BanzaSpacing.md),
                decoration: const BoxDecoration(
                  color:        BanzaColors.errorBg,
                  borderRadius: BanzaRadius.mdAll,
                ),
                child: Text(
                  _error!,
                  style:     BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: BanzaSpacing.lg),
            ],

            Row(children: [
              Expanded(
                child: BanzaButton.secondary(
                  label:     'Cancelar',
                  onPressed: _rescan,
                ),
              ),
              const SizedBox(width: BanzaSpacing.md),
              Expanded(
                child: BanzaButton(
                  label:     'Confirmar',
                  isLoading: _processing,
                  onPressed: (needsAmount && _enteredAmount <= 0) ? null : _pay,
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(BanzaSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72, height: 72,
                decoration: const BoxDecoration(
                  color:        BanzaColors.errorBg,
                  borderRadius: BanzaRadius.fullAll,
                ),
                child: const Icon(Icons.qr_code_scanner_rounded, color: BanzaColors.error, size: 36),
              ),
              const SizedBox(height: BanzaSpacing.xl),
              Text(
                _error ?? 'Código QR inválido',
                style:     BanzaTextStyles.headingSm.copyWith(color: BanzaColors.gray900),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzaSpacing.sm),
              Text(
                'Verifique o código e tente novamente.',
                style:     BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzaSpacing.xxl),
              BanzaButton(
                label:     'Tentar novamente',
                onPressed: _rescan,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSuccess() {
    final p = _payload;
    final String amountLabel;
    final String subtitle;

    if (p is _HandlePayload) {
      final amount = p.amountMinor ?? _enteredAmount;
      amountLabel = formatMinor(amount, p.currency);
      subtitle    = '@${p.handle}';
    } else if (p is _LinkPayload) {
      final amount = p.link.amountMinor ?? _enteredAmount;
      amountLabel = formatMinor(amount, p.link.currency);
      subtitle    = p.link.merchantName ?? p.link.description ?? p.link.slug;
    } else if (p is _ConsumerPayLinkPayload) {
      amountLabel = p.link.amountMinor != null
          ? formatMinor(p.link.amountMinor!, p.link.currency)
          : '';
      subtitle    = '@${p.link.receiverHandle}';
    } else {
      amountLabel = '';
      subtitle    = '';
    }

    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(BanzaSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80, height: 80,
                decoration: const BoxDecoration(
                  color:        BanzaColors.successBg,
                  borderRadius: BanzaRadius.fullAll,
                ),
                child: const Icon(Icons.check_rounded, color: BanzaColors.success, size: 40),
              ),
              const SizedBox(height: BanzaSpacing.xl),
              Text(
                amountLabel,
                style: BanzaTextStyles.displayMd.copyWith(color: BanzaColors.gray900),
              ),
              const SizedBox(height: BanzaSpacing.xs),
              Text(
                'Pagamento enviado para $subtitle',
                style:     BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzaSpacing.xxl),
              BanzaButton(
                label:     'Fechar',
                onPressed: () => widget.onSuccess(_result),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
