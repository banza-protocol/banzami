import 'package:flutter/material.dart' show DateUtils;
import 'package:intl/intl.dart';

/// Centralised date/time formatter for all Banzami UI.
///
/// Rule: server timestamps are always UTC.  Every method in this class calls
/// `.toLocal()` before formatting so the user sees their device timezone.
/// Never add manual hour offsets — let the OS handle DST and region.
class BanzamiDateFormatter {
  BanzamiDateFormatter._();

  /// "25 de maio de 2026, 20:30" — receipts, PDF, detail views.
  static String formatReceiptDate(DateTime dt) {
    final local = dt.toLocal();
    return DateFormat("d 'de' MMMM 'de' y, HH:mm", 'pt').format(local);
  }

  /// "10 de setembro de 2026, 20:13 (WAT)" — the OFFICIAL receipt clock.
  ///
  /// A comprovativo, its PDF and the public verifier describe one instant, and a
  /// reader compares them; each printed a different clock without saying which
  /// (21:13 on a phone in Lisbon, 20:13 WAT on the PDF, 19:13 on the page). The
  /// official surfaces all say Luanda time and label it. Africa/Luanda is UTC+1
  /// all year (no DST), so this is exact — it is not a device-zone guess.
  static String formatOfficialReceipt(DateTime dt) {
    final wat = dt.toUtc().add(const Duration(hours: 1));
    return '${DateFormat("d 'de' MMMM 'de' y", 'pt').format(wat)}, ${_hm(wat)} (WAT)';
  }

  /// Alias for receipt date — satisfies the formatFullDateTime contract.
  static String formatFullDateTime(DateTime dt) => formatReceiptDate(dt);

  /// Activity feed mini-cards: "Hoje, 20:30" / "Ontem, 20:30" / "25/5".
  static String formatActivityTime(DateTime dt, {DateTime? now}) {
    final local = dt.toLocal();
    final days = _calendarDaysAgo(dt, now);
    if (days == 0) return 'Hoje, ${_hm(local)}';
    if (days == 1) return 'Ontem, ${_hm(local)}';
    return '${local.day}/${local.month}';
  }

  /// History list rows: "20:30" / "Ontem" / "25/5".
  static String formatListTime(DateTime dt, {DateTime? now}) {
    final local = dt.toLocal();
    final days = _calendarDaysAgo(dt, now);
    if (days == 0) return _hm(local);
    if (days == 1) return 'Ontem';
    return '${local.day}/${local.month}';
  }

  /// Transfer item chip: "20:30" / "Ontem" / "Segunda" / "25/05/26".
  static String formatShortTime(DateTime dt, {DateTime? now}) {
    final local = dt.toLocal();
    final days = _calendarDaysAgo(dt, now);
    if (days == 0) return DateFormat.Hm().format(local);
    if (days == 1) return 'Ontem';
    if (days > 1 && days < 7) return DateFormat.EEEE('pt_PT').format(local);
    return DateFormat('dd/MM/yy').format(local);
  }

  /// Group headers: "Hoje" / "Ontem" / "25 mai 2026".
  static String formatDayHeader(DateTime dt, {DateTime? now}) {
    final days = _calendarDaysAgo(dt, now);
    if (days == 0) return 'Hoje';
    if (days == 1) return 'Ontem';
    return DateFormat('d MMM yyyy', 'pt_PT').format(toLocalDate(dt));
  }

  /// A calendar date: "25/05/2026" (validity dates, documents).
  static String formatDate(DateTime dt) =>
      DateFormat('dd/MM/yyyy').format(dt.toLocal());

  /// Local calendar date (midnight) for group-header comparisons.
  static DateTime toLocalDate(DateTime dt) => DateUtils.dateOnly(dt.toLocal());

  /// How many CALENDAR days (local) separate [dt] from [now] — 20:30 yesterday
  /// seen at 09:00 today is 1 ("Ontem"), not 0 because fewer than 24 h passed.
  static int _calendarDaysAgo(DateTime dt, DateTime? now) {
    final today = toLocalDate(now ?? DateTime.now());
    final day = toLocalDate(dt);
    // Noon-to-noon, so a DST change never makes a day 23 or 25 hours long.
    return DateTime(today.year, today.month, today.day, 12)
            .difference(DateTime(day.year, day.month, day.day, 12))
            .inHours ~/
        24;
  }

  static String _hm(DateTime local) =>
      '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
