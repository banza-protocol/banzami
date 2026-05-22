import 'dart:io';

import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/transfer.dart';
import 'money_format.dart';

// ── Brand palette ─────────────────────────────────────────────────────────────

const _kWine     = PdfColor.fromInt(0xFF990011);
const _kWineDark = PdfColor.fromInt(0xFF6B000B);
const _kGray900  = PdfColor.fromInt(0xFF111827);
const _kGray600  = PdfColor.fromInt(0xFF4B5563);
const _kGray400  = PdfColor.fromInt(0xFF9CA3AF);
const _kGray200  = PdfColor.fromInt(0xFFE5E7EB);
const _kGray100  = PdfColor.fromInt(0xFFF3F4F6);
const _kOffWhite = PdfColor.fromInt(0xFFFAFAFA);
const _kWhite    = PdfColors.white;
const _kAmberDk  = PdfColor.fromInt(0xFF92400E);
const _kAmberBg  = PdfColor.fromInt(0xFFFEF3C7);
const _kAmberBd  = PdfColor.fromInt(0xFFF6C453);

// ── Public API ────────────────────────────────────────────────────────────────

class BanzaPdfReceiptGenerator {
  static Future<File> generate({
    required Transfer transfer,
    required String   ownHandle,
    String?           logoAssetPath,
    bool              isSandbox = false,
  }) async {
    // Load Inter TTF fonts — fixes all Portuguese accent + special-char issues.
    // Helvetica (PDF default) is Latin-1 only and mangles ✓ / — / ã / etc.
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
    final dateStr = DateFormat("d 'de' MMMM 'de' y, HH:mm", 'pt')
        .format(transfer.completedAt ?? transfer.createdAt);

    pw.MemoryImage? logoImage;
    if (logoAssetPath != null) {
      try {
        final data = await rootBundle.load(logoAssetPath);
        logoImage  = pw.MemoryImage(data.buffer.asUint8List());
      } catch (_) {}
    }

    final doc = pw.Document(
      author:  'Banza',
      title:   'Comprovativo Banza · Ref $ref8',
      creator: 'Banza — banzami.org',
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
    return pw.Container(
      color:   _kWhite,
      padding: const pw.EdgeInsets.symmetric(horizontal: 52, vertical: 56),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          _buildHeader(logoImage: logoImage, isSandbox: isSandbox, reg: reg, bold: bold),
          pw.SizedBox(height: 40),
          _buildHero(amount: amount, recipient: transfer.recipient, reg: reg, bold: bold),
          pw.SizedBox(height: 36),
          _buildDetailsCard(
            ownHandle: ownHandle,
            recipient: transfer.recipient,
            note:      transfer.note,
            dateStr:   dateStr,
            ref8:      ref8,
            reg:       reg,
            bold:      bold,
          ),
          pw.Spacer(),
          if (isSandbox) ...[
            _buildSandboxDisclaimer(reg: reg, bold: bold),
            pw.SizedBox(height: 16),
          ],
          _buildFooter(ref8: ref8, reg: reg, bold: bold),
        ],
      ),
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
          pw.Center(child: pw.Image(logoImage, height: 76, fit: pw.BoxFit.contain))
        else
          pw.Center(
            child: pw.Text(
              isSandbox ? 'BANZA SANDBOX' : 'BANZA',
              style: bold.copyWith(color: _kWine, fontSize: 28),
            ),
          ),
        pw.SizedBox(height: 14),
        pw.Center(child: _buildEnvBadge(isSandbox, reg: reg, bold: bold)),
        pw.SizedBox(height: 32),
        pw.Divider(color: _kGray200, thickness: 0.5),
      ],
    );
  }

  static pw.Widget _buildEnvBadge(
    bool isSandbox, {
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    if (isSandbox) {
      return pw.Container(
        padding: const pw.EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: pw.BoxDecoration(
          color:        _kAmberBg,
          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(20)),
          border:       pw.Border.all(color: _kAmberBd, width: 1),
        ),
        child: pw.Text(
          'SANDBOX  •  Ambiente de teste',
          style: bold.copyWith(color: _kAmberDk, fontSize: 9, letterSpacing: 0.4),
        ),
      );
    }
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: pw.BoxDecoration(
        color:        _kGray100,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(20)),
        border:       pw.Border.all(color: _kGray200, width: 1),
      ),
      child: pw.Text(
        'Banza  •  Comprovativo verificado',
        style: bold.copyWith(color: _kGray600, fontSize: 9, letterSpacing: 0.3),
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
        pw.SizedBox(height: 20),
        pw.Center(
          child: pw.Text(
            'Transferência concluída',
            style: reg.copyWith(color: _kGray400, fontSize: 12),
          ),
        ),
        pw.SizedBox(height: 10),
        pw.Center(
          child: pw.Text(
            amount,
            style: bold.copyWith(color: _kGray900, fontSize: 48),
          ),
        ),
        pw.SizedBox(height: 6),
        pw.Center(
          child: pw.Text(
            'para @$recipient',
            style: reg.copyWith(color: _kGray600, fontSize: 13),
          ),
        ),
      ],
    );
  }

  // Geometric checkmark — avoids all font encoding issues.
  // Wine gradient circle + white V-stroke drawn via PDF canvas.
  static pw.Widget _buildCheckIcon() {
    return pw.Container(
      width:  60,
      height: 60,
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
          size: const PdfPoint(26, 20),
          painter: (canvas, size) {
            // PDF Y-axis: 0 = bottom, size.y = top.
            // Check shape: left-tip → valley (bottom) → right-tip (top-right).
            canvas
              ..setStrokeColor(PdfColors.white)
              ..setLineWidth(2.8)
              ..setLineCap(PdfLineCap.round)
              ..setLineJoin(PdfLineJoin.round)
              ..moveTo(1,            size.y * 0.50)
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
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(16)),
        border:       pw.Border.all(color: _kGray200, width: 0.75),
      ),
      padding: const pw.EdgeInsets.symmetric(horizontal: 28, vertical: 6),
      child: pw.Column(
        children: [
          _detailRow('De',     '@$ownHandle',   reg: reg, bold: bold),
          _divider(),
          _detailRow('Para',   '@$recipient',   reg: reg, bold: bold),
          if (note != null && note.isNotEmpty) ...[
            _divider(),
            _detailRow('Nota', note,            reg: reg, bold: bold),
          ],
          _divider(),
          _detailRow('Data',   dateStr,         reg: reg, bold: bold),
          _divider(),
          _detailRow('Ref',    ref8,            reg: reg, bold: bold),
          _divider(),
          _detailRow('Método', 'Saldo Banza', reg: reg, bold: bold),
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
      padding: const pw.EdgeInsets.symmetric(vertical: 11),
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
      padding: const pw.EdgeInsets.all(14),
      decoration: pw.BoxDecoration(
        color:        _kAmberBg,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(12)),
        border:       pw.Border.all(color: _kAmberBd, width: 0.75),
      ),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Padding(
            padding: const pw.EdgeInsets.only(top: 1.5, right: 8),
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
    required pw.TextStyle reg,
    required pw.TextStyle bold,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        pw.Divider(color: _kGray200, thickness: 0.5),
        pw.SizedBox(height: 16),
        pw.Center(
          child: pw.Text(
            'Comprovativo Banza',
            style: bold.copyWith(color: _kGray900, fontSize: 10),
          ),
        ),
        pw.SizedBox(height: 4),
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
      ],
    );
  }
}
