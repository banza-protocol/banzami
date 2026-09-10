import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';

/// How long Banzami keeps a consent code (services/api-gateway
/// business_link_codes.go). The countdown never shows more than this, so a
/// device clock running behind cannot promise a code longer than it lives.
const kProjectLinkCodeTtl = Duration(minutes: 10);

/// What the screen says when a code could not be issued, or null when there is
/// nothing to say here: a 401 means the session ended, and the session
/// handling (sign-in) takes over.
String? projectLinkFailureMessage(Object error) {
  if (error is BanzamiApiException) {
    if (error.statusCode == 401) return null;
    if (error.statusCode >= 500 || error.statusCode == 429 || error.statusCode == 408) {
      return 'O Banzami não conseguiu gerar o código agora. Tente novamente dentro de momentos.';
    }
    return 'Não foi possível gerar o código. Tente novamente.';
  }
  if (error is BanzamiNetworkException) {
    return 'Sem ligação ao Banzami. Tente novamente.';
  }
  return 'Não foi possível gerar o código. Tente novamente.';
}

/// "Ligar a um projeto de developer" — the signed-in Business consents to a
/// Developer Project connecting to it, so that Project can receive payments in
/// the Business's name.
///
/// The consent is a code Banzami issues to this session (single use, valid 10
/// minutes). The Business reads it (or copies / shares it) to the developer,
/// who enters it in the Developers Console. Issuing a new one retires the
/// previous one on Banzami.
///
/// Nothing here is ever a placeholder: a code is shown only as Banzami issued
/// it, only while it is valid, and only while this Business is signed in.
class ProjectLinkScreen extends StatefulWidget {
  /// The clock the countdown reads. Tests pass their own.
  final DateTime Function() now;

  const ProjectLinkScreen({super.key, this.now = DateTime.now});

  @override
  State<ProjectLinkScreen> createState() => _ProjectLinkScreenState();
}

class _ProjectLinkScreenState extends State<ProjectLinkScreen> {
  ProjectLinkCode? _code;
  String?          _codeMerchantId; // the Business the code was issued to
  DateTime?        _deadline;       // on this device's clock
  Timer?           _ticker;
  bool             _loading = false;
  String?          _error;

  /// Each request carries a number; only the answer to the latest one counts.
  int _request = 0;

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _dropCode() {
    _ticker?.cancel();
    _ticker         = null;
    _code           = null;
    _codeMerchantId = null;
    _deadline       = null;
  }

  Future<void> _generate() async {
    final svc    = context.read<MerchantSessionService>();
    final client = context.read<BanzamiClient>();
    final merchantId = svc.session?.merchantId;
    if (merchantId == null || _loading) return;

    final request = ++_request;
    setState(() {
      _loading = true;
      _error   = null;
      // A new request retires the code on screen: whatever Banzami answers,
      // the previous one may already be gone, so it is not shown any more.
      _dropCode();
    });

    try {
      final code = await client.createProjectLinkCode();
      if (!mounted || request != _request) return;
      // The session may have ended, or changed Business, while waiting.
      if (svc.route != MerchantRoute.signedIn || svc.session?.merchantId != merchantId) {
        setState(() => _loading = false);
        return;
      }
      final issuedAt = widget.now();
      var left = code.expiresAt.difference(issuedAt);
      if (left > kProjectLinkCodeTtl) left = kProjectLinkCodeTtl;
      setState(() {
        _loading        = false;
        _code           = code;
        _codeMerchantId = merchantId;
        _deadline       = issuedAt.add(left.isNegative ? Duration.zero : left);
        _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
      });
    } catch (e) {
      if (!mounted || request != _request) return;
      setState(() {
        _loading = false;
        _error   = projectLinkFailureMessage(e);
      });
    }
  }

  void _tick() {
    if (!mounted) return;
    final left = _remaining;
    setState(() {});
    if (left == Duration.zero) {
      _ticker?.cancel();
      _ticker = null;
    }
  }

  Duration get _remaining {
    final d = _deadline;
    if (d == null) return Duration.zero;
    final left = d.difference(widget.now());
    return left.isNegative ? Duration.zero : left;
  }

  Future<void> _copy(String code) async {
    try {
      await Clipboard.setData(ClipboardData(text: code));
      if (mounted) BanzamiToast.showSuccess(context, 'Código copiado.');
    } on PlatformException {
      if (mounted) BanzamiToast.showError(context, 'Não foi possível copiar o código.');
    }
  }

  Future<void> _share(String code, String businessName) async {
    try {
      await Share.share(
        'Código do Banzami para ligar o seu projeto a $businessName: $code\n'
        'É válido durante 10 minutos e só pode ser usado uma vez.',
      );
    } on PlatformException {
      if (mounted) BanzamiToast.showError(context, 'Não foi possível partilhar o código.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<MerchantSessionService>();
    final session = svc.session;
    final signedIn = svc.route == MerchantRoute.signedIn && session != null;

    // A code belongs to the session that asked for it: once the session ends,
    // locks, or is another Business, it is not shown again — not even on the
    // way out of this screen (the app also pops it, see app.dart). Dropped
    // here, during the rebuild the session change causes; no setState needed.
    if (_code != null && (!signedIn || session.merchantId != _codeMerchantId)) {
      _dropCode();
    }

    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      appBar: const BanzamiAppBar(
        title:           'Ligar a um projeto',
        backgroundColor: BanzamiColors.white,
      ),
      body: !signedIn
          ? const SizedBox.shrink()
          : SingleChildScrollView(
              padding: const EdgeInsets.all(BanzamiSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Explanation(businessName: session.merchantName, sandbox: session.isSandbox),
                  const SizedBox(height: BanzamiSpacing.xl),
                  if (_code != null)
                    _CodeCard(
                      code:      _code!.code,
                      remaining: _remaining,
                      onCopy:    () => _copy(_code!.code),
                      onShare:   () => _share(_code!.code, session.merchantName),
                    ),
                  if (_error != null) BanzamiErrorBanner(message: _error!),
                  const SizedBox(height: BanzamiSpacing.xl),
                  BanzamiPrimaryButton(
                    label:     _code == null && _error == null && _request == 0
                        ? 'Gerar código'
                        : 'Gerar novo código',
                    icon:      Icons.refresh_rounded,
                    isLoading: _loading,
                    onPressed: _loading ? null : _generate,
                  ),
                  if (_code != null) ...[
                    const SizedBox(height: BanzamiSpacing.sm),
                    Text(
                      'Um novo código anula o anterior.',
                      textAlign: TextAlign.center,
                      style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _Explanation extends StatelessWidget {
  final String businessName;
  final bool   sandbox;
  const _Explanation({required this.businessName, required this.sandbox});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width:  48,
          height: 48,
          decoration: BoxDecoration(
            color:        BanzamiColors.primary.withValues(alpha: 0.08),
            borderRadius: BanzamiRadius.lgAll,
          ),
          child: const Icon(Icons.integration_instructions_outlined,
              color: BanzamiColors.primary),
        ),
        const SizedBox(height: BanzamiSpacing.lg),
        const Text('Ligar a um projeto de developer', style: BanzamiTextStyles.headingMd),
        const SizedBox(height: BanzamiSpacing.sm),
        Text(
          'Um programador quer ligar um projeto ao seu negócio para receber '
          'pagamentos em nome de $businessName. Dê-lhe este código apenas se '
          'confiar nele. O código é válido durante 10 minutos e só pode ser '
          'usado uma vez.',
          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600),
        ),
        if (sandbox) ...[
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            'Ambiente de testes (Sandbox): o código só liga projetos Sandbox.',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        ],
      ],
    );
  }
}

class _CodeCard extends StatelessWidget {
  final String       code;
  final Duration     remaining;
  final VoidCallback onCopy;
  final VoidCallback onShare;

  const _CodeCard({
    required this.code,
    required this.remaining,
    required this.onCopy,
    required this.onShare,
  });

  static String _mmss(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final expired = remaining == Duration.zero;
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: const BoxDecoration(
        color:        BanzamiColors.gray100,
        borderRadius: BanzamiRadius.xlAll,
      ),
      child: Column(
        children: [
          if (expired) ...[
            Text('Código expirado',
                key:   const ValueKey('project-link-expired'),
                style: BanzamiTextStyles.headingSm.copyWith(color: BanzamiColors.error)),
            const SizedBox(height: BanzamiSpacing.xs),
            Text('Gere um novo código para continuar.',
                textAlign: TextAlign.center,
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          ] else ...[
            // Large, and copied with a tap (or the Copiar button below).
            GestureDetector(
              onTap: onCopy,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  code,
                  key:   const ValueKey('project-link-code'),
                  style: BanzamiTextStyles.monoLg.copyWith(letterSpacing: 2),
                ),
              ),
            ),
            const SizedBox(height: BanzamiSpacing.xs),
            Text(
              'Expira em ${_mmss(remaining)}',
              key:   const ValueKey('project-link-countdown'),
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray600),
            ),
            const SizedBox(height: BanzamiSpacing.md),
            Row(children: [
              Expanded(
                child: BanzamiSecondaryButton(label: 'Copiar', onPressed: onCopy, height: 44),
              ),
              const SizedBox(width: BanzamiSpacing.sm),
              Expanded(
                child: BanzamiSecondaryButton(label: 'Partilhar', onPressed: onShare, height: 44),
              ),
            ]),
          ],
        ],
      ),
    );
  }
}
