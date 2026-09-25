import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

/// A button that SAYS it is a button must carry the action it claims.
///
/// BanzamiPrimaryButton and BanzamiActionTile wrap their GestureDetector in
/// `Semantics(button: true, excludeSemantics: true)`. excludeSemantics removes
/// the detector's own semantics, and neither Semantics node declared `onTap` —
/// so the accessible node announced a button with no way to activate it.
///
/// On Flutter Web that node is a transparent DOM overlay above the canvas.
/// Activating it dispatches a semantics action; with none registered nothing
/// happens, and a tap only works when it happens to fall through to the canvas
/// at the button's real position. BZV-20260923-0001 and BZV-20260924-0001 both
/// failed S18-PAR-003 on exactly that: at 1.50x accessibility text the
/// "Criar cobrança" control was visible, named and located, and no tap by any
/// strategy produced navigation — while the same control worked at 1.00x.
///
/// These tests activate the SEMANTICS node, which is what a screen reader and
/// the web overlay both do. They fail on a button whose action is only in the
/// gesture detector.
void main() {
  // Find the node BY ITS LABEL. `find.byType(Semantics).first` returns
  // MaterialApp's own wrapper, not the button's — a test that activates the
  // wrong node fails whatever the button does, and would have "proven" the
  // defect either way.
  Future<void> pumpAndActivate(
      WidgetTester tester, Widget child, String label) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: child)));
    await tester.pumpAndSettle();
    final handle = tester.ensureSemantics();
    final node = tester.getSemantics(find.bySemanticsLabel(label));
    // The action a screen reader (and the Flutter Web overlay) invokes.
    tester.binding.pipelineOwner.semanticsOwner!
        .performAction(node.id, SemanticsAction.tap);
    await tester.pumpAndSettle();
    handle.dispose();
  }

  testWidgets('BanzamiPrimaryButton: activating its semantics node presses it',
      (tester) async {
    var pressed = 0;
    await pumpAndActivate(
      tester,
      BanzamiPrimaryButton(label: 'Criar cobrança', onPressed: () => pressed++),
      'Criar cobrança',
    );
    expect(pressed, 1,
        reason: 'the accessible node announces a button; activating it must '
            'invoke the button, not depend on a pointer reaching the canvas');
  });

  testWidgets('BanzamiPrimaryButton: a disabled button exposes no tap action',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: BanzamiPrimaryButton(label: 'Criar cobrança'))));
    await tester.pumpAndSettle();
    final handle = tester.ensureSemantics();
    final node = tester.getSemantics(find.bySemanticsLabel('Criar cobrança'));
    expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isFalse,
        reason: 'an action a disabled control cannot perform must not be '
            'announced — that is a promise the control does not keep');
    handle.dispose();
  });

  testWidgets('BanzamiActionTile: activating its semantics node taps it',
      (tester) async {
    var tapped = 0;
    await pumpAndActivate(
      tester,
      Row(children: [
        BanzamiActionTile(
          label: 'Receber',
          icon: Icons.qr_code_rounded,
          onTap: () => tapped++,
        ),
      ]),
      'Receber',
    );
    expect(tapped, 1,
        reason: 'the same defect, in the other component that hides a gesture '
            'detector behind excludeSemantics');
  });
}
