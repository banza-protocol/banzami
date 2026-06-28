import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Max KYB document size accepted by the app (matches the operator default).
const int kKybMaxBytes = 5 * 1024 * 1024;

/// Allowed upload MIME by file extension (backend allowlist: PDF/JPEG/PNG).
String? kybMimeFor(String filename) {
  final ext = filename.toLowerCase().split('.').last;
  return switch (ext) {
    'pdf' => 'application/pdf',
    'png' => 'image/png',
    'jpg' || 'jpeg' => 'image/jpeg',
    _ => null,
  };
}

/// Validation error for a picked file, or null when acceptable.
String? kybPickError(String filename, int sizeBytes) {
  if (kybMimeFor(filename) == null) {
    return 'Tipo de ficheiro inválido. Use PDF, JPG ou PNG.';
  }
  if (sizeBytes <= 0) return 'O ficheiro está vazio.';
  if (sizeBytes > kKybMaxBytes) return 'Ficheiro demasiado grande (máx. 5 MB).';
  return null;
}

/// Business verification (KYB) — real status + real document maintenance.
///
/// The app does NOT repeat the website application form. A merchant applies at
/// `/comerciantes/candidatura`; the Banzami team approves and issues credentials.
/// Here the merchant sees the real verification state and updates documents:
/// pick image → signed PUT to R2 → confirm → PENDING_REVIEW. Never re-submits the
/// business, handle, representative, volume, category or location. Never fakes an
/// upload; signed URLs / storage keys / PII are never logged.
class KybScreen extends StatefulWidget {
  const KybScreen({super.key});

  @override
  State<KybScreen> createState() => _KybScreenState();
}

enum _PickKind { camera, gallery, pdf }

const _titles = {
  MerchantKybDocumentType.commercialRegistration: 'Registo Comercial',
  MerchantKybDocumentType.companyTaxId: 'NIF da empresa',
  MerchantKybDocumentType.representativeId: 'Documento do representante',
};
const _icons = {
  MerchantKybDocumentType.commercialRegistration: Icons.business_outlined,
  MerchantKybDocumentType.companyTaxId: Icons.numbers_outlined,
  MerchantKybDocumentType.representativeId: Icons.badge_outlined,
};

class _KybScreenState extends State<KybScreen> {
  final _picker = ImagePicker();
  bool _loading = true;
  String? _loadError;
  MerchantKybStatus? _status;
  MerchantKybDocumentType? _busyType; // document currently uploading
  final Map<MerchantKybDocumentType, String> _selectedName = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _loadError = null; });
    final client = context.read<BanzamiClient>();
    try {
      final st = await client.getMerchantKybStatus();
      if (mounted) setState(() => _status = st);
    } catch (_) {
      if (mounted) setState(() => _loadError = 'Não foi possível carregar a verificação.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _updateDocument(MerchantKybDocumentType type) async {
    final kind = await showModalBottomSheet<_PickKind>(
      context: context,
      backgroundColor: BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(BanzamiRadius.xxl)),
      ),
      builder: (_) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: BanzamiSpacing.sm),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined, color: BanzamiColors.primary),
            title: const Text('Tirar foto'),
            onTap: () => Navigator.of(context).pop(_PickKind.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined, color: BanzamiColors.primary),
            title: const Text('Escolher da galeria'),
            onTap: () => Navigator.of(context).pop(_PickKind.gallery),
          ),
          ListTile(
            leading: const Icon(Icons.picture_as_pdf_outlined, color: BanzamiColors.primary),
            title: const Text('Escolher PDF'),
            onTap: () => Navigator.of(context).pop(_PickKind.pdf),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
        ]),
      ),
    );
    if (kind == null) return;
    await _pickAndUpload(type, kind);
  }

  /// Picks an image (camera/gallery) or a PDF (file), validates it, then uploads
  /// via the signed PUT. Local paths / signed URLs / storage keys / PII are never
  /// logged.
  Future<void> _pickAndUpload(MerchantKybDocumentType type, _PickKind kind) async {
    final client = context.read<BanzamiClient>();

    Uint8List? bytes;
    String filename;
    try {
      if (kind == _PickKind.pdf) {
        final res = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png'],
          withData: true,
        );
        if (res == null || res.files.isEmpty) return;
        final f = res.files.first;
        bytes = f.bytes;
        filename = f.name;
      } else {
        final x = await _picker.pickImage(
          source: kind == _PickKind.camera ? ImageSource.camera : ImageSource.gallery,
          imageQuality: 85,
          maxWidth: 2400,
        );
        if (x == null) return;
        bytes = await x.readAsBytes();
        filename = x.name;
      }
    } catch (_) {
      if (mounted) _snack('Não foi possível abrir o seletor.');
      return;
    }
    if (bytes == null) {
      if (mounted) _snack('Não foi possível ler o ficheiro.');
      return;
    }

    // Resolve a usable mime; images without a clear extension default to JPEG.
    String mime;
    final guessed = kybMimeFor(filename);
    if (guessed != null) {
      mime = guessed;
    } else if (kind != _PickKind.pdf) {
      filename = 'documento.jpg';
      mime = 'image/jpeg';
    } else {
      if (mounted) _snack('Tipo de ficheiro inválido. Use PDF, JPG ou PNG.');
      return;
    }
    final err = kybPickError(filename, bytes.length);
    if (err != null) {
      if (mounted) _snack(err);
      return;
    }

    setState(() { _busyType = type; _selectedName[type] = filename; });
    try {
      final up = await client.requestMerchantKybDocumentUploadUrl(type, contentType: mime);
      final put = await http.put(Uri.parse(up.url), headers: {'Content-Type': mime, ...up.headers}, body: bytes);
      if (put.statusCode < 200 || put.statusCode >= 300) {
        throw Exception('upload failed');
      }
      await client.completeMerchantKybDocumentUpload(up.documentId);
      if (!mounted) { return; }
      _snack('Documento enviado. Em análise.');
      await _load();
    } on BanzamiApiException catch (e) {
      if (mounted) {
        _snack(e.code == 'STORAGE_NOT_CONFIGURED'
            ? 'Serviço temporariamente indisponível. Tente mais tarde.'
            : 'Não foi possível enviar: ${e.message}');
      }
    } catch (_) {
      if (mounted) { _snack('O envio falhou. Verifique a ligação e tente novamente.'); }
    } finally {
      if (mounted) setState(() { _busyType = null; _selectedName.remove(type); });
    }
  }

  void _snack(String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

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
                  Text('Acompanhe o estado da verificação e atualize documentos quando necessário.',
                      style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600)),
                  const SizedBox(height: BanzamiSpacing.lg),

                  _StatusCard(view: _overall()),
                  const SizedBox(height: BanzamiSpacing.lg),

                  const Text('Documentos da empresa', style: BanzamiTextStyles.headingSm),
                  const SizedBox(height: BanzamiSpacing.sm),
                  for (final d in _orderedDocuments()) ...[
                    _DocCard(
                      type: d.type!,
                      doc: d,
                      busy: _busyType == d.type,
                      selectedName: _selectedName[d.type],
                      onUpdate: () => _updateDocument(d.type!),
                    ),
                    const SizedBox(height: BanzamiSpacing.md),
                  ],

                  const SizedBox(height: BanzamiSpacing.sm),
                  const Text('Ações necessárias', style: BanzamiTextStyles.headingSm),
                  const SizedBox(height: BanzamiSpacing.sm),
                  _ActionsCard(view: _overall()),
                  if (_loadError != null) ...[
                    const SizedBox(height: BanzamiSpacing.md),
                    Text(_loadError!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
                  ],
                  const SizedBox(height: BanzamiSpacing.xl),
                ],
              ),
            ),
    );
  }

  /// The 3 slots in canonical order (filling any missing from the API defensively).
  List<MerchantKybDocument> _orderedDocuments() {
    final byType = {for (final d in _status?.documents ?? const []) d.type: d};
    return [
      for (final t in MerchantKybDocumentType.values)
        byType[t] ??
            MerchantKybDocument(
              id: '', type: t, status: MerchantKybDocumentStatus.missing,
              mimeType: '', sizeBytes: 0, submittedAt: null, reviewedAt: null,
              validUntil: null, rejectionReason: null,
            ),
    ];
  }

  _OverallView _overall() {
    final st = _status;
    final docs = _orderedDocuments();
    final anyMissing = docs.any((d) => d.status == MerchantKybDocumentStatus.missing);
    final anyExpired = docs.any((d) => d.status == MerchantKybDocumentStatus.expired);
    switch (st?.kybStatus) {
      case 'APPROVED':
        if (anyExpired) {
          return const _OverallView('Documentos expirados', 'Atualize os documentos expirados.',
              BanzamiColors.warning, Icons.event_busy_outlined);
        }
        return const _OverallView('Aprovado', 'O seu negócio está verificado.',
            BanzamiColors.success, Icons.verified_rounded);
      case 'REJECTED':
        return const _OverallView('Rejeitado', 'A verificação foi recusada. Reenvie os documentos.',
            BanzamiColors.error, Icons.cancel_outlined);
      case 'SUSPENDED':
        return const _OverallView('Suspenso', 'A conta está suspensa. Contacte o suporte.',
            BanzamiColors.error, Icons.pause_circle_outline);
      default:
        if (anyMissing) {
          return const _OverallView('Documentos necessários', 'Envie os documentos em falta para concluir a verificação.',
              BanzamiColors.warning, Icons.upload_file_outlined);
        }
        return const _OverallView('Em análise', 'A equipa Banzami está a rever os seus documentos.',
            BanzamiColors.warning, Icons.hourglass_top_rounded);
    }
  }
}

// ── View helpers ─────────────────────────────────────────────────────────────

class _OverallView {
  final String label;
  final String detail;
  final Color color;
  final IconData icon;
  const _OverallView(this.label, this.detail, this.color, this.icon);
}

({String label, Color color}) _docBadge(MerchantKybDocumentStatus s) => switch (s) {
      MerchantKybDocumentStatus.valid => (label: 'Válido', color: BanzamiColors.success),
      MerchantKybDocumentStatus.pendingReview ||
      MerchantKybDocumentStatus.pendingUpload => (label: 'Em análise', color: BanzamiColors.warning),
      MerchantKybDocumentStatus.rejected => (label: 'Rejeitado', color: BanzamiColors.error),
      MerchantKybDocumentStatus.expired => (label: 'Expirado', color: BanzamiColors.error),
      _ => (label: 'Em falta', color: BanzamiColors.gray400),
    };

String _fmtDate(DateTime? d) =>
    d == null ? '' : '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

// ── Cards ────────────────────────────────────────────────────────────────────

class _StatusCard extends StatelessWidget {
  final _OverallView view;
  const _StatusCard({required this.view});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: BoxDecoration(
        color: view.color.withValues(alpha: 0.10),
        borderRadius: BanzamiRadius.xlAll,
        border: Border.all(color: view.color.withValues(alpha: 0.25)),
      ),
      child: Row(children: [
        Container(
          width: 48, height: 48,
          decoration: BoxDecoration(color: view.color.withValues(alpha: 0.15), shape: BoxShape.circle),
          child: Icon(view.icon, color: view.color),
        ),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(view.label, style: BanzamiTextStyles.headingSm.copyWith(color: view.color)),
            const SizedBox(height: 2),
            Text(view.detail, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray600)),
          ]),
        ),
      ]),
    );
  }
}

class _DocCard extends StatelessWidget {
  final MerchantKybDocumentType type;
  final MerchantKybDocument doc;
  final bool busy;
  final String? selectedName;
  final VoidCallback onUpdate;
  const _DocCard({required this.type, required this.doc, required this.busy, required this.selectedName, required this.onUpdate});

  @override
  Widget build(BuildContext context) {
    final badge = _docBadge(doc.status);
    final meta = <String>[];
    if (doc.submittedAt != null) meta.add('Enviado: ${_fmtDate(doc.submittedAt)}');
    if (doc.validUntil != null) meta.add('Validade: ${_fmtDate(doc.validUntil)}');

    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        border: Border.all(color: BanzamiColors.gray200),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(_icons[type], color: BanzamiColors.primary, size: 22),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(child: Text(_titles[type]!, style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.sm, vertical: 4),
            decoration: BoxDecoration(color: badge.color.withValues(alpha: 0.12), borderRadius: BanzamiRadius.fullAll),
            child: Text(badge.label, style: BanzamiTextStyles.bodySm.copyWith(color: badge.color, fontWeight: FontWeight.w600)),
          ),
        ]),
        if (meta.isNotEmpty) ...[
          const SizedBox(height: BanzamiSpacing.sm),
          Text(meta.join('  ·  '), style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
        ],
        if (doc.rejectionReason != null) ...[
          const SizedBox(height: BanzamiSpacing.sm),
          Container(
            padding: const EdgeInsets.all(BanzamiSpacing.sm),
            decoration: const BoxDecoration(color: BanzamiColors.errorBg, borderRadius: BanzamiRadius.lgAll),
            child: Text('Motivo: ${doc.rejectionReason}',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
          ),
        ],
        if (busy && selectedName != null) ...[
          const SizedBox(height: BanzamiSpacing.sm),
          Row(children: [
            const Icon(Icons.attach_file, size: 16, color: BanzamiColors.gray600),
            const SizedBox(width: BanzamiSpacing.xs),
            Expanded(
              child: Text('Documento selecionado: ${selectedName!}',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray600)),
            ),
          ]),
        ],
        const SizedBox(height: BanzamiSpacing.md),
        SizedBox(
          width: double.infinity,
          child: BanzamiSecondaryButton(
            label: busy ? 'A enviar…' : 'Atualizar documento',
            onPressed: busy ? null : onUpdate,
          ),
        ),
      ]),
    );
  }
}

class _ActionsCard extends StatelessWidget {
  final _OverallView view;
  const _ActionsCard({required this.view});
  @override
  Widget build(BuildContext context) {
    final ok = view.label == 'Aprovado';
    final msg = switch (view.label) {
      'Aprovado' => 'Tudo em ordem. Nenhuma ação necessária.',
      'Rejeitado' => 'Reenvie os documentos pedidos ou contacte o suporte.',
      'Suspenso' => 'Contacte o suporte para reativar a conta.',
      'Documentos necessários' => 'Envie os documentos em falta usando "Atualizar documento".',
      'Documentos expirados' => 'Atualize os documentos expirados para manter a conta válida.',
      _ => 'Os seus documentos estão em análise. Avisamos quando concluído.',
    };
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
        Expanded(child: Text(msg, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray600))),
      ]),
    );
  }
}
