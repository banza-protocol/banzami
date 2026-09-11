import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../widgets/app_screen_header.dart';

/// Consumer identity verification (KYC) — Banzami ADR-020.
///
/// A real, document-first flow: choose a document, capture it + a selfie, review,
/// then upload the evidence straight to R2 via short-lived signed URLs and submit
/// for an operator review. The operator decides the level — the consumer never
/// picks one (no `requested_level`, no "Nível pretendido"). Images are held only
/// in memory during the flow, uploaded once, and the temp files are deleted. The
/// signed URLs, storage keys, local paths and any PII are never logged.
class KycScreen extends StatefulWidget {
  const KycScreen({super.key});

  @override
  State<KycScreen> createState() => _KycScreenState();
}

enum _Step { loading, intro, chooseDoc, capture, review, submitting, status }

/// One captured artifact, kept in memory only.
class _Capture {
  final String path;
  final Uint8List bytes;
  final KycEvidenceType evidenceType;
  final KycDocumentSide? side;
  const _Capture({required this.path, required this.bytes, required this.evidenceType, required this.side});
}

class _KycScreenState extends State<KycScreen> {
  final _picker = ImagePicker();
  // One key per "start verification with this document": a retry after a
  // lost answer resumes the same case instead of opening another.
  final _startIntent = IdempotencyIntent();

  _Step _step = _Step.loading;
  KycCase? _case;
  KycDocumentType? _docType;

  /// slot name -> captured file (in memory). Empty after a successful submit.
  final Map<String, _Capture> _captures = {};

  String? _error;
  String _progress = '';

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _discardLocalFiles();
    super.dispose();
  }

  ConsumerPublicClient get _client => context.read<ConsumerPublicClient>();

  // ── Bootstrap / resume ──────────────────────────────────────────────────

  Future<void> _bootstrap() async {
    try {
      final existing = await _client.getCurrentKycCase();
      if (!mounted) return;
      if (existing == null) {
        setState(() => _step = _Step.intro);
        return;
      }
      _case = existing;
      _docType = existing.documentType;
      switch (existing.status) {
        case KycStatus.underReview:
        case KycStatus.approved:
        case KycStatus.rejected:
          setState(() => _step = _Step.status);
        case KycStatus.waitingDocuments:
        case KycStatus.documentsReceived:
        case KycStatus.needsMoreInfo:
          // Resume capture: already-uploaded sides show as done.
          setState(() => _step = _docType == null ? _Step.chooseDoc : _Step.capture);
        default:
          setState(() => _step = _Step.intro);
      }
    } catch (_) {
      if (mounted) setState(() => _step = _Step.intro);
    }
  }

  // ── Required evidence ─────────────────────────────────────────────────────

  /// Required evidence for the active case (authoritative), or a sensible default
  /// derived from the chosen document before the case exists.
  List<KycDocument> get _required {
    final c = _case;
    if (c != null && c.requiredEvidence.isNotEmpty) return c.requiredEvidence;
    // Pre-case fallback (UI only) — the backend is the source of truth once created.
    if (_docType == KycDocumentType.passport) {
      return const [
        KycDocument(evidenceType: KycEvidenceType.documentImage, side: KycDocumentSide.mainPage, slot: 'passport-main', uploaded: false),
        KycDocument(evidenceType: KycEvidenceType.documentImage, side: KycDocumentSide.lastPage, slot: 'passport-last', uploaded: false),
        KycDocument(evidenceType: KycEvidenceType.selfie, side: KycDocumentSide.selfie, slot: 'selfie', uploaded: false),
      ];
    }
    return const [
      KycDocument(evidenceType: KycEvidenceType.documentImage, side: KycDocumentSide.front, slot: 'document-front', uploaded: false),
      KycDocument(evidenceType: KycEvidenceType.documentImage, side: KycDocumentSide.back, slot: 'document-back', uploaded: false),
      KycDocument(evidenceType: KycEvidenceType.selfie, side: KycDocumentSide.selfie, slot: 'selfie', uploaded: false),
    ];
  }

  bool _isDone(KycDocument d) => _captures.containsKey(d.slot) || d.uploaded;

  bool get _allCaptured => _required.every(_isDone);

  Future<void> _captureFor(KycDocument d) async {
    final ev = d.evidenceType;
    if (ev == null) return;
    final isSelfie = ev == KycEvidenceType.selfie;
    try {
      final XFile? x = await _picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: isSelfie ? CameraDevice.front : CameraDevice.rear,
        imageQuality: 85,
        maxWidth: 2400,
      );
      if (x == null) return;
      final bytes = await x.readAsBytes();
      if (!mounted) return;
      setState(() {
        _captures[d.slot] = _Capture(path: x.path, bytes: bytes, evidenceType: ev, side: d.side);
        _error = null;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível abrir a câmara. Tente novamente.');
    }
  }

  // ── Create case / submit ────────────────────────────────────────────────

  Future<void> _startWithDocument(KycDocumentType type) async {
    setState(() { _error = null; _docType = type; });
    try {
      final c = await _client.createKycCase(
          documentType: type, country: 'AO', idempotencyKey: _startIntent.keyFor(type));
      if (!mounted) return;
      // A different document was already in progress server-side: keep that case
      // and drop any local captures that no longer apply.
      if (c.documentType != null && c.documentType != type) {
        _captures.clear();
        _docType = c.documentType;
      }
      setState(() { _case = c; _step = _Step.capture; });
    } catch (e) {
      if (mounted) setState(() => _error = banzamiErrorMessage(e));
    }
  }

  Future<void> _runUpload() async {
    final c = _case;
    if (c == null) return;
    setState(() { _step = _Step.submitting; _error = null; });

    try {
      final required = _required;
      for (var i = 0; i < required.length; i++) {
        final d = required[i];
        if (d.uploaded) continue; // already on the server (resume)
        final cap = _captures[d.slot];
        if (cap == null) throw const _MissingEvidence();

        setState(() => _progress = 'A enviar documento ${i + 1} de ${required.length}…');

        final up = await _client.requestKycUploadUrl(
          caseId: c.id,
          evidenceType: cap.evidenceType,
          side: cap.side,
          contentType: 'image/jpeg',
        );
        final put = await http.put(
          Uri.parse(up.url),
          headers: {'Content-Type': 'image/jpeg', ...up.headers},
          body: cap.bytes,
        );
        if (put.statusCode < 200 || put.statusCode >= 300) {
          throw const _UploadFailed();
        }
        await _client.completeKycEvidenceUpload(caseId: c.id, evidenceId: up.evidenceId);
        _deleteFile(cap.path);
      }

      setState(() => _progress = 'A submeter…');
      final submitted = await _client.submitKycCase(c.id);
      if (!mounted) return;
      _captures.clear();
      setState(() { _case = submitted; _step = _Step.status; });
    } on BanzamiApiException catch (e) {
      final msg = banzamiErrorMessage(e, codes: const {
        'EVIDENCE_INCOMPLETE': 'Faltam documentos. Capture todos antes de enviar.',
        'STORAGE_NOT_CONFIGURED':
            'Serviço de verificação temporariamente indisponível. Tente mais tarde.',
      });
      if (mounted) setState(() { _error = msg; _step = _Step.review; });
    } on _MissingEvidence {
      if (mounted) setState(() { _error = 'Faltam documentos. Capture todos antes de enviar.'; _step = _Step.review; });
    } catch (_) {
      if (mounted) setState(() { _error = 'O envio falhou. Verifique a ligação e tente novamente.'; _step = _Step.review; });
    }
  }

  // ── File hygiene ────────────────────────────────────────────────────────

  void _deleteFile(String path) {
    try { File(path).delete(); } catch (_) {/* best-effort */}
  }

  void _discardLocalFiles() {
    for (final c in _captures.values) {
      _deleteFile(c.path);
    }
    _captures.clear();
  }

  // ── Build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(BanzamiSpacing.lg, BanzamiSpacing.sm, BanzamiSpacing.lg, 0),
              child: AppScreenHeader(
                title: 'Verificar identidade',
                onBack: () => Navigator.of(context).maybePop(),
              ),
            ),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    switch (_step) {
      case _Step.loading:
        return const Center(child: CircularProgressIndicator());
      case _Step.intro:
        return _IntroView(onStart: () => setState(() => _step = _Step.chooseDoc));
      case _Step.chooseDoc:
        return _ChooseDocView(selected: _docType, error: _error, onPick: _startWithDocument);
      case _Step.capture:
        return _CaptureView(
          required: _required,
          captures: _captures,
          error: _error,
          onCapture: _captureFor,
          onContinue: _allCaptured ? () => setState(() => _step = _Step.review) : null,
        );
      case _Step.review:
        return _ReviewView(
          required: _required,
          captures: _captures,
          error: _error,
          onEdit: () => setState(() => _step = _Step.capture),
          onSubmit: _runUpload,
        );
      case _Step.submitting:
        return _ProgressView(message: _progress.isEmpty ? 'A enviar…' : _progress);
      case _Step.status:
        return _StatusView(
          kycCase: _case,
          onDone: () => Navigator.of(context).maybePop(),
          onRetry: () => setState(() { _error = null; _step = _Step.capture; }),
        );
    }
  }
}

class _MissingEvidence implements Exception { const _MissingEvidence(); }
class _UploadFailed implements Exception { const _UploadFailed(); }

// ───────────────────────────────────────────────────────────────────────────
// Step views
// ───────────────────────────────────────────────────────────────────────────

class _IntroView extends StatelessWidget {
  final VoidCallback onStart;
  const _IntroView({required this.onStart});

  @override
  Widget build(BuildContext context) {
    return _Scroll(children: [
      const SizedBox(height: BanzamiSpacing.sm),
      const Text('Confirme quem é', style: BanzamiTextStyles.headingLg),
      const SizedBox(height: BanzamiSpacing.sm),
      Text(
        'Para enviar e levantar dinheiro sem limites, precisamos de confirmar a sua identidade. '
        'É rápido: um documento e uma selfie.',
        style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600),
      ),
      const SizedBox(height: BanzamiSpacing.lg),
      const _InfoRow(icon: Icons.badge_outlined, title: 'Documento de identidade', sub: 'Bilhete de Identidade ou Passaporte'),
      const _InfoRow(icon: Icons.face_outlined, title: 'Uma selfie', sub: 'Para confirmar que é mesmo você'),
      const _InfoRow(icon: Icons.lock_outline, title: 'Seguro e privado', sub: 'As imagens são enviadas de forma cifrada'),
      const SizedBox(height: BanzamiSpacing.xl),
      BanzamiPrimaryButton(label: 'Começar', onPressed: onStart),
      const SizedBox(height: BanzamiSpacing.lg),
    ]);
  }
}

class _ChooseDocView extends StatelessWidget {
  final KycDocumentType? selected;
  final String? error;
  final ValueChanged<KycDocumentType> onPick;
  const _ChooseDocView({required this.selected, required this.error, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return _Scroll(children: [
      const SizedBox(height: BanzamiSpacing.sm),
      const Text('Escolha o documento', style: BanzamiTextStyles.headingLg),
      const SizedBox(height: BanzamiSpacing.lg),
      _DocCard(
        icon: Icons.badge_outlined,
        title: 'Bilhete de Identidade',
        sub: 'Frente e verso',
        onTap: () => onPick(KycDocumentType.identityCard),
      ),
      const SizedBox(height: BanzamiSpacing.md),
      _DocCard(
        icon: Icons.menu_book_outlined,
        title: 'Passaporte',
        sub: 'Página principal e última',
        onTap: () => onPick(KycDocumentType.passport),
      ),
      if (error != null) ...[
        const SizedBox(height: BanzamiSpacing.md),
        _ErrorText(error!),
      ],
    ]);
  }
}

class _CaptureView extends StatelessWidget {
  final List<KycDocument> required;
  final Map<String, _Capture> captures;
  final String? error;
  final ValueChanged<KycDocument> onCapture;
  final VoidCallback? onContinue;

  const _CaptureView({
    required this.required,
    required this.captures,
    required this.error,
    required this.onCapture,
    required this.onContinue,
  });

  @override
  Widget build(BuildContext context) {
    return _Scroll(children: [
      const SizedBox(height: BanzamiSpacing.sm),
      const Text('Capture os documentos', style: BanzamiTextStyles.headingLg),
      const SizedBox(height: BanzamiSpacing.xs),
      Text('Boa luz, sem reflexos, dentro do enquadramento.',
          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
      const SizedBox(height: BanzamiSpacing.lg),
      for (final d in required) ...[
        _CaptureCard(
          label: _labelFor(d),
          captured: captures[d.slot]?.bytes,
          alreadyUploaded: d.uploaded,
          onTap: () => onCapture(d),
        ),
        const SizedBox(height: BanzamiSpacing.md),
      ],
      if (error != null) ...[const SizedBox(height: BanzamiSpacing.xs), _ErrorText(error!)],
      const SizedBox(height: BanzamiSpacing.md),
      BanzamiPrimaryButton(label: 'Continuar', onPressed: onContinue),
      const SizedBox(height: BanzamiSpacing.lg),
    ]);
  }
}

class _ReviewView extends StatelessWidget {
  final List<KycDocument> required;
  final Map<String, _Capture> captures;
  final String? error;
  final VoidCallback onEdit;
  final VoidCallback onSubmit;
  const _ReviewView({required this.required, required this.captures, required this.error, required this.onEdit, required this.onSubmit});

  @override
  Widget build(BuildContext context) {
    return _Scroll(children: [
      const SizedBox(height: BanzamiSpacing.sm),
      const Text('Reveja antes de enviar', style: BanzamiTextStyles.headingLg),
      const SizedBox(height: BanzamiSpacing.lg),
      for (final d in required)
        Padding(
          padding: const EdgeInsets.only(bottom: BanzamiSpacing.md),
          child: Row(children: [
            _Thumb(bytes: captures[d.slot]?.bytes, done: d.uploaded),
            const SizedBox(width: BanzamiSpacing.md),
            Expanded(child: Text(_labelFor(d), style: BanzamiTextStyles.bodyMd)),
            Icon(
              (captures.containsKey(d.slot) || d.uploaded) ? Icons.check_circle : Icons.radio_button_unchecked,
              color: (captures.containsKey(d.slot) || d.uploaded) ? BanzamiColors.success : BanzamiColors.gray200,
            ),
          ]),
        ),
      if (error != null) ...[const SizedBox(height: BanzamiSpacing.xs), _ErrorText(error!)],
      const SizedBox(height: BanzamiSpacing.md),
      BanzamiPrimaryButton(label: 'Enviar verificação', onPressed: onSubmit),
      const SizedBox(height: BanzamiSpacing.sm),
      BanzamiSecondaryButton(label: 'Voltar e editar', onPressed: onEdit),
      const SizedBox(height: BanzamiSpacing.lg),
    ]);
  }
}

class _ProgressView extends StatelessWidget {
  final String message;
  const _ProgressView({required this.message});
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const CircularProgressIndicator(),
        const SizedBox(height: BanzamiSpacing.lg),
        Text(message, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600)),
      ]),
    );
  }
}

class _StatusView extends StatelessWidget {
  final KycCase? kycCase;
  final VoidCallback onDone;
  final VoidCallback onRetry;
  const _StatusView({required this.kycCase, required this.onDone, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final status = kycCase?.status ?? KycStatus.underReview;
    final (color, icon, title, sub, retry) = switch (status) {
      KycStatus.approved => (BanzamiColors.success, Icons.verified_rounded, 'Identidade verificada',
          'A sua conta está totalmente activa.', false),
      KycStatus.rejected => (BanzamiColors.error, Icons.cancel_outlined, 'Verificação recusada',
          kycCase?.reasonCode != null ? 'Motivo: ${kycCase!.reasonCode}. Pode tentar novamente.' : 'Pode tentar novamente.', true),
      KycStatus.needsMoreInfo => (BanzamiColors.warning, Icons.info_outline, 'Precisamos de mais informação',
          kycCase?.reasonCode != null ? 'Motivo: ${kycCase!.reasonCode}. Reenvie os documentos.' : 'Reenvie os documentos pedidos.', true),
      _ => (BanzamiColors.warning, Icons.hourglass_top_rounded, 'Verificação enviada',
          'Estamos a rever a sua identidade. Avisamos quando estiver concluída.', false),
    };

    return _Scroll(children: [
      const SizedBox(height: BanzamiSpacing.xl),
      Center(
        child: Container(
          width: 96, height: 96,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.10), shape: BoxShape.circle),
          child: Icon(icon, color: color, size: 48),
        ),
      ),
      const SizedBox(height: BanzamiSpacing.lg),
      Text(title, textAlign: TextAlign.center, style: BanzamiTextStyles.headingMd),
      const SizedBox(height: BanzamiSpacing.sm),
      Text(sub, textAlign: TextAlign.center, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600)),
      const SizedBox(height: BanzamiSpacing.xl),
      if (retry) BanzamiPrimaryButton(label: 'Tentar novamente', onPressed: onRetry),
      if (retry) const SizedBox(height: BanzamiSpacing.sm),
      BanzamiSecondaryButton(label: 'Concluir', onPressed: onDone),
      const SizedBox(height: BanzamiSpacing.lg),
    ]);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Small shared widgets
// ───────────────────────────────────────────────────────────────────────────

String _labelFor(KycDocument d) {
  if (d.evidenceType == KycEvidenceType.selfie) return 'Selfie';
  return switch (d.side) {
    KycDocumentSide.front => 'Frente do documento',
    KycDocumentSide.back => 'Verso do documento',
    KycDocumentSide.mainPage => 'Página principal',
    KycDocumentSide.lastPage => 'Última página',
    _ => 'Documento',
  };
}

class _Scroll extends StatelessWidget {
  final List<Widget> children;
  const _Scroll({required this.children});
  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(BanzamiSpacing.lg, BanzamiSpacing.md, BanzamiSpacing.lg, BanzamiSpacing.lg),
        children: children,
      );
}

class _Card extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  const _Card({required this.child, this.onTap});
  @override
  Widget build(BuildContext context) {
    return Material(
      color: BanzamiColors.white,
      borderRadius: BorderRadius.circular(BanzamiRadius.xl),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(BanzamiRadius.xl),
        child: Container(
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BanzamiRadius.xl),
            border: Border.all(color: BanzamiColors.gray200),
          ),
          child: child,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String sub;
  const _InfoRow({required this.icon, required this.title, required this.sub});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BanzamiSpacing.md),
      child: Row(children: [
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(color: BanzamiColors.tint.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(BanzamiRadius.lg)),
          child: Icon(icon, color: BanzamiColors.primary, size: 22),
        ),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600)),
            Text(sub, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          ]),
        ),
      ]),
    );
  }
}

class _DocCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String sub;
  final VoidCallback onTap;
  const _DocCard({required this.icon, required this.title, required this.sub, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return _Card(
      onTap: onTap,
      child: Row(children: [
        Icon(icon, color: BanzamiColors.primary, size: 28),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: BanzamiTextStyles.bodyLg.copyWith(fontWeight: FontWeight.w700)),
            Text(sub, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          ]),
        ),
        const Icon(Icons.chevron_right_rounded, color: BanzamiColors.gray400),
      ]),
    );
  }
}

class _CaptureCard extends StatelessWidget {
  final String label;
  final Uint8List? captured;
  final bool alreadyUploaded;
  final VoidCallback onTap;
  const _CaptureCard({required this.label, required this.captured, required this.alreadyUploaded, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final done = captured != null || alreadyUploaded;
    return _Card(
      onTap: onTap,
      child: Row(children: [
        _Thumb(bytes: captured, done: alreadyUploaded),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600)),
            Text(
              done ? (alreadyUploaded ? 'Enviado' : 'Capturado — tocar para refazer') : 'Tocar para capturar',
              style: BanzamiTextStyles.bodySm.copyWith(color: done ? BanzamiColors.success : BanzamiColors.gray400),
            ),
          ]),
        ),
        Icon(done ? Icons.check_circle : Icons.camera_alt_outlined,
            color: done ? BanzamiColors.success : BanzamiColors.primary),
      ]),
    );
  }
}

class _Thumb extends StatelessWidget {
  final Uint8List? bytes;
  final bool done;
  const _Thumb({required this.bytes, required this.done});
  @override
  Widget build(BuildContext context) {
    final box = BorderRadius.circular(BanzamiRadius.md);
    if (bytes != null) {
      return ClipRRect(borderRadius: box, child: Image.memory(bytes!, width: 48, height: 48, fit: BoxFit.cover));
    }
    return Container(
      width: 48, height: 48,
      decoration: BoxDecoration(color: BanzamiColors.gray100, borderRadius: box),
      child: Icon(done ? Icons.check : Icons.image_outlined, color: BanzamiColors.gray400, size: 22),
    );
  }
}

class _ErrorText extends StatelessWidget {
  final String text;
  const _ErrorText(this.text);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(BanzamiSpacing.md),
        decoration: BoxDecoration(color: BanzamiColors.errorBg, borderRadius: BorderRadius.circular(BanzamiRadius.lg)),
        child: Row(children: [
          const Icon(Icons.error_outline, color: BanzamiColors.error, size: 18),
          const SizedBox(width: BanzamiSpacing.sm),
          Expanded(child: Text(text, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error))),
        ]),
      );
}
