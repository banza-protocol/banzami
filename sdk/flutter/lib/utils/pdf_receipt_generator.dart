import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/transfer.dart';
import 'date_formatter.dart';
import 'money_format.dart';

// ── Brand palette ─────────────────────────────────────────────────────────────

const _kWine     = PdfColor.fromInt(0xFFB5101F);
const _kWineDark = PdfColor.fromInt(0xFF6B000B);
const _kGray900  = PdfColor.fromInt(0xFF111827);
const _kGray600  = PdfColor.fromInt(0xFF4B5563);
const _kGray400  = PdfColor.fromInt(0xFF9CA3AF);
const _kGray200  = PdfColor.fromInt(0xFFE5E7EB);
const _kGray100  = PdfColor.fromInt(0xFFF3F4F6);
const _kOffWhite = PdfColor.fromInt(0xFFFAFAFA);
const _kAmberDk  = PdfColor.fromInt(0xFF92400E);
const _kAmberBg  = PdfColor.fromInt(0xFFFEF3C7);
const _kAmberBd  = PdfColor.fromInt(0xFFF6C453);

// ── Public API ────────────────────────────────────────────────────────────────

class BanzamiPdfReceiptGenerator {
  static Future<File> generate({
    required Transfer transfer,
    required String   ownHandle,
    String?           logoAssetPath,
    bool              isSandbox = false,
  }) async {
    final regData  = await rootBundle.load(
        'packages/banza_flutter/assets/fonts/Inter-Regular.ttf');
    final boldData = await rootBundle.load(
        'packages/banza_flutter/assets/fonts/Inter-Bold.ttf');
    final fontReg  = pw.Font.ttf(regData);
    final fontBold = pw.Font.ttf(boldData);

    final reg  = pw.TextStyle(font: fontReg,  fontWeight: pw.FontWeight.normal);
    final bold = pw.TextStyle(font: fontBold, fontWeight: pw.FontWeight.bold);

    final ref8    = transfer.transferId.replaceAll('-', '').substring(0, 8).toUpperCase();
    final amount  = formatMinor(transfer.amountMinor, transfer.currency);
    final dateStr = BanzamiDateFormatter.formatReceiptDate(
        transfer.completedAt ?? transfer.createdAt);

    pw.MemoryImage? logoImage;
    if (logoAssetPath != null) {
      try {
        final data = await rootBundle.load(logoAssetPath);
        logoImage  = pw.MemoryImage(data.buffer.asUint8List());
      } catch (_) {}
    }

    final doc = pw.Document(
      author:  'Banzami',
      title:   'Comprovativo Banzami · Ref $ref8',
      creator: 'Banzami — banzami.org',
      theme:   pw.ThemeData.withFont(base: fontReg, bold: fontBold),
    );

    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin:     pw.EdgeInsets.zero,
      build: (ctx) => _buildPage(
        ctx,
        transfer:  transfer,
        ownHandle: ownHandle,
        ref8:      ref8,
        amount:    amount,
        dateStr:   dateStr,
        logoImage: logoImage,
        isSandbox: isSandbox,
        reg:       reg,
        bold:      bold,
      ),
    ));

    final bytes = await doc.save();
    final dir   = await getTemporaryDirectory();
    final file  = File('${dir.path}/banza-receipt-$ref8.pdf');
    await file.writeAsBytes(bytes);
    return file;
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  //
  // pw.Stack fills the tight A4 constraints from the pw.Page build context.
  // pw.Positioned pins the footer to the page bottom independently of the
  // main Column height — it cannot be clipped by Column overflow.
  // Avoid pw.Spacer(): pw.BoxConstraints.expand() in the pdf package sets
  // min/max to infinity (unlike Flutter), which breaks Spacer layout.

  static pw.Widget _buildPage(
    pw.Context ctx, {
    required Transfer        transfer,
    required String          ownHandle,
    required String          ref8,
    required String          amount,
    required String          dateStr,
    required pw.MemoryImage? logoImage,
    required bool            isSandbox,
    required pw.TextStyle    reg,
    required pw.TextStyle    bold,
  }) {
    return pw.Stack(
      children: [
        // Main content — bottom padding reserves space so content never
        // overlaps the footer (footer height ≈ 70pt + 40pt margin = 110pt).
        pw.Padding(
          padding: const pw.EdgeInsets.fromLTRB(48, 40, 48, 110),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              _buildHeader(logoImage: logoImage, isSandbox: isSandbox, reg: reg, bold: bold),
              pw.SizedBox(height: 32),
              _buildHero(amount: amount, recipient: transfer.recipient, reg: reg, bold: bold),
              pw.SizedBox(height: 32),
              _buildDetailsCard(
                ownHandle: ownHandle,
                recipient: transfer.recipient,
                note:      transfer.note,
                dateStr:   dateStr,
                ref8:      ref8,
                reg:       reg,
                bold:      bold,
              ),
              if (isSandbox) ...[
                pw.SizedBox(height: 32),
                _buildSandboxDisclaimer(reg: reg, bold: bold),
              ],
            ],
          ),
        ),
        // Footer — always anchored to the page bottom, never clipped.
        pw.Positioned(
          bottom: 40,
          left:   48,
          right:  48,
          child: _buildFooter(ref8: ref8, isSandbox: isSandbox, reg: reg, bold: bold),
        ),
      ],
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────

  static pw.Widget _buildHeader({
    required pw.MemoryImage? logoImage,
    required bool            isSandbox,
    required pw.TextStyle    reg,
    required pw.TextStyle    bold,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        if (logoImage != null)
          pw.Center(
            child: pw.ClipRRect(
              horizontalRadius: 60 * 0.22,
              verticalRadius:   60 * 0.22,
              child: pw.Image(logoImage, width: 60, height: 60, fit: pw.BoxFit.cover),
            ),
          ),
        pw.SizedBox(height: 10),
        pw.Center(
          child: pw.Text(
            'Banzami',
            style: bold.copyWith(color: _kGray900, fontSize: 18),
          ),
        ),
        pw.SizedBox(height: 3),
        pw.Center(
          child: pw.Text(
            'Comprovativo de pagamento',
            style: reg.copyWith(color: _kGray400, fontSize: 9),
          ),
        ),
        pw.SizedBox(height: 10),
        pw.Center(child: _buildEnvBadge(isSandbox, reg: reg, bold: bold)),
        pw.SizedBox(height: 22),
        pw.Divider(color: _kGray200, thickness: 0.5),
      ],
    );
  }

  static pw.Widget _buildEnvBadge(
    bool isSandbox, {
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    const hPad  = 14.0;
    const vPad  = 7.0;
    const bdW   = 1.2;
    // Bézier circle approximation constant (4-point cubic).
    const kappa = 0.5523;

    final text  = isSandbox ? 'SANDBOX  •  Ambiente de teste' : 'Banzami  •  Comprovativo verificado';
    final fg    = isSandbox ? _kAmberDk : _kGray600;
    final bg    = isSandbox ? _kAmberBg : _kGray100;
    final bd    = isSandbox ? _kAmberBd : _kGray200;
    final style = bold.copyWith(color: fg, fontSize: 8, letterSpacing: isSandbox ? 0.4 : 0.3);

    // pw.BoxDecoration borderRadius ≥ height/2 causes edge artefacts in the
    // pdf package (clipping path mismatch at the pill extremities).
    // Fix: draw the pill with explicit Bézier arcs via pw.CustomPaint.
    // PDF y-axis: 0 = bottom, size.y = top.
    return pw.CustomPaint(
      painter: (canvas, size) {
        final w = size.x;
        final h = size.y;
        final r = h / 2; // pill radius = exact half-height

        // Traces a closed pill path inset by [inset] from all edges.
        void pill(double inset) {
          final ri = r - inset;           // effective arc radius
          final lx = inset + ri;          // left arc centre x
          final rx = w - inset - ri;      // right arc centre x
          final top    = h - inset;
          final bottom = inset;
          final mid    = h / 2;
          canvas
            ..moveTo(lx, top)
            ..lineTo(rx, top)
            // top-right quadrant arc
            ..curveTo(rx + ri * kappa, top, w - inset, mid + ri * kappa, w - inset, mid)
            // bottom-right quadrant arc
            ..curveTo(w - inset, mid - ri * kappa, rx + ri * kappa, bottom, rx, bottom)
            ..lineTo(lx, bottom)
            // bottom-left quadrant arc
            ..curveTo(lx - ri * kappa, bottom, inset, mid - ri * kappa, inset, mid)
            // top-left quadrant arc (closes back to moveTo point)
            ..curveTo(inset, mid + ri * kappa, lx - ri * kappa, top, lx, top);
        }

        canvas.setFillColor(bg);
        pill(bdW / 2);
        canvas.fillPath();

        canvas.setStrokeColor(bd);
        canvas.setLineWidth(bdW);
        pill(bdW / 2);
        canvas.strokePath();
      },
      child: pw.Padding(
        padding: const pw.EdgeInsets.symmetric(horizontal: hPad, vertical: vPad),
        child: pw.Text(text, style: style),
      ),
    );
  }

  // ── Hero ──────────────────────────────────────────────────────────────────

  static pw.Widget _buildHero({
    required String       amount,
    required String       recipient,
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        pw.Center(child: _buildCheckIcon()),
        pw.SizedBox(height: 16),
        pw.Center(
          child: pw.Text(
            'Transferência concluída',
            style: reg.copyWith(color: _kGray400, fontSize: 11),
          ),
        ),
        pw.SizedBox(height: 8),
        pw.Center(
          child: pw.Text(
            amount,
            style: bold.copyWith(color: _kGray900, fontSize: 42),
          ),
        ),
        pw.SizedBox(height: 5),
        pw.Center(
          child: pw.Text(
            'para @$recipient',
            style: reg.copyWith(color: _kGray600, fontSize: 12),
          ),
        ),
      ],
    );
  }

  // Geometric checkmark — no font glyph dependency, always renders correctly.
  static pw.Widget _buildCheckIcon() {
    return pw.Container(
      width:  54,
      height: 54,
      decoration: const pw.BoxDecoration(
        gradient: pw.LinearGradient(
          colors: [_kWine, _kWineDark],
          begin:  pw.Alignment.topLeft,
          end:    pw.Alignment.bottomRight,
        ),
        shape: pw.BoxShape.circle,
      ),
      child: pw.Center(
        child: pw.CustomPaint(
          size: const PdfPoint(24, 19),
          painter: (canvas, size) {
            // PDF Y-axis: 0 = bottom, size.y = top.
            // left-tip → valley (near bottom) → right-tip (near top).
            canvas
              ..setStrokeColor(PdfColors.white)
              ..setLineWidth(2.6)
              ..setLineCap(PdfLineCap.round)
              ..setLineJoin(PdfLineJoin.round)
              ..moveTo(1,             size.y * 0.50)
              ..lineTo(size.x * 0.30, size.y * 0.05)
              ..lineTo(size.x - 1,   size.y - 2)
              ..strokePath();
          },
        ),
      ),
    );
  }

  // ── Details card ──────────────────────────────────────────────────────────

  static pw.Widget _buildDetailsCard({
    required String       ownHandle,
    required String       recipient,
    required String?      note,
    required String       dateStr,
    required String       ref8,
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    return pw.Container(
      decoration: pw.BoxDecoration(
        color:        _kOffWhite,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(14)),
        border:       pw.Border.all(color: _kGray200, width: 0.75),
      ),
      padding: const pw.EdgeInsets.symmetric(horizontal: 24, vertical: 4),
      child: pw.Column(
        children: [
          _detailRow('De',     '@$ownHandle',   reg: reg, bold: bold),
          _divider(),
          _detailRow('Para',   '@$recipient',                               reg: reg, bold: bold),
          _divider(),
          _detailRow('Nota',  (note != null && note.isNotEmpty) ? note : 'Sem descrição',
                                                                             reg: reg, bold: bold),
          _divider(),
          _detailRow('Data',   dateStr,         reg: reg, bold: bold),
          _divider(),
          _detailRow('Ref',    ref8,            reg: reg, bold: bold),
          _divider(),
          _detailRow('Método', 'Saldo Banzami',   reg: reg, bold: bold),
        ],
      ),
    );
  }

  static pw.Widget _detailRow(
    String label,
    String value, {
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 9),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(label, style: reg.copyWith(color: _kGray400, fontSize: 10)),
          pw.Text(value, style: bold.copyWith(color: _kGray900, fontSize: 10)),
        ],
      ),
    );
  }

  static pw.Widget _divider() =>
      pw.Divider(color: _kGray200, thickness: 0.5, height: 0);

  // ── Sandbox disclaimer ────────────────────────────────────────────────────

  static pw.Widget _buildSandboxDisclaimer({
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(13),
      decoration: pw.BoxDecoration(
        color:        _kAmberBg,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(12)),
        border:       pw.Border.all(color: _kAmberBd, width: 0.75),
      ),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Padding(
            padding: const pw.EdgeInsets.only(top: 2, right: 8),
            child: pw.Container(
              width:  6,
              height: 6,
              decoration: const pw.BoxDecoration(
                color: _kAmberDk,
                shape: pw.BoxShape.circle,
              ),
            ),
          ),
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Ambiente de teste',
                  style: bold.copyWith(color: _kAmberDk, fontSize: 10),
                ),
                pw.SizedBox(height: 3),
                pw.Text(
                  'Este comprovativo foi gerado em ambiente sandbox\ne não possui valor financeiro real.',
                  style: reg.copyWith(color: _kAmberDk, fontSize: 9),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  static pw.Widget _buildFooter({
    required String       ref8,
    required bool         isSandbox,
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        pw.Divider(color: _kGray200, thickness: 0.5),
        pw.SizedBox(height: 14),
        pw.Center(
          child: pw.Text(
            'Comprovativo Banzami',
            style: bold.copyWith(color: _kGray900, fontSize: 9),
          ),
        ),
        pw.SizedBox(height: 3),
        pw.Center(
          child: pw.Text(
            'Verificável quando partilhado',
            style: reg.copyWith(color: _kGray400, fontSize: 8),
          ),
        ),
        pw.SizedBox(height: 2),
        pw.Center(
          child: pw.Text(
            'Ref $ref8  •  banzami.org',
            style: reg.copyWith(color: _kGray400, fontSize: 8),
          ),
        ),
        if (isSandbox) ...[
          pw.SizedBox(height: 3),
          pw.Center(
            child: pw.Text(
              'Documento de teste  •  sem valor financeiro real',
              style: reg.copyWith(color: _kAmberDk, fontSize: 8),
            ),
          ),
        ],
      ],
    );
  }
}
