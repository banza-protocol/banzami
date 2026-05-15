import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';
import '../widgets/banzami_qr_display.dart';

class BanzamiReceiveScreen extends StatefulWidget {
  final String handle;

  const BanzamiReceiveScreen({super.key, required this.handle});

  @override
  State<BanzamiReceiveScreen> createState() => _BanzamiReceiveScreenState();
}

class _BanzamiReceiveScreenState extends State<BanzamiReceiveScreen> {
  int  _amountMinor = 0;
  bool _amountSet   = false;

  String get _qrPayload {
    if (_amountSet && _amountMinor > 0) {
      return 'banzami:@${widget.handle}?amount=$_amountMinor&currency=AOA';
    }
    return 'banzami:@${widget.handle}';
  }

  void _clearAmount() => setState(() { _amountSet = false; _amountMinor = 0; });

  Future<void> _showAmountSheet() async {
    int draft = 0;
    await showModalBottomSheet<int>(
      context:          context,
      isScrollControlled: true,
      backgroundColor: BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          BanzamiSpacing.xl,
          BanzamiSpacing.xl,
          BanzamiSpacing.xl,
          MediaQuery.of(ctx).viewInsets.bottom + BanzamiSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Montante a cobrar', style: BanzamiTextStyles.headingSm),
            const SizedBox(height: BanzamiSpacing.md),
            BanzamiAmountInput(
              onChanged: (v) => draft = v,
            ),
            const SizedBox(height: BanzamiSpacing.lg),
            Row(children: [
              Expanded(
                child: BanzamiButton.secondary(
                  label:     'Cancelar',
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
              const SizedBox(width: BanzamiSpacing.sm),
              Expanded(
                child: BanzamiButton(
                  label:     'Aplicar',
                  onPressed: () {
                    if (draft > 0) Navigator.pop(ctx, draft);
                  },
                ),
              ),
            ]),
          ],
        ),
      ),
    ).then((result) {
      if (result != null && result > 0) {
        setState(() { _amountMinor = result; _amountSet = true; });
      }
    });
  }

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
        child: LayoutBuilder(
          builder: (context, constraints) {
            // Scale QR to fit small screens. Fixed overhead inside the column:
            // container-padding(32) + handle-subtitle(~24) + TextButton(~40) +
            // SizedBox-lg(16) + SizedBox-xl(24) + button(~52) + SizedBox-lg(16) = 204
            // Plus outer Padding top+bottom: 32  → total reserved = 236
            final qrSize =
                (constraints.maxHeight - 236).clamp(120.0, 240.0);

            return SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Padding(
                  padding: const EdgeInsets.all(BanzamiSpacing.xl),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      BanzamiQrDisplay(
                        payload:     _qrPayload,
                        amountLabel: (_amountSet && _amountMinor > 0)
                            ? formatMinor(_amountMinor, 'AOA')
                            : null,
                        subtitle: '@${widget.handle}',
                        size:     qrSize,
                      ),

                      const SizedBox(height: BanzamiSpacing.lg),

                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(
                              ClipboardData(text: '@${widget.handle}'));
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Handle copiado')),
                            );
                          }
                        },
                        icon:  const Icon(Icons.copy_rounded, size: 16,
                            color: BanzamiColors.gray400),
                        label: Text(
                          '@${widget.handle}',
                          style: BanzamiTextStyles.bodyMd
                              .copyWith(color: BanzamiColors.gray400),
                        ),
                      ),

                      const SizedBox(height: BanzamiSpacing.xl),

                      if (_amountSet)
                        Row(children: [
                          Expanded(
                            child: BanzamiButton.secondary(
                              label:     'Remover montante',
                              onPressed: _clearAmount,
                            ),
                          ),
                        ])
                      else
                        BanzamiButton.secondary(
                          label:     'Definir montante fixo',
                          onPressed: _showAmountSheet,
                        ),

                      const SizedBox(height: BanzamiSpacing.lg),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
