/// The shared receipt's file name: the proof reference when the payment has
/// one, otherwise the payment's local date and time — never a trailing "-"
/// ("Banzami-Comprovativo-.pdf") nor an internal id.
String receiptPdfFileName(String? reference, DateTime createdAt) {
  final ref = (reference ?? '').trim().replaceAll(RegExp(r'[^A-Za-z0-9-]'), '');
  if (ref.isNotEmpty) return 'Banzami-Comprovativo-$ref.pdf';
  final l = createdAt.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return 'Banzami-Comprovativo-${l.year}-${two(l.month)}-${two(l.day)}-'
      '${two(l.hour)}${two(l.minute)}.pdf';
}
