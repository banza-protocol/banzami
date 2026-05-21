import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';

/// Final screen of the P2P send flow — shown after a successful transfer.
///
/// The transfer is already complete when this screen appears.
/// "Concluído" pops the entire navigation stack back to [MainScreen]
/// and invokes [onDone] so the home screen can refresh balance and activity.
class BanzamiReceiptScreen extends StatelessWidget {
  final Transfer transfer;
  final String?  ownHandle;
  final void Function(Transfer) onDone;

  const BanzamiReceiptScreen({
    super.key,
    required this.transfer,
    this.ownHandle,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    final amount = formatMinor(transfer.amountMinor, transfer.currency);
    final ts     = transfer.completedAt ?? transfer.createdAt;
    final date   = DateFormat("d 'de' MMMM 'de' y, HH:mm", 'pt').format(ts.toLocal());
    final ref    = transfer.transferId.length >= 8
        ? transfer.transferId.substring(0, 8).toUpperCase()
        : transfer.transferId.toUpperCase();

    return Scaffold(
      backgroundColor: BanzaColors.wineDark,
      body: Container(
        width:     double.infinity,
        height:    double.infinity,
        decoration: const BoxDecoration(gradient: BanzaGradients.wine),
        child: SafeArea(
          child: Column(
            children: [
              // ---- top bar ------------------------------------------------
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: BanzaSpacing.lg,
                  vertical:   BanzaSpacing.md,
                ),
                child: Text(
                  'Comprovativo',
                  style: BanzaTextStyles.headingSm.copyWith(
                    color: BanzaColors.white.withValues(alpha: 0.75),
                  ),
                ),
              ),

              const Spacer(),

              // ---- success mark -------------------------------------------
              Container(
                width:  80,
                height: 80,
                decoration: BoxDecoration(
                  color:  BanzaColors.white.withValues(alpha: 0.15),
                  shape:  BoxShape.circle,
                  border: Border.all(
                    color: BanzaColors.white.withValues(alpha: 0.30),
                    width: 1.5,
                  ),
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: BanzaColors.white,
                  size:  44,
                ),
              ),

              const SizedBox(height: BanzaSpacing.md),

              Text(
                'Enviado com sucesso',
                style: BanzaTextStyles.headingSm.copyWith(
                  color: BanzaColors.white.withValues(alpha: 0.80),
                ),
              ),

              const SizedBox(height: BanzaSpacing.sm),

              Text(
                amount,
                style: BanzaTextStyles.mono.copyWith(
                  fontSize:   42,
                  fontWeight: FontWeight.w700,
                  color:      BanzaColors.white,
                ),
              ),

              const SizedBox(height: BanzaSpacing.xs),

              Text(
                'para @${transfer.recipient}',
                style: BanzaTextStyles.bodyMd.copyWith(
                  color: BanzaColors.white.withValues(alpha: 0.60),
                ),
              ),

              const Spacer(),

              // ---- details card -------------------------------------------
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
                child: Container(
                  width:   double.infinity,
                  padding: const EdgeInsets.all(BanzaSpacing.lg),
                  decoration: BoxDecoration(
                    color:        BanzaColors.white.withValues(alpha: 0.12),
                    borderRadius: const BorderRadius.all(Radius.circular(BanzaRadius.xl)),
                    border:       Border.all(
                      color: BanzaColors.white.withValues(alpha: 0.18),
                    ),
                  ),
                  child: Column(
                    children: [
                      if (ownHandle != null || transfer.sender.isNotEmpty)
                        _Row(label: 'De', value: '@${ownHandle ?? transfer.sender}'),
                      if (transfer.note != null && transfer.note!.isNotEmpty)
                        _Row(label: 'Nota', value: transfer.note!),
                      _Row(label: 'Data',     value: date),
                      _Row(label: 'Ref',      value: ref),
                      const _Row(label: 'Método',   value: 'Saldo Banza', isLast: true),
                    ],
                  ),
                ),
              ),

              const Spacer(),

              // ---- CTAs ---------------------------------------------------
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
                child: Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {
                          onDone(transfer);
                          Navigator.of(context).popUntil((route) => route.isFirst);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BanzaColors.white,
                          foregroundColor: BanzaColors.wine,
                          minimumSize:     const Size(double.infinity, 52),
                          shape: const RoundedRectangleBorder(
                            borderRadius: BanzaRadius.lgAll,
                          ),
                          elevation: 0,
                          textStyle: BanzaTextStyles.label.copyWith(
                            fontSize:   15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        child: const Text('Concluído'),
                      ),
                    ),
                    TextButton(
                      onPressed: () {},
                      style: TextButton.styleFrom(
                        foregroundColor: BanzaColors.white.withValues(alpha: 0.55),
                      ),
                      child: const Text('Partilhar comprovativo'),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: BanzaSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Detail row — white on dark
// =============================================================================

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final bool   isLast;

  const _Row({required this.label, required this.value, this.isLast = false});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: BanzaSpacing.sm),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: BanzaTextStyles.bodySm.copyWith(
                  color: BanzaColors.white.withValues(alpha: 0.55),
                ),
              ),
              const SizedBox(width: BanzaSpacing.md),
              Flexible(
                child: Text(
                  value,
                  style: BanzaTextStyles.bodyMd.copyWith(
                    fontWeight: FontWeight.w600,
                    color:      BanzaColors.white,
                  ),
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
        ),
        if (!isLast)
          Divider(height: 1, color: BanzaColors.white.withValues(alpha: 0.12)),
      ],
    );
  }
}
