import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';
import '../widgets/banzami_qr_display.dart';

/// Receive payment screen — shows the consumer's @handle as a scannable QR.
///
/// The QR content is generated locally (no API call needed):
///   Static:  `banzami:@{handle}`
///   Dynamic: `banzami:@{handle}?amount={minor}&currency=AOA`
///
/// When another consumer scans this QR in [BanzamiScanScreen] it parses
/// the handle and optionally the pre-set amount, then opens the send flow.
class BanzamiReceiveScreen extends StatefulWidget {
  final String handle;

  const BanzamiReceiveScreen({super.key, required this.handle});

  @override
  State<BanzamiReceiveScreen> createState() => _BanzamiReceiveScreenState();
}

class _BanzamiReceiveScreenState extends State<BanzamiReceiveScreen> {
  int  _amountMinor    = 0;
  bool _showAmountMode = false;
  bool _amountSet      = false;

  String get _qrPayload {
    if (_amountSet && _amountMinor > 0) {
      return 'banzami:@${widget.handle}?amount=$_amountMinor&currency=AOA';
    }
    return 'banzami:@${widget.handle}';
  }

  void _applyAmount() {
    if (_amountMinor > 0) setState(() { _amountSet = true; _showAmountMode = false; });
  }

  void _clearAmount() => setState(() {
    _amountSet      = false;
    _showAmountMode = false;
    _amountMinor    = 0;
  });

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

              BanzamiQrDisplay(
                payload:     _qrPayload,
                amountLabel: (_amountSet && _amountMinor > 0)
                    ? formatMinor(_amountMinor, 'AOA')
                    : null,
                subtitle: '@${widget.handle}',
              ),

              const SizedBox(height: BanzamiSpacing.lg),

              // Copy handle
              TextButton.icon(
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: '@${widget.handle}'));
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Handle copiado')),
                    );
                  }
                },
                icon:  const Icon(Icons.copy_rounded, size: 16, color: BanzamiColors.gray400),
                label: Text(
                  '@${widget.handle}',
                  style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                ),
              ),

              const Spacer(),

              // Amount controls
              if (!_showAmountMode && !_amountSet)
                BanzamiButton.secondary(
                  label:     'Definir montante fixo',
                  onPressed: () => setState(() => _showAmountMode = true),
                )
              else if (_amountSet)
                Row(children: [
                  Expanded(
                    child: BanzamiButton.secondary(
                      label:     'Remover montante',
                      onPressed: _clearAmount,
                    ),
                  ),
                ])
              else ...[
                const Text('Montante a cobrar', style: BanzamiTextStyles.headingSm),
                const SizedBox(height: BanzamiSpacing.sm),
                BanzamiAmountInput(
                  onChanged: (v) => setState(() => _amountMinor = v),
                ),
                const SizedBox(height: BanzamiSpacing.md),
                Row(children: [
                  Expanded(
                    child: BanzamiButton.secondary(
                      label:     'Cancelar',
                      onPressed: () => setState(() { _showAmountMode = false; _amountMinor = 0; }),
                    ),
                  ),
                  const SizedBox(width: BanzamiSpacing.sm),
                  Expanded(
                    child: BanzamiButton(
                      label:     'Aplicar',
                      onPressed: _applyAmount,
                    ),
                  ),
                ]),
              ],

              const SizedBox(height: BanzamiSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }
}
