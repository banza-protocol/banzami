import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_button.dart';

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
      backgroundColor: BanzaColors.white,
      appBar: AppBar(
        title:           const Text('Comprovativo', style: BanzaTextStyles.headingSm),
        backgroundColor: BanzaColors.white,
        foregroundColor: BanzaColors.gray900,
        elevation:       0,
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
          child: Column(
            children: [
              const Spacer(),

              // Success mark
              Container(
                width:       80,
                height:      80,
                decoration: const BoxDecoration(
                  color: BanzaColors.successBg,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_rounded,
                  color: BanzaColors.success,
                  size:  44,
                ),
              ),

              const SizedBox(height: BanzaSpacing.md),
              const Text('Enviado!', style: BanzaTextStyles.headingLg),
              const SizedBox(height: BanzaSpacing.xs),
              Text(
                amount,
                style: BanzaTextStyles.mono.copyWith(
                  fontSize:   42,
                  fontWeight: FontWeight.w700,
                  color:      BanzaColors.gray900,
                ),
              ),

              const Spacer(),

              // Details card
              Container(
                width:       double.infinity,
                padding: const EdgeInsets.all(BanzaSpacing.lg),
                decoration: BoxDecoration(
                  color:        BanzaColors.gray100,
                  borderRadius: BorderRadius.circular(BanzaRadius.lg),
                ),
                child: Column(
                  children: [
                    _Row(label: 'Para',  value: '@${transfer.recipient}'),
                    if (ownHandle != null || transfer.sender.isNotEmpty)
                      _Row(label: 'De',   value: '@${ownHandle ?? transfer.sender}'),
                    if (transfer.note != null && transfer.note!.isNotEmpty)
                      _Row(label: 'Nota', value: transfer.note!),
                    _Row(label: 'Data',  value: date),
                    _Row(label: 'Ref',   value: ref, isLast: true),
                  ],
                ),
              ),

              const Spacer(),

              BanzaButton(
                label:     'Concluído',
                onPressed: () {
                  onDone(transfer);
                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
              ),

              const SizedBox(height: BanzaSpacing.xl),
            ],
          ),
        ),
      ),
    );
  }
}

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
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
              ),
              const SizedBox(width: BanzaSpacing.md),
              Flexible(
                child: Text(
                  value,
                  style: BanzaTextStyles.bodyMd.copyWith(
                    fontWeight: FontWeight.w600,
                    color:      BanzaColors.gray900,
                  ),
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
        ),
        if (!isLast)
          const Divider(height: 1, color: BanzaColors.gray200),
      ],
    );
  }
}
