import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../screens/kyc_screen.dart';

/// Shows the consumer's identity-verification state at the top of the home
/// tab. Hidden once the consumer's KYC case is approved. Tapping an actionable
/// state opens [KycScreen].
///
/// Product principle: KYC is not the entry barrier — it's the financial-movement
/// barrier. So a new account is usable but shows "Conta limitada" until verified.
///
/// The state is the consumer's own current case, read through the public API
/// client the consumer app provides ([ConsumerPublicClient]). The banner used to
/// ask for the merchant SDK client, which the consumer app never provides, so
/// the lookup always threw, the error was swallowed and the banner never showed.
class KycStatusBanner extends StatefulWidget {
  const KycStatusBanner({super.key, this.loadCase});

  /// How the current case is read. Defaults to the provided
  /// [ConsumerPublicClient]; tests pass their own.
  final Future<KycCase?> Function(BuildContext context)? loadCase;

  @override
  State<KycStatusBanner> createState() => _KycStatusBannerState();
}

/// What the banner says for a case, or `null` when it should not show.
/// `null` case = the consumer has not started verification.
class KycBannerContent {
  const KycBannerContent({
    required this.title,
    required this.subtitle,
    required this.actionable,
    required this.warning,
  });

  final String title;
  final String subtitle;
  final bool actionable;

  /// Warning (amber) or error (red) tone.
  final bool warning;

  static KycBannerContent? forCase(KycCase? kycCase) {
    final status = kycCase?.status;
    switch (status) {
      case KycStatus.approved:
        return null;
      case KycStatus.underReview:
      case KycStatus.documentsReceived:
        return const KycBannerContent(
          title: 'Identidade em análise',
          subtitle: 'Estamos a rever os seus dados.',
          actionable: false,
          warning: true,
        );
      case KycStatus.rejected:
        return const KycBannerContent(
          title: 'Verificação recusada',
          subtitle: 'Toque para tentar novamente.',
          actionable: true,
          warning: false,
        );
      case KycStatus.needsMoreInfo:
        return const KycBannerContent(
          title: 'Precisamos de mais informação',
          subtitle: 'Toque para completar a verificação.',
          actionable: true,
          warning: true,
        );
      case KycStatus.draft:
      case KycStatus.waitingDocuments:
        return const KycBannerContent(
          title: 'Verificação por concluir',
          subtitle: 'Envie os documentos para enviar e levantar dinheiro.',
          actionable: true,
          warning: true,
        );
      default:
        // No case yet, or one that ended (expired, cancelled, failed, unknown).
        return const KycBannerContent(
          title: 'Conta limitada',
          subtitle: 'Verifique a identidade para enviar e levantar dinheiro.',
          actionable: true,
          warning: true,
        );
    }
  }
}

class _KycStatusBannerState extends State<KycStatusBanner> {
  KycBannerContent? _content;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<KycCase?> _read() {
    final custom = widget.loadCase;
    if (custom != null) return custom(context);
    return context.read<ConsumerPublicClient>().getCurrentKycCase();
  }

  Future<void> _load() async {
    try {
      final kycCase = await _read();
      if (!mounted) return;
      setState(() {
        _content = KycBannerContent.forCase(kycCase);
        _loaded = true;
      });
    } catch (_) {
      // The state could not be read (offline, outage): say nothing rather than
      // tell a verified consumer their account is limited.
      if (mounted) setState(() => _loaded = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final content = _content;
    if (!_loaded || content == null) return const SizedBox.shrink();
    final color = content.warning ? BanzamiColors.warning : BanzamiColors.error;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          BanzamiSpacing.lg, BanzamiSpacing.md, BanzamiSpacing.lg, 0),
      child: Material(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: content.actionable
              ? () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const KycScreen()))
                  .then((_) => _load())
              : null,
          child: Padding(
            padding: const EdgeInsets.all(BanzamiSpacing.md),
            child: Row(children: [
              Icon(Icons.verified_user_outlined, color: color, size: 22),
              const SizedBox(width: BanzamiSpacing.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(content.title, style: BanzamiTextStyles.bodyMd.copyWith(
                      color: color, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(content.subtitle, style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.gray600)),
                ]),
              ),
              if (content.actionable)
                Icon(Icons.chevron_right_rounded, color: color),
            ]),
          ),
        ),
      ),
    );
  }
}
