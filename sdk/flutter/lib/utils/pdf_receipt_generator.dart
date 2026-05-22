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
const _kGray900  = PdfColor.fromInt(0xFF1C0D0D);
const _kGray600  = PdfColor.fromInt(0xFF534040);
const _kGray400  = PdfColor.fromInt(0xFF9C8483);
const _kGray200  = PdfColor.fromInt(0xFFEBE3E2);
const _kOffWhite = PdfColor.fromInt(0xFFFCF6F5);
const _kWhite    = PdfColors.white;
const _kSuccess  = PdfColor.fromInt(0xFF166534);
const _kSuccBg   = PdfColor.fromInt(0xFFDCFCE7);
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
    final ref8 = transfer.transferId
        .replaceAll('-', '')
        .substring(0, 8)
        .toUpperCase();
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
    );

    doc.addPage(pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin:     pw.EdgeInsets.zero,
      build:      (ctx) => _buildPage(
        ctx,
        transfer:   transfer,
        ownHandle:  ownHandle,
        ref8:       ref8,
        amount:     amount,
        dateStr:    dateStr,
        logoImage:  logoImage,
        isSandbox:  isSandbox,
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
    required Transfer       transfer,
    required String         ownHandle,
    required String         ref8,
    required String         amount,
    required String         dateStr,
    required pw.MemoryImage? logoImage,
    required bool           isSandbox,
  }) {
    return pw.Container(
      color:   _kWhite,
      padding: const pw.EdgeInsets.symmetric(horizontal: 48, vertical: 52),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.stretch,
        children: [
          _buildHeader(logoImage: logoImage, isSandbox: isSandbox),
          pw.SizedBox(height: 36),
          _buildHero(amount: amount, recipient: transfer.recipient),
          pw.SizedBox(height: 32),
          _buildDetailsCard(
            ownHandle: ownHandle,
            recipient: transfer.recipient,
            note:      transfer.note,
            dateStr:   dateStr,
            ref8:      ref8,
          ),
          pw.Spacer(),
          if (isSandbox) ...[
            _buildSandboxDisclaimer(),
            pw.SizedBox(height: 16),
          ],
          _buildFooter(ref8: ref8, isSandbox: isSandbox),
        ],
      ),
    );
  }

  // ── Header ────────────────────────────────────────────────────────────────

  static pw.Widget _buildHeader({
    required pw.MemoryImage? logoImage,
    required bool isSandbox,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        // Logo or brand name
        if (logoImage != null)
          pw.Center(child: pw.Image(logoImage, height: 56, fit: pw.BoxFit.contain))
        else
          pw.Center(
            child: pw.Text(
              isSandbox ? 'BANZA SANDBOX' : 'BANZA',
              style: pw.TextStyle(
                color:      _kWine,
                fontSize:   28,
                fontWeight: pw.FontWeight.bold,
              ),
            ),
          ),
        pw.SizedBox(height: 12),
        // Environment badge
        pw.Center(child: _buildEnvBadge(isSandbox)),
        pw.SizedBox(height: 28),
        pw.Divider(color: _kGray200, thickness: 0.5),
      ],
    );
  }

  static pw.Widget _buildEnvBadge(bool isSandbox) {
    if (isSandbox) {
      return pw.Container(
        padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: pw.BoxDecoration(
          color:        _kAmberBg,
          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(12)),
          border:       pw.Border.all(color: _kAmberBd, width: 0.75),
        ),
        child: pw.Text(
          '! TESTE — Ambiente sandbox',
          style: pw.TextStyle(
            color:      _kAmberDk,
            fontSize:   9,
            fontWeight: pw.FontWeight.bold,
          ),
        ),
      );
    }
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: pw.BoxDecoration(
        color:        _kSuccBg,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(12)),
        border:       pw.Border.all(color: _kSuccess, width: 0.75),
      ),
      child: pw.Text(
        '✓ Verificado · Banza',
        style: pw.TextStyle(
          color:      _kSuccess,
          fontSize:   9,
          fontWeight: pw.FontWeight.bold,
        ),
      ),
    );
  }

  // ── Hero ──────────────────────────────────────────────────────────────────

  static pw.Widget _buildHero({
    required String amount,
    required String recipient,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        // Success seal
        pw.Center(
          child: pw.Container(
            width:  56,
            height: 56,
            decoration: pw.BoxDecoration(
              gradient: const pw.LinearGradient(
                begin:  pw.Alignment.topLeft,
                end:    pw.Alignment.bottomRight,
                colors: [_kWine, _kWineDark],
              ),
              shape: pw.BoxShape.circle,
            ),
            child: pw.Center(
              child: pw.Text(
                '✓',
                style: pw.TextStyle(
                  color:      _kWhite,
                  fontSize:   24,
                  fontWeight: pw.FontWeight.bold,
                ),
              ),
            ),
          ),
        ),
        pw.SizedBox(height: 16),
        pw.Center(
          child: pw.Text(
            'Transferência concluída',
            style: pw.TextStyle(color: _kGray400, fontSize: 12),
          ),
        ),
        pw.SizedBox(height: 10),
        pw.Center(
          child: pw.Text(
            amount,
            style: pw.TextStyle(
              color:      _kGray900,
              fontSize:   48,
              fontWeight: pw.FontWeight.bold,
            ),
          ),
        ),
        pw.SizedBox(height: 6),
        pw.Center(
          child: pw.Text(
            'para @$recipient',
            style: pw.TextStyle(color: _kGray600, fontSize: 13),
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
        color:        _kOffWhite,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(16)),
        border:       pw.Border.all(color: _kGray200, width: 0.75),
      ),
      padding: const pw.EdgeInsets.symmetric(horizontal: 28, vertical: 4),
      child: pw.Column(
        children: [
          _detailRow('De',     '@$ownHandle'),
          _divider(),
          _detailRow('Para',   '@$recipient'),
          if (note != null && note.isNotEmpty) ...[
            _divider(),
            _detailRow('Nota', note),
          ],
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
      padding: const pw.EdgeInsets.symmetric(vertical: 10),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            label,
            style: pw.TextStyle(color: _kGray400, fontSize: 10),
          ),
          pw.Text(
            value,
            style: pw.TextStyle(
              color:      _kGray900,
              fontSize:   10,
              fontWeight: pw.FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  static pw.Widget _divider() =>
      pw.Divider(color: _kGray200, thickness: 0.5, height: 0);

  // ── Sandbox disclaimer ────────────────────────────────────────────────────

  static pw.Widget _buildSandboxDisclaimer() {
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
          pw.Text('! ', style: pw.TextStyle(color: _kAmberDk, fontSize: 12, fontWeight: pw.FontWeight.bold)),
          pw.Expanded(
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  'Ambiente de teste',
                  style: pw.TextStyle(
                    color:      _kAmberDk,
                    fontSize:   10,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 3),
                pw.Text(
                  'Este comprovativo foi gerado em ambiente sandbox e nao tem valor financeiro real.',
                  style: pw.TextStyle(color: _kAmberDk, fontSize: 9),
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
    required String ref8,
    required bool   isSandbox,
  }) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        pw.Divider(color: _kGray200, thickness: 0.5),
        pw.SizedBox(height: 14),
        pw.Center(
          child: pw.Text(
            'Comprovativo Banza',
            style: pw.TextStyle(
              color:      _kGray900,
              fontSize:   10,
              fontWeight: pw.FontWeight.bold,
            ),
          ),
        ),
        pw.SizedBox(height: 4),
        pw.Center(
          child: pw.Text(
            'Verificavel quando partilhado',
            style: pw.TextStyle(color: _kGray400, fontSize: 8),
          ),
        ),
        pw.SizedBox(height: 2),
        pw.Center(
          child: pw.Text(
            'Ref $ref8 · banzami.org',
            style: pw.TextStyle(color: _kGray400, fontSize: 8),
          ),
        ),
      ],
    );
  }
}
