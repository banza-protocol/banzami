import 'package:banzami_mobile/merchant/services/receipt_file_name.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('named by the proof reference when there is one', () {
    expect(receiptPdfFileName('BZM-Q7RT-CFAF', DateTime(2026, 9, 11, 20, 30)),
        'Banzami-Comprovativo-BZM-Q7RT-CFAF.pdf');
  });

  test('no reference → a date-based name, never "Banzami-Comprovativo-.pdf"', () {
    final name = receiptPdfFileName('', DateTime(2026, 9, 11, 20, 30));
    expect(name, 'Banzami-Comprovativo-2026-09-11-2030.pdf');
    expect(receiptPdfFileName(null, DateTime(2026, 1, 2, 3, 4)),
        'Banzami-Comprovativo-2026-01-02-0304.pdf');
  });

  test('a reference can never escape the file name', () {
    expect(receiptPdfFileName('../x/../y', DateTime(2026)), 'Banzami-Comprovativo-xy.pdf');
  });
}
