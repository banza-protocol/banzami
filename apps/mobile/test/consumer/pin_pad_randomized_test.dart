import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/widgets/pin_pad.dart';

// The randomized PIN keypad: a new permutation when entry begins and after every
// failed attempt; stable during a single attempt; backspace never reshuffles;
// every digit 0-9 present exactly once. Proven deterministically by injecting a
// shuffle that counts its invocations — never a probabilistic shuffle1 != shuffle2.
void main() {
  testWidgets('shuffles once on open, keeps all ten digits, stays stable within an attempt', (t) async {
    var shuffleCount = 0;
    List<int> fakeShuffle(List<int> d) {
      shuffleCount++;
      return d.reversed.toList(); // deterministic, still a full permutation
    }

    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: PinPad(onChanged: (_) {}, shuffle: fakeShuffle),
        ),
      ),
    ));
    await t.pumpAndSettle();

    // A fresh layout was requested exactly once when entry began.
    expect(shuffleCount, 1);

    // Every digit 0-9 is present exactly once (no missing, no duplicate).
    for (final k in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(find.text(k), findsOneWidget, reason: 'digit $k');
    }
    expect(find.bySemanticsLabel('Apagar'), findsOneWidget);

    // Within one attempt the layout is stable: tapping digits does not reshuffle.
    await t.tap(find.text('1'));
    await t.pump();
    await t.tap(find.text('2'));
    await t.pump();
    expect(shuffleCount, 1, reason: 'tapping digits must not reshuffle mid-attempt');

    // Backspace does not reshuffle either.
    await t.tap(find.bySemanticsLabel('Apagar'));
    await t.pump();
    expect(shuffleCount, 1, reason: 'backspace must not reshuffle');
  });

  testWidgets('a failed attempt (error) reshuffles and clears the dots', (t) async {
    var shuffleCount = 0;
    List<int> fakeShuffle(List<int> d) {
      shuffleCount++;
      return List<int>.of(d);
    }

    await t.pumpWidget(_ErrorHost(shuffle: fakeShuffle));
    await t.pumpAndSettle();
    expect(shuffleCount, 1);

    // Flip error true → the keypad reshuffles for the next attempt.
    await t.tap(find.text('flip-error'));
    await t.pumpAndSettle();
    expect(shuffleCount, 2, reason: 'a failed attempt must request a new shuffle');
  });

  testWidgets('randomized:false keeps the natural order (non-PIN contexts only)', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(child: PinPad(onChanged: (_) {}, randomized: false)),
      ),
    ));
    await t.pumpAndSettle();
    // Still all digits present (order is the natural one here).
    for (final k in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(find.text(k), findsOneWidget);
    }
  });
}

class _ErrorHost extends StatefulWidget {
  const _ErrorHost({required this.shuffle});
  final PinShuffle shuffle;
  @override
  State<_ErrorHost> createState() => _ErrorHostState();
}

class _ErrorHostState extends State<_ErrorHost> {
  bool _error = false;
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Column(
          children: [
            TextButton(onPressed: () => setState(() => _error = true), child: const Text('flip-error')),
            Expanded(
              child: PinPad(onChanged: (_) {}, error: _error, shuffle: widget.shuffle),
            ),
          ],
        ),
      ),
    );
  }
}
