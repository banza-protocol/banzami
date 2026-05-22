import 'dart:io';

import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/transfer.dart';
import 'money_format.dart';

// ── Brand colours ──────────────────────────────────────────────────────────

const _kCherry      = PdfColor.fromInt(0xFFC21A2C);
const _kMidWine     = PdfColor.fromInt(0xFF7A000D);
const _kDeepShadow  = PdfColor.fromInt(0xFF5E000A);
const _kPageBg      = PdfColor.fromInt(0xFF3D0008);
const _kCard        = PdfColor.fromInt(0x1AFFFFFF); // white 10 %
const _kCardBorder  = PdfColor.fromInt(0x26FFFFFF); // white 15 %
const _kWhite       = PdfColors.white;
const _kWhite70     = PdfColor.fromInt(0xB3FFFFFF);
const _kWhite45     = PdfColor.fromInt(0x73FFFFFF);

// ── Public API ─────────────────────────────────────────────────────────────

class BanzaPdfReceiptGenerator {
  /// Builds a premium Banza receipt PDF and returns the temp [File].
  ///
  /// File is named  `banza-receipt-<REF8>.pdf`  in the OS temp directory.
  static Future<File> generate({
    required Transfer transfer,
    required String ownHandle,
  }) async {
    final ref8  = transfer.transferId
        .replaceAll('-', '')
        .substring(0, 8)
        .toUpperCase();
    final amount = formatMinor(transfer.amountMinor, transfer.currency);
    final dateStr = DateFormat("d 'de' MMMM 'de' y, HH:mm", 'pt')
        .format(transfer.completedAt ?? transfer.createdAt);

    final doc = pw.Document(
      author:   'Banza',
      title:    'Comprovativo Banza · Ref $ref8',
      creator:  'Banza — banzami.org',
    );

    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin:     pw.EdgeInsets.zero,
      build:      (ctx) => _buildPage(
        ctx,
        transfer:  transfer,
        ownHandle: ownHandle,
        ref8:      ref8,
        amount:    amount,
        dateStr:   dateStr,
      ),
    ));

    final bytes = await doc.save();
    final dir   = await getTemporaryDirectory();
    final file  = File('${dir.path}/banza-receipt-$ref8.pdf');
    await file.writeAsBytes(bytes);
    return file;
  }

  // ── Page layout ───────────────────────────────────────────────────────────

  static pw.Widget _buildPage(
    pw.Context ctx, {
    required Transfer transfer,
    required String   ownHandle,
    required String   ref8,
    required String   amount,
    required String   dateStr,
  }) {
    return pw.Stack(
      children: [
        // Background gradient fill
        pw.Positioned.fill(
          child: pw.Container(
            decoration: const pw.BoxDecoration(
              gradient: pw.LinearGradient(
                begin:  pw.Alignment.topCenter,
                end:    pw.Alignment.bottomCenter,
                colors: [_kMidWine, _kPageBg, _kDeepShadow],
                stops:  [0.0, 0.55, 1.0],
              ),
            ),
          ),
        ),

        // Radial highlight (top-centre ambient glow)
        pw.Positioned(
          top:   -60,
          left:  100,
          right: 100,
          child: pw.Container(
            height: 280,
            decoration: const pw.BoxDecoration(
              shape: pw.BoxShape.circle,
              gradient: pw.RadialGradient(
                colors: [
                  PdfColor.fromInt(0x33C21A2C),
                  PdfColor.fromInt(0x00C21A2C),
                ],
              ),
            ),
          ),
        ),

        // Content column
        pw.Positioned.fill(
          child: pw.Padding(
            padding: const pw.EdgeInsets.symmetric(horizontal: 48, vertical: 52),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.center,
              children: [
                _buildHeader(),
                pw.SizedBox(height: 28),
                _buildAmountBlock(amount, transfer.recipient),
                pw.SizedBox(height: 32),
                _buildDetailsCard(
                  ownHandle: ownHandle,
                  recipient: transfer.recipient,
                  note:      transfer.note,
                  dateStr:   dateStr,
                  ref8:      ref8,
                ),
                pw.Spacer(),
                _buildFooter(ref8),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────

  static pw.Widget _buildHeader() {
    return pw.Column(
      children: [
        _buildSealMark(),
        pw.SizedBox(height: 16),
        pw.Text(
          'Comprovativo',
          style: pw.TextStyle(
            color:      _kWhite,
            fontSize:   22,
            fontWeight: pw.FontWeight.bold,
          ),
        ),
        pw.SizedBox(height: 4),
        pw.Text(
          'Transferência concluída',
          style: pw.TextStyle(
            color:    _kWhite70,
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  // ── Verified seal (drawn with PDF primitives) ─────────────────────────────

  static pw.Widget _buildSealMark() {
    const size = 72.0;
    return pw.SizedBox(
      width:  size,
      height: size,
      child:  pw.Stack(
        alignment: pw.Alignment.center,
        children: [
          // Outer luminous ring
          pw.Container(
            width:  size,
            height: size,
            decoration: pw.BoxDecoration(
              shape: pw.BoxShape.circle,
              border: pw.Border.all(
                color: _kCherry,
                width: 1.5,
              ),
            ),
          ),
          // Core cherry seal
          pw.Container(
            width:  size * 0.68,
            height: size * 0.68,
            decoration: pw.BoxDecoration(
              shape: pw.BoxShape.circle,
              gradient: const pw.RadialGradient(
                colors: [_kCherry, _kMidWine, _kDeepShadow],
                stops:  [0.0,      0.52,      1.0],
              ),
            ),
          ),
          // Checkmark
          pw.Text(
            '✓',
            style: pw.TextStyle(
              color:      _kWhite,
              fontSize:   size * 0.38,
              fontWeight: pw.FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  // ── Amount block ──────────────────────────────────────────────────────────

  static pw.Widget _buildAmountBlock(String amount, String recipient) {
    return pw.Column(
      children: [
        pw.Text(
          amount,
          style: pw.TextStyle(
            color:      _kWhite,
            fontSize:   48,
            fontWeight: pw.FontWeight.bold,
          ),
        ),
        pw.SizedBox(height: 6),
        pw.Text(
          'para @$recipient',
          style: pw.TextStyle(
            color:    _kWhite70,
            fontSize: 13,
          ),
        ),
      ],
    );
  }

  // ── Details card ──────────────────────────────────────────────────────────

  static pw.Widget _buildDetailsCard({
    required String  ownHandle,
    required String  recipient,
    required String? note,
    required String  dateStr,
    required String  ref8,
  }) {
    return pw.Container(
      decoration: pw.BoxDecoration(
        color:        _kCard,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(16)),
        border:       pw.Border.all(color: _kCardBorder, width: 0.5),
      ),
      padding: const pw.EdgeInsets.symmetric(horizontal: 28, vertical: 20),
      child: pw.Column(
        children: [
          _detailRow('De',     '@$ownHandle'),
          _divider(),
          _detailRow('Para',   '@$recipient'),
          _divider(),
          _detailRow('Nota',   note ?? '—'),
          _divider(),
          _detailRow('Data',   dateStr),
          _divider(),
          _detailRow('Ref',    ref8),
          _divider(),
          _detailRow('Método', 'Saldo Banza'),
        ],
      ),
    );
  }

  static pw.Widget _detailRow(String label, String value) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 7),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            label,
            style: pw.TextStyle(color: _kWhite45, fontSize: 11),
          ),
          pw.Text(
            value,
            style: pw.TextStyle(
              color:      _kWhite,
              fontSize:   11,
              fontWeight: pw.FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  static pw.Widget _divider() => pw.Divider(
        color:     _kCardBorder,
        thickness: 0.5,
        height:    0,
      );

  // ── Footer ────────────────────────────────────────────────────────────────

  static pw.Widget _buildFooter(String ref8) {
    return pw.Column(
      children: [
        pw.Divider(color: _kCardBorder, thickness: 0.5),
        pw.SizedBox(height: 12),
        pw.Text(
          'Comprovativo Banza',
          style: pw.TextStyle(
            color:      _kWhite,
            fontSize:   11,
            fontWeight: pw.FontWeight.bold,
          ),
        ),
        pw.SizedBox(height: 3),
        pw.Text(
          'Verificável quando partilhado',
          style: pw.TextStyle(color: _kWhite45, fontSize: 9),
        ),
        pw.SizedBox(height: 3),
        pw.Text(
          'Ref $ref8 · banzami.org',
          style: pw.TextStyle(color: _kWhite45, fontSize: 9),
        ),
      ],
    );
  }
}
