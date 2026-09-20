import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Confirmation shown once a SIMPLE charge's payment link is paid. The QR screen
/// polls the link status and, on payment, auto-dismisses into this screen — the
/// merchant never has to refresh. The money has already settled into the wallet.
class ChargePaidScreen extends StatelessWidget {
  final int? amountMinor;
  final String currency;
  final String? description;

  const ChargePaidScreen({
    super.key,
    required this.amountMinor,
    required this.currency,
    this.description,
  });

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(flex: 2),
              const Center(
                  child: BanzamiVerifiedMark(
                      size: 96, onLight: true, reverseSpin: true)),
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
              if (description != null && description!.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  description!.trim(),
                  style: BanzamiTextStyles.bodyMd
                      .copyWith(color: BanzamiColors.gray400),
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
