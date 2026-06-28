import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';

/// Business verification (KYB) — status + documents, inside the Business app.
///
/// The app does NOT repeat the application form. A merchant applies (and sends
/// the base documents) at `/comerciantes/candidatura`; the Banzami team approves
/// and only then issues credentials. Here the merchant just sees the verification
/// state and (when supported) updates documents — never re-submits the business,
/// the handle, the legal representative, volume, category or location.
///
/// Backend reality (audited): the merchant KYB **status** is real
/// (`GET /v1/compliance/merchants/status`). A merchant-authenticated **document
/// update** flow does not exist yet (documents are application-scoped at apply
/// time), so "Atualizar documento" honestly reports the gap — it never fakes an
/// upload.
class KybScreen extends StatefulWidget {
  const KybScreen({super.key});

  @override
  State<KybScreen> createState() => _KybScreenState();
}

/// One required business document (the base set sent in the application).
class _Doc {
  final String title;
  final IconData icon;
  const _Doc(this.title, this.icon);
}

const _docs = <_Doc>[
  _Doc('Registo Comercial', Icons.business_outlined),
  _Doc('NIF da empresa', Icons.numbers_outlined),
  _Doc('Documento do representante', Icons.badge_outlined),
];

class _KybScreenState extends State<KybScreen> {
  bool _loading = true;
  String? _kyb; // KYB status from the backend, or null if unavailable

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final client = context.read<BanzamiClient>();
    final sessionSvc = context.read<MerchantSessionService>();
    try {
      final res = await client.getMerchantKybStatus();
      if (mounted) setState(() => _kyb = (res['kyb_status'] ?? '').toString().toUpperCase());
    } catch (_) {
      // Endpoint not reachable yet → fall back to the session's verified flag.
      final verified = sessionSvc.session?.verified ?? false;
      if (mounted) setState(() => _kyb = verified ? 'APPROVED' : null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  _Status get _status => _statusFor(_kyb);

  void _updateDocument(String title) {
    // No merchant-authenticated KYB document update exists yet — report the gap
    // honestly; never fake an upload.
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(BanzamiRadius.xxl)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.lg),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: BanzamiSpacing.lg),
            decoration: const BoxDecoration(color: BanzamiColors.gray200, borderRadius: BanzamiRadius.fullAll)),
          Text('Atualizar “$title”', style: BanzamiTextStyles.headingSm),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            'A atualização de documentos diretamente na app ainda não está disponível. '
            'Para substituir um documento do negócio, contacte o suporte — a equipa Banzami '
            'trata da atualização e revisão.',
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600),
          ),
          const SizedBox(height: BanzamiSpacing.md),
          Container(
            padding: const EdgeInsets.all(BanzamiSpacing.md),
            decoration: const BoxDecoration(color: BanzamiColors.gray100, borderRadius: BanzamiRadius.lgAll),
            child: Row(children: [
              const Icon(Icons.mail_outline, size: 18, color: BanzamiColors.gray600),
              const SizedBox(width: BanzamiSpacing.sm),
              Text('suporte@banzami.com', style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600)),
            ]),
          ),
          const SizedBox(height: BanzamiSpacing.lg),
          BanzamiPrimaryButton(label: 'Entendido', onPressed: () => Navigator.of(context).maybePop()),
          const SizedBox(height: BanzamiSpacing.sm),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      appBar: const BanzamiAppBar(title: 'Verificação do negócio'),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(BanzamiSpacing.lg),
                children: [
                  Text(
                    'Acompanhe o estado da verificação e atualize documentos quando necessário.',
                    style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600),
                  ),
                  const SizedBox(height: BanzamiSpacing.lg),

                  // 1. Estado da verificação
                  _StatusCard(status: _status),
                  const SizedBox(height: BanzamiSpacing.lg),

                  // 2. Documentos da empresa
                  const Text('Documentos da empresa', style: BanzamiTextStyles.headingSm),
                  const SizedBox(height: BanzamiSpacing.sm),
                  for (final d in _docs) ...[
                    _DocCard(doc: d, docStatus: _status.docState, onUpdate: () => _updateDocument(d.title)),
                    const SizedBox(height: BanzamiSpacing.md),
                  ],

                  const SizedBox(height: BanzamiSpacing.sm),

                  // 3. Ações necessárias
                  const Text('Ações necessárias', style: BanzamiTextStyles.headingSm),
                  const SizedBox(height: BanzamiSpacing.sm),
                  _ActionsCard(status: _status),
                  const SizedBox(height: BanzamiSpacing.xl),
                ],
              ),
            ),
    );
  }
}

// ── Status model ────────────────────────────────────────────────────────────

class _Status {
  final String label;
  final String detail;
  final Color color;
  final IconData icon;
  final String docState; // verification-derived document state
  const _Status(this.label, this.detail, this.color, this.icon, this.docState);
}

_Status _statusFor(String? kyb) {
  switch (kyb) {
    case 'APPROVED':
      return const _Status('Aprovado', 'O seu negócio está verificado.',
          BanzamiColors.success, Icons.verified_rounded, 'Válido');
    case 'REJECTED':
      return const _Status('Rejeitado', 'A verificação foi recusada.',
          BanzamiColors.error, Icons.cancel_outlined, 'Rejeitado');
    case 'SUSPENDED':
      return const _Status('Suspenso', 'A conta está suspensa.',
          BanzamiColors.error, Icons.pause_circle_outline, 'Suspenso');
    case 'UNDER_REVIEW':
    case 'PENDING':
      return const _Status('Em análise', 'A equipa Banzami está a rever os seus dados.',
          BanzamiColors.warning, Icons.hourglass_top_rounded, 'Em análise');
    default:
      return const _Status('Em análise', 'A verificação está em curso.',
          BanzamiColors.warning, Icons.hourglass_top_rounded, 'Em análise');
  }
}

// ── Cards ───────────────────────────────────────────────────────────────────

class _StatusCard extends StatelessWidget {
  final _Status status;
  const _StatusCard({required this.status});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: BoxDecoration(
        color: status.color.withValues(alpha: 0.10),
        borderRadius: BanzamiRadius.xlAll,
        border: Border.all(color: status.color.withValues(alpha: 0.25)),
      ),
      child: Row(children: [
        Container(
          width: 48, height: 48,
          decoration: BoxDecoration(color: status.color.withValues(alpha: 0.15), shape: BoxShape.circle),
          child: Icon(status.icon, color: status.color),
        ),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(status.label, style: BanzamiTextStyles.headingSm.copyWith(color: status.color)),
            const SizedBox(height: 2),
            Text(status.detail, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray600)),
          ]),
        ),
      ]),
    );
  }
}

class _DocCard extends StatelessWidget {
  final _Doc doc;
  final String docStatus;
  final VoidCallback onUpdate;
  const _DocCard({required this.doc, required this.docStatus, required this.onUpdate});

  Color get _color => switch (docStatus) {
        'Válido' => BanzamiColors.success,
        'Rejeitado' || 'Suspenso' => BanzamiColors.error,
        _ => BanzamiColors.warning,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        border: Border.all(color: BanzamiColors.gray200),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(doc.icon, color: BanzamiColors.primary, size: 22),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(child: Text(doc.title, style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.sm, vertical: 4),
            decoration: BoxDecoration(color: _color.withValues(alpha: 0.12), borderRadius: BanzamiRadius.fullAll),
            child: Text(docStatus, style: BanzamiTextStyles.bodySm.copyWith(color: _color, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: BanzamiSpacing.md),
        SizedBox(
          width: double.infinity,
          child: BanzamiSecondaryButton(label: 'Atualizar documento', onPressed: onUpdate),
        ),
      ]),
    );
  }
}

class _ActionsCard extends StatelessWidget {
  final _Status status;
  const _ActionsCard({required this.status});

  String get _message => switch (status.label) {
        'Aprovado' => 'Tudo em ordem. Nenhuma ação necessária.',
        'Rejeitado' => 'Reenvie os documentos pedidos ou contacte o suporte para reabrir a verificação.',
        'Suspenso' => 'Contacte o suporte para reativar a conta.',
        _ => 'Os seus documentos estão em análise. Avisamos quando a verificação estiver concluída.',
      };

  @override
  Widget build(BuildContext context) {
    final ok = status.label == 'Aprovado';
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        border: Border.all(color: BanzamiColors.gray200),
      ),
      child: Row(children: [
        Icon(ok ? Icons.check_circle_outline : Icons.info_outline,
            color: ok ? BanzamiColors.success : BanzamiColors.warning, size: 20),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(child: Text(_message, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600))),
      ]),
    );
  }
}
