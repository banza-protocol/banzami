import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../screens/kyc_screen.dart';

/// Shows the consumer's Progressive-KYC account state at the top of the home
/// tab. Hidden when the account is fully verified (approved with a real level).
/// Tapping an actionable state opens [KycScreen].
///
/// Product principle: KYC is not the entry barrier — it's the financial-movement
/// barrier. So a new account is usable but shows "Conta limitada" until verified.
class KycStatusBanner extends StatefulWidget {
  const KycStatusBanner({super.key});

  @override
  State<KycStatusBanner> createState() => _KycStatusBannerState();
}

class _KycStatusBannerState extends State<KycStatusBanner> {
  Map<String, dynamic>? _status;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await context.read<BanzamiClient>().getKycStatus();
      if (mounted) setState(() => _status = s);
    } catch (_) {
      // Best-effort: a fetch failure simply hides the banner.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _status == null) return const SizedBox.shrink();

    final level  = (_status!['kyc_level'] ?? 'NONE').toString();
    final status = (_status!['kyc_status'] ?? 'PENDING').toString();

    // Fully verified — nothing to show.
    if (status == 'APPROVED' && level != 'NONE') return const SizedBox.shrink();

    final (color, title, sub, actionable) = switch (status) {
      'UNDER_REVIEW' => (BanzamiColors.warning, 'Identidade em análise',
          'Estamos a rever os seus dados.', false),
      'REJECTED' => (BanzamiColors.error, 'Verificação recusada',
          'Toque para tentar novamente.', true),
      _ => (BanzamiColors.warning, 'Conta limitada',
          'Verifique a identidade para enviar e levantar dinheiro.', true),
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          BanzamiSpacing.lg, BanzamiSpacing.md, BanzamiSpacing.lg, 0),
      child: Material(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: actionable
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
                  Text(title, style: BanzamiTextStyles.bodyMd.copyWith(
                      color: color, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(sub, style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.gray600)),
                ]),
              ),
              if (actionable)
                Icon(Icons.chevron_right_rounded, color: color),
            ]),
          ),
        ),
      ),
    );
  }
}
