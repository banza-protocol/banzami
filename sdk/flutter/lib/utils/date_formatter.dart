import 'package:flutter/material.dart' show DateUtils;
import 'package:intl/intl.dart';

/// Centralised date/time formatter for all Banza UI.
///
/// Rule: server timestamps are always UTC.  Every method in this class calls
/// `.toLocal()` before formatting so the user sees their device timezone.
/// Never add manual hour offsets — let the OS handle DST and region.
class BanzaDateFormatter {
  BanzaDateFormatter._();

  /// "25 de maio de 2026, 20:30" — receipts, PDF, detail views.
  static String formatReceiptDate(DateTime dt) {
    final local = dt.toLocal();
    return DateFormat("d 'de' MMMM 'de' y, HH:mm", 'pt').format(local);
  }

  /// Alias for receipt date — satisfies the formatFullDateTime contract.
  static String formatFullDateTime(DateTime dt) => formatReceiptDate(dt);

  /// Activity feed mini-cards: "Hoje, 20:30" / "Ontem, 20:30" / "25/5".
  static String formatActivityTime(DateTime dt) {
    final local = dt.toLocal();
    final diff  = DateTime.now().difference(local);
    if (diff.inDays == 0) return 'Hoje, ${_hm(local)}';
    if (diff.inDays == 1) return 'Ontem, ${_hm(local)}';
    return '${local.day}/${local.month}';
  }

  /// History list rows: "20:30" / "Ontem" / "25/5".
  static String formatListTime(DateTime dt) {
    final local = dt.toLocal();
    final diff  = DateTime.now().difference(local);
    if (diff.inDays == 0) return _hm(local);
    if (diff.inDays == 1) return 'Ontem';
    return '${local.day}/${local.month}';
  }

  /// Transfer item chip: "20:30" / "Ontem" / "Segunda" / "25/05/26".
  static String formatShortTime(DateTime dt) {
    final local = dt.toLocal();
    final diff  = DateTime.now().difference(local);
    if (diff.inDays == 0) return DateFormat.Hm().format(local);
    if (diff.inDays == 1) return 'Ontem';
    if (diff.inDays < 7)  return DateFormat.EEEE('pt_PT').format(local);
    return DateFormat('dd/MM/yy').format(local);
  }

  /// Local calendar date (midnight) for group-header comparisons.
  static DateTime toLocalDate(DateTime dt) => DateUtils.dateOnly(dt.toLocal());

  static String _hm(DateTime local) =>
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
