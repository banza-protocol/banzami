import 'package:flutter/material.dart';

import '../theme/banzami_theme.dart';
import '../widgets/banzami_components.dart';
import '../widgets/banzami_verified_mark.dart';
import '../widgets/money_amount.dart';

/// The single "payment received" confirmation, shared by BOTH apps:
///
///  * Consumer "Receber": a defined-amount receive link is paid — the Receber QR
///    auto-dismisses into this screen.
///  * Business "Nova cobrança" (Simples): a payment link is paid — the QR
///    auto-dismisses into this screen.
///
/// One screen, one look on both surfaces (white background, the animated
/// verified mark, the payer when known). The money has already settled into the
/// wallet by the time this shows.
class PaymentReceivedScreen extends StatelessWidget {
  final int? amountMinor;
  final String currency;

  /// The payer, "@"-prefixed (e.g. "@kiara"), when known.
  final String? from;

  /// An optional note/description carried by the request.
  final String? note;

  const PaymentReceivedScreen({
    super.key,
    required this.amountMinor,
    required this.currency,
    this.from,
    this.note,
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
                      size: 96,
                      onLight: true,
                      reverseSpin: true,
                      ringColor: BanzamiColors.white,
                      labelGap: 0.30)),
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
              if (from != null && from!.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  'de ${from!.trim()}',
                  style: BanzamiTextStyles.bodyMd
                      .copyWith(color: BanzamiColors.gray700),
                  textAlign: TextAlign.center,
                ),
              ],
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
