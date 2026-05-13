import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../client/banzami_client.dart';
import '../models/qr_code.dart';
import '../theme/banzami_theme.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';
import '../widgets/banzami_qr_display.dart';

/// Receive payment screen — shows a static or dynamic QR code.
///
/// The user can optionally set a fixed amount to create a dynamic QR,
/// or leave it blank to show their static QR (payer sets the amount).
class BanzamiReceiveScreen extends StatefulWidget {
  final BanzamiClient client;
  final String ownerId;
  final String walletId;

  const BanzamiReceiveScreen({
    super.key,
    required this.client,
    required this.ownerId,
    required this.walletId,
  });

  @override
  State<BanzamiReceiveScreen> createState() => _BanzamiReceiveScreenState();
}

class _BanzamiReceiveScreenState extends State<BanzamiReceiveScreen> {
  QrResponse? _staticQr;
  QrResponse? _dynamicQr;
  bool   _loadingStatic  = true;
  bool   _creatingDynamic = false;
  int    _amountMinor    = 0;
  bool   _showAmountMode = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadStaticQr();
  }

  Future<void> _loadStaticQr() async {
    try {
      final qr = await widget.client.createStaticQr(ownerId: widget.ownerId);
      if (mounted) setState(() { _staticQr = qr; _loadingStatic = false; });
    } catch (e) {
      if (mounted) setState(() { _error = 'Não foi possível gerar o QR'; _loadingStatic = false; });
    }
  }

  Future<void> _createDynamicQr() async {
    if (_amountMinor <= 0) return;
    setState(() { _creatingDynamic = true; _error = null; });
    try {
      final qr = await widget.client.createDynamicQr(
        ownerId:     widget.ownerId,
        amountMinor: _amountMinor,
        expiresAt:   DateTime.now().add(const Duration(hours: 1)),
      );
      if (mounted) setState(() { _dynamicQr = qr; _creatingDynamic = false; });
    } catch (e) {
      if (mounted) setState(() { _error = 'Erro ao gerar QR com montante'; _creatingDynamic = false; });
    }
  }

  QrResponse? get _activeQr => _dynamicQr ?? _staticQr;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        title:           const Text('Receber'),
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            children: [
              const Spacer(),

              if (_loadingStatic)
                const CircularProgressIndicator(color: BanzamiColors.wine)
              else if (_error != null && _activeQr == null)
                Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.error))
              else if (_activeQr != null)
                _QrCard(qrResponse: _activeQr!),

              const Spacer(),

              // Toggle: set fixed amount
              if (!_showAmountMode)
                BanzamiButton.secondary(
                  label:    'Definir montante fixo',
                  onPressed: () => setState(() => _showAmountMode = true),
                )
              else ...[
                const Text('Montante a cobrar', style: BanzamiTextStyles.headingSm),
                const SizedBox(height: BanzamiSpacing.sm),
                BanzamiAmountInput(
                  onChanged: (v) => setState(() => _amountMinor = v),
                ),
                const SizedBox(height: BanzamiSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: BanzamiButton.secondary(
                        label:    'Cancelar',
                        onPressed: () => setState(() {
                          _showAmountMode = false;
                          _dynamicQr      = null;
                          _amountMinor    = 0;
                        }),
                      ),
                    ),
                    const SizedBox(width: BanzamiSpacing.sm),
                    Expanded(
                      child: BanzamiButton(
                        label:     'Gerar QR',
                        isLoading: _creatingDynamic,
                        onPressed: _createDynamicQr,
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: BanzamiSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }
}

class _QrCard extends StatelessWidget {
  final QrResponse qrResponse;
  const _QrCard({required this.qrResponse});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        BanzamiQrDisplay(
          payload:     qrResponse.payload,
          amountLabel: qrResponse.qrCode.amountFormatted,
          size:        240,
        ),
        const SizedBox(height: BanzamiSpacing.xl),

        // Copy payload button
        GestureDetector(
          onTap: () async {
            await Clipboard.setData(ClipboardData(text: qrResponse.payload));
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Payload copiado')),
              );
            }
          },
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.copy_rounded, size: 16, color: BanzamiColors.gray400),
              const SizedBox(width: BanzamiSpacing.xs),
              Text(
                'Copiar código',
                style: BanzamiTextStyles.label.copyWith(color: BanzamiColors.gray400),
              ),
            ],
          ),
        ),

        if (qrResponse.qrCode.isDynamic) ...[
          const SizedBox(height: BanzamiSpacing.sm),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: BanzamiSpacing.md,
              vertical:   BanzamiSpacing.xs,
            ),
            decoration: BoxDecoration(
              color:        BanzamiColors.copper.withValues(alpha: 0.1),
              borderRadius: BanzamiRadius.smAll,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.schedule_rounded, size: 14, color: BanzamiColors.copper),
                const SizedBox(width: 4),
                Text(
                  'Válido por 1 hora',
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.copper),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
