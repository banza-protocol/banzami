import 'package:flutter/material.dart';

import '../client/api_exception.dart';
import '../client/banzami_client.dart';
import '../models/qr_code.dart';
import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';
import '../widgets/banzami_qr_scanner.dart';

/// Scan-to-pay flow:
///   1. Camera opens → user scans QR
///   2. Payload decoded → static or dynamic QR
///   3. Confirmation sheet → user approves
///   4. Transfer sent (for static QR, user also entered amount)
///   5. onSuccess callback fires
class BanzamiScanScreen extends StatefulWidget {
  final BanzamiClient client;
  final String consumerId;
  final void Function(Transfer transfer) onSuccess;

  const BanzamiScanScreen({
    super.key,
    required this.client,
    required this.consumerId,
    required this.onSuccess,
  });

  @override
  State<BanzamiScanScreen> createState() => _BanzamiScanScreenState();
}

class _BanzamiScanScreenState extends State<BanzamiScanScreen> {
  _ScanStep _step = _ScanStep.scanning;
  ParsedQr?   _parsed;
  QrResponse? _qrResponse;
  String?     _error;
  bool        _processing = false;

  Future<void> _onScanned(String payload) async {
    setState(() { _step = _ScanStep.resolving; _error = null; });
    try {
      final parsed = await widget.client.decodeQrPayload(payload);
      _parsed = parsed;

      if (parsed.isDynamic && parsed.qrCodeId != null) {
        final qr = await widget.client.getQrCode(parsed.qrCodeId!);
        _qrResponse = qr;
      }
      if (mounted) setState(() => _step = _ScanStep.confirm);
    } on BanzamiApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _step = _ScanStep.error; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Código QR inválido ou expirado'; _step = _ScanStep.error; });
    }
  }

  Future<void> _confirmPay({int? overrideAmountMinor}) async {
    if (_parsed == null) return;
    setState(() { _processing = true; _error = null; });

    try {
      final recipientId = _parsed!.isDynamic
          ? _qrResponse!.qrCode.ownerId
          : _parsed!.ownerId!;

      final amount = _parsed!.isDynamic
          ? _qrResponse!.qrCode.amountMinor!
          : overrideAmountMinor!;

      final transfer = await widget.client.sendTransfer(
        senderId:    widget.consumerId,
        recipientId: recipientId,
        amountMinor: amount,
        currency:    _parsed!.currency ?? 'AOA',
      );

      // For dynamic QR, mark as used atomically
      if (_parsed!.isDynamic && _qrResponse != null) {
        await widget.client.markQrUsed(_qrResponse!.qrCode.id);
      }

      widget.onSuccess(transfer);
    } on BanzamiApiException catch (e) {
      setState(() { _error = e.isInsufficientFunds ? 'Saldo insuficiente' : e.message; });
    } catch (_) {
      setState(() => _error = 'Pagamento falhou. Tente novamente.');
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  void _rescan() => setState(() {
    _step       = _ScanStep.scanning;
    _parsed     = null;
    _qrResponse = null;
    _error      = null;
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: switch (_step) {
        _ScanStep.scanning => BanzamiQrScanner(
            onDetected: _onScanned,
            onCancel:   () => Navigator.of(context).pop(),
          ),
        _ScanStep.resolving => const Center(
            child: CircularProgressIndicator(color: BanzamiColors.wine),
          ),
        _ScanStep.confirm => _buildConfirmSheet(),
        _ScanStep.error   => _buildErrorSheet(),
      },
    );
  }

  Widget _buildConfirmSheet() {
    final isDynamic = _parsed?.isDynamic == true;
    final qr        = _qrResponse?.qrCode;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            Container(
              width:       double.infinity,
              padding:     const EdgeInsets.all(BanzamiSpacing.xl),
              decoration:  const BoxDecoration(
                color:        BanzamiColors.white,
                borderRadius: BanzamiRadius.xlAll,
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.qr_code_rounded,
                    size:  48,
                    color: BanzamiColors.wine,
                  ),
                  const SizedBox(height: BanzamiSpacing.md),
                  Text(
                    isDynamic ? 'Pagar montante fixo' : 'Pagamento QR',
                    style: BanzamiTextStyles.headingMd,
                  ),
                  const SizedBox(height: BanzamiSpacing.sm),
                  if (isDynamic && qr != null) ...[
                    Text(
                      qr.amountFormatted ?? '—',
                      style: BanzamiTextStyles.displayMd.copyWith(color: BanzamiColors.wine),
                    ),
                    if (qr.reference != null)
                      Padding(
                        padding: const EdgeInsets.only(top: BanzamiSpacing.xs),
                        child: Text(
                          qr.reference!,
                          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                        ),
                      ),
                  ] else ...[
                    Text(
                      'QR estático — introduza o montante',
                      style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                    ),
                  ],
                  const SizedBox(height: BanzamiSpacing.xl),

                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.error),
                    ),
                    const SizedBox(height: BanzamiSpacing.md),
                  ],

                  if (isDynamic) ...[
                    BanzamiButton(
                      label:     'Confirmar pagamento',
                      isLoading: _processing,
                      onPressed: () => _confirmPay(),
                    ),
                  ] else ...[
                    // Static QR — user must type amount
                    _StaticAmountConfirm(
                      currency:   _parsed?.currency ?? 'AOA',
                      processing: _processing,
                      onConfirm:  (amount) => _confirmPay(overrideAmountMinor: amount),
                    ),
                  ],

                  const SizedBox(height: BanzamiSpacing.sm),
                  BanzamiButton.ghost(
                    label:    'Cancelar',
                    onPressed: _rescan,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorSheet() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            Container(
              width:   double.infinity,
              padding: const EdgeInsets.all(BanzamiSpacing.xl),
              decoration: const BoxDecoration(
                color:        BanzamiColors.white,
                borderRadius: BanzamiRadius.xlAll,
              ),
              child: Column(
                children: [
                  const Icon(Icons.error_outline_rounded, size: 48, color: BanzamiColors.error),
                  const SizedBox(height: BanzamiSpacing.md),
                  Text(_error ?? 'Código inválido', style: BanzamiTextStyles.bodyMd),
                  const SizedBox(height: BanzamiSpacing.xl),
                  BanzamiButton(label: 'Tentar novamente', onPressed: _rescan),
                  const SizedBox(height: BanzamiSpacing.sm),
                  BanzamiButton.ghost(
                    label:    'Cancelar',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StaticAmountConfirm extends StatefulWidget {
  final String currency;
  final bool processing;
  final void Function(int amountMinor) onConfirm;

  const _StaticAmountConfirm({
    required this.currency,
    required this.processing,
    required this.onConfirm,
  });

  @override
  State<_StaticAmountConfirm> createState() => _StaticAmountConfirmState();
}

class _StaticAmountConfirmState extends State<_StaticAmountConfirm> {
  int _amount = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        BanzamiAmountInput(
          currency:  widget.currency,
          onChanged: (v) => setState(() => _amount = v),
        ),
        const SizedBox(height: BanzamiSpacing.md),
        BanzamiButton(
          label:     _amount > 0 ? 'Pagar ${formatMinor(_amount, widget.currency)}' : 'Introduza um montante',
          isLoading: widget.processing,
          onPressed: _amount > 0 ? () => widget.onConfirm(_amount) : null,
        ),
      ],
    );
  }
}

enum _ScanStep { scanning, resolving, confirm, error }
