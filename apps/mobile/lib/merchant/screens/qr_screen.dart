import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';
import 'charge_screen.dart';

/// Ecrã "Receber" — o QR de recebimento persistente do negócio (ADR-065).
///
/// O negócio imprime UM QR estável: "este é o meu QR Banzami, podes pagar-me".
/// Lê-lo aprovisiona-o na primeira utilização. Ao ser lido, resolve a identidade
/// pública do negócio e o pagador cria uma NOVA sessão de pagamento por cada
/// pagamento — o QR é persistente, a sessão não. Para um montante específico numa
/// venda, "Criar cobrança" continua a ser o caminho.
class MerchantQrScreen extends StatefulWidget {
  const MerchantQrScreen({super.key});

  @override
  State<MerchantQrScreen> createState() => _MerchantQrScreenState();
}

class _MerchantQrScreenState extends State<MerchantQrScreen> {
  MerchantReceivePoint? _point;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!_loading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final client = context.read<BanzamiClient>();
      final point = await client.getReceivePoint();
      if (!mounted) return;
      setState(() {
        _point = point.isActive ? point : null;
        _error = point.isActive ? null : kStaticQrUnavailable;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = banzamiErrorMessage(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session;
    // A Business @banza is not a transfer destination — it is shown only as
    // identity, never as a payable handle. Read it when a session exists.
    final merchantName = session?.merchantName;
    String? handle;
    if (session != null) handle = session.banzaAddress;

    return BanzamiScaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppScreenHeader(
              title: 'Receber',
              subtitle: 'O seu QR Banzami — imprima e receba',
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: BanzamiSpacing.xl,
                  vertical: BanzamiSpacing.lg,
                ),
                child: Column(children: [
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.all(BanzamiSpacing.page),
                      child: CircularProgressIndicator(
                          color: BanzamiColors.primary),
                    )
                  else if (_point != null)
                    _ReceivePointCard(
                      point: _point!,
                      merchantName: merchantName,
                      handle: handle,
                    )
                  else
                    _UnavailableCard(
                      merchantName: merchantName,
                      handle: handle,
                      message: _error ?? kStaticQrUnavailable,
                    ),
                  const SizedBox(height: BanzamiSpacing.xl),
                  BanzamiPrimaryButton(
                    label: 'Criar cobrança',
                    icon: Icons.add_circle_outline_rounded,
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

class _ReceivePointCard extends StatelessWidget {
  final MerchantReceivePoint point;
  final String? merchantName;
  final String? handle;
  const _ReceivePointCard({required this.point, this.merchantName, this.handle});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      if (merchantName != null) ...[
        Text(merchantName!,
            style: BanzamiTextStyles.headingSm, textAlign: TextAlign.center),
        const SizedBox(height: BanzamiSpacing.md),
      ],
      BanzamiQrDisplay(
        payload: point.payUrl,
        subtitle: handle,
        size: 240,
      ),
      const SizedBox(height: BanzamiSpacing.md),
      Text(
        kReceiveHowItWorks,
        style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600),
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: BanzamiSpacing.sm),
      BanzamiSecondaryButton(
        label: 'Copiar ligação',
        onPressed: () {
          Clipboard.setData(ClipboardData(text: point.payUrl));
          BanzamiToast.showSuccess(context, 'Ligação copiada');
        },
      ),
    ]);
  }
}

class _UnavailableCard extends StatelessWidget {
  final String? merchantName;
  final String? handle;
  final String message;
  const _UnavailableCard(
      {this.merchantName, this.handle, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      decoration: const BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xxlAll,
        boxShadow: BanzamiShadows.card,
      ),
      child: Column(children: [
        const Icon(Icons.qr_code_2_rounded,
            color: BanzamiColors.primary, size: 48),
        const SizedBox(height: BanzamiSpacing.md),
        if (merchantName != null) ...[
          Text(merchantName!,
              style: BanzamiTextStyles.headingSm, textAlign: TextAlign.center),
          if (handle != null) ...[
            const SizedBox(height: 2),
            Text(handle!,
                style: BanzamiTextStyles.bodyMd.copyWith(
                  color: BanzamiColors.primary,
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center),
          ],
          const SizedBox(height: BanzamiSpacing.md),
        ],
        Text(
          message,
          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600),
          textAlign: TextAlign.center,
        ),
      ]),
    );
  }
}

/// What works: a persistent receive QR anyone can scan to pay this Business.
const String kReceiveHowItWorks =
    'Mostre ou imprima este QR. O cliente lê-o na app Banzami, escreve o '
    'montante e paga — direto para a sua carteira.';

/// Shown only when the receive point is not available (kept for the fallback).
const String kStaticQrUnavailable =
    'O seu QR de recebimento ainda não está disponível. Crie uma cobrança.';
