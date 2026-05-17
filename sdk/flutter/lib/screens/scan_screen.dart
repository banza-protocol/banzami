import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../models/payment_link.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';
import '../widgets/banzami_qr_scanner.dart';

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
      }
    } on BanzamiApiException catch (e) {
      setState(() => _error = switch (e.code) {
        'INSUFFICIENT_FUNDS' => 'Saldo insuficiente',
        'LINK_NOT_ACTIVE'    => 'Link de pagamento já não está disponível',
        'NO_WALLET'          => 'Não tem carteira activa para esta moeda',
        'WALLET_NOT_FOUND'   => 'Destino sem carteira activa',
        'NOT_FOUND'          => 'Link de pagamento não encontrado',
        'SELF_TRANSFER'      => 'Não pode pagar o seu próprio link',
        _                    => 'Erro de pagamento. Tente novamente.',
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
      backgroundColor: cameraActive ? Colors.black : BanzamiColors.offWhite,
      body: switch (_step) {
        _ScanStep.scanning  => BanzamiQrScanner(
            onDetected: _onScanned,
            onCancel:   () => Navigator.of(context).pop(),
          ),
        _ScanStep.resolving => const Center(
            child: CircularProgressIndicator(color: BanzamiColors.wine),
          ),
        _ScanStep.confirm   => _buildConfirm(),
        _ScanStep.error     => _buildError(),
        _ScanStep.success   => _buildSuccess(),
      },
    );
  }

  Widget _buildConfirm() {
    final p = _payload!;
    final bool needsAmount = p is _HandlePayload
        ? p.amountMinor == null
        : p is _LinkPayload && p.link.amountMinor == null;
    final String? fixedLabel = p is _HandlePayload
        ? (p.amountMinor != null ? formatMinor(p.amountMinor!, p.currency) : null)
        : p is _LinkPayload && p.link.amountMinor != null
            ? formatMinor(p.link.amountMinor!, p.link.currency)
            : null;
    final String title = p is _HandlePayload
        ? 'Enviar para @${p.handle}'
        : (p is _LinkPayload && p.link.merchantName != null)
            ? p.link.merchantName!
            : 'Pagar link';
    final String? subtitle = p is _LinkPayload ? p.link.description : null;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: BanzamiSpacing.xl),

            // Header card
            Container(
              padding:    const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.xl,
                vertical:   BanzamiSpacing.xxl,
              ),
              decoration: const BoxDecoration(
                gradient:     BanzamiGradients.wine,
                borderRadius: BanzamiRadius.xlAll,
              ),
              child: Column(children: [
                Icon(
                  p is _HandlePayload ? Icons.person_rounded : Icons.link_rounded,
                  size:  40,
                  color: BanzamiColors.white,
                ),
                const SizedBox(height: BanzamiSpacing.md),
                Text(
                  title,
                  style:     BanzamiTextStyles.headingMd.copyWith(color: BanzamiColors.white),
                  textAlign: TextAlign.center,
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: BanzamiSpacing.xs),
                  Text(
                    subtitle,
                    style:     BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.white.withValues(alpha: 0.75)),
                    textAlign: TextAlign.center,
                  ),
                ],
                if (fixedLabel != null) ...[
                  const SizedBox(height: BanzamiSpacing.lg),
                  Text(
                    fixedLabel,
                    style: BanzamiTextStyles.displayMd.copyWith(color: BanzamiColors.white),
                  ),
                ],
              ]),
            ),

            const SizedBox(height: BanzamiSpacing.xl),

            // Amount input for open links/transfers
            if (needsAmount) ...[
              Container(
                padding:    const EdgeInsets.all(BanzamiSpacing.xl),
                decoration: const BoxDecoration(
                  color:        BanzamiColors.white,
                  borderRadius: BanzamiRadius.lgAll,
                  boxShadow:    BanzamiShadows.card,
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Montante', style: BanzamiTextStyles.headingSm),
                  const SizedBox(height: BanzamiSpacing.md),
                  BanzamiAmountInput(onChanged: (v) => setState(() => _enteredAmount = v)),
                ]),
              ),
              const SizedBox(height: BanzamiSpacing.xl),
            ],

            // Error banner
            if (_error != null) ...[
              Container(
                padding:    const EdgeInsets.all(BanzamiSpacing.md),
                decoration: const BoxDecoration(
                  color:        BanzamiColors.errorBg,
                  borderRadius: BanzamiRadius.mdAll,
                ),
                child: Text(
                  _error!,
                  style:     BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: BanzamiSpacing.lg),
            ],

            Row(children: [
              Expanded(
                child: BanzamiButton.secondary(
                  label:     'Cancelar',
                  onPressed: _rescan,
                ),
              ),
              const SizedBox(width: BanzamiSpacing.md),
              Expanded(
                child: BanzamiButton(
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
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72, height: 72,
                decoration: const BoxDecoration(
                  color:        BanzamiColors.errorBg,
                  borderRadius: BanzamiRadius.fullAll,
                ),
                child: const Icon(Icons.qr_code_scanner_rounded, color: BanzamiColors.error, size: 36),
              ),
              const SizedBox(height: BanzamiSpacing.xl),
              Text(
                _error ?? 'Código QR inválido',
                style:     BanzamiTextStyles.headingSm.copyWith(color: BanzamiColors.gray900),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzamiSpacing.sm),
              Text(
                'Verifique o código e tente novamente.',
                style:     BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzamiSpacing.xxl),
              BanzamiButton(
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
    } else {
      amountLabel = '';
      subtitle    = '';
    }

    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80, height: 80,
                decoration: const BoxDecoration(
                  color:        BanzamiColors.successBg,
                  borderRadius: BanzamiRadius.fullAll,
                ),
                child: const Icon(Icons.check_rounded, color: BanzamiColors.success, size: 40),
              ),
              const SizedBox(height: BanzamiSpacing.xl),
              Text(
                amountLabel,
                style: BanzamiTextStyles.displayMd.copyWith(color: BanzamiColors.gray900),
              ),
              const SizedBox(height: BanzamiSpacing.xs),
              Text(
                'Pagamento enviado para $subtitle',
                style:     BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzamiSpacing.xxl),
              BanzamiButton(
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
