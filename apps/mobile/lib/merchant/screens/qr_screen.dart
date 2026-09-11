import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../widgets/app_screen_header.dart';

import '../services/merchant_session_service.dart';
import 'charge_screen.dart';

/// Ecrã "Receber" — como o negócio recebe um pagamento hoje: uma cobrança
/// (link de pagamento) cujo QR/link o cliente paga na app Banzami.
///
/// It used to show a static structured QR (`/v1/qr/static`) as "Mostre este QR
/// ao cliente". No client can pay one: the consumer surface has no QR-pay route
/// (withdrawn, RA-053) and the consumer app refuses structured QRs. A
/// Business's @banza is not a P2P destination either (transfers route to
/// consumer handles only). So the tab no longer shows a code nobody can pay —
/// it says what works and opens it.
class MerchantQrScreen extends StatelessWidget {
  const MerchantQrScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session;

    return BanzamiScaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppScreenHeader(
              title:    'Receber',
              subtitle: 'Cobranças por link e QR',
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: BanzamiSpacing.xl,
                  vertical:   BanzamiSpacing.lg,
                ),
                child: Column(children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(BanzamiSpacing.xl),
                    decoration: const BoxDecoration(
                      color:        BanzamiColors.white,
                      borderRadius: BanzamiRadius.xxlAll,
                      boxShadow:    BanzamiShadows.card,
                    ),
                    child: Column(children: [
                      const Icon(Icons.qr_code_2_rounded,
                          color: BanzamiColors.primary, size: 48),
                      const SizedBox(height: BanzamiSpacing.md),
                      if (session != null) ...[
                        Text(
                          session.merchantName,
                          style:     BanzamiTextStyles.headingSm,
                          textAlign: TextAlign.center,
                        ),
                        if (session.banzaAddress != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            session.banzaAddress!,
                            style: BanzamiTextStyles.bodyMd.copyWith(
                              color: BanzamiColors.primary,
                              fontWeight: FontWeight.w700,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                        const SizedBox(height: BanzamiSpacing.md),
                      ],
                      Text(
                        kReceiveHowItWorks,
                        style: BanzamiTextStyles.bodyMd.copyWith(
                          color: BanzamiColors.gray600,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: BanzamiSpacing.sm),
                      Text(
                        kStaticQrUnavailable,
                        style: BanzamiTextStyles.bodySm.copyWith(
                          color: BanzamiColors.gray400,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ]),
                  ),
                  const SizedBox(height: BanzamiSpacing.xl),
                  BanzamiPrimaryButton(
                    label:     'Criar cobrança',
                    icon:      Icons.add_circle_outline_rounded,
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const ChargeScreen()),
                    ),
                  ),
                  const SizedBox(height: BanzamiSpacing.page),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// What works today: a charge is a payment link with its own QR.
const String kReceiveHowItWorks =
    'Crie uma cobrança: o cliente paga pelo link ou pelo QR da cobrança, '
    'na app Banzami.';

/// No dead promise: a counter QR for any amount does not exist yet.
const String kStaticQrUnavailable =
    'O QR fixo de balcão ainda não está disponível nesta versão.';
