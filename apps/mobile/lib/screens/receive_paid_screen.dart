import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Confirmation shown to the RECEIVER once a defined-amount receive (consumer pay
/// link) is paid. The Receber QR auto-dismisses into this — no manual refresh — and
/// on return the Receber screen no longer carries the defined amount. The money has
/// already settled into the wallet.
class ReceivePaidScreen extends StatelessWidget {
  final int? amountMinor;
  final String currency;
  final String? note;

  const ReceivePaidScreen({
    super.key,
    required this.amountMinor,
    required this.currency,
    this.note,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(flex: 2),
              const Center(child: BanzamiVerifiedMark(size: 96, onLight: true)),
              const SizedBox(height: BanzamiSpacing.lg),
              const Text(
                'Pagamento recebido',
                style: BanzamiTextStyles.headingMd,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: BanzamiSpacing.sm),
              if (amountMinor != null)
                MoneyAmount(amountMinor!,
                    currency: currency,
                    size: MoneySize.xl,
                    tone: MoneyTone.brand,
                    align: TextAlign.center),
              if (note != null && note!.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  '"${note!.trim()}"',
                  style: BanzamiTextStyles.bodyMd.copyWith(
                    fontStyle: FontStyle.italic,
                    color: BanzamiColors.gray400,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: BanzamiSpacing.sm),
              Text(
                'O valor já entrou na sua carteira.',
                style: BanzamiTextStyles.bodyMd
                    .copyWith(color: BanzamiColors.gray400),
                textAlign: TextAlign.center,
              ),
              const Spacer(flex: 3),
              SizedBox(
                width: double.infinity,
                child: BanzamiPrimaryButton(
                  label: 'Concluir',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
