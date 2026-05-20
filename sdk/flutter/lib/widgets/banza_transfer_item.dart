import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/transfer.dart';
import '../theme/banza_theme.dart';

/// A single row in a transfer/transaction list.
///
/// Shows direction (incoming/outgoing relative to [currentConsumerId]),
/// amount, counterparty handle, and timestamp.
class BanzaTransferItem extends StatelessWidget {
  final Transfer transfer;

  /// The logged-in consumer's ID — used to determine debit/credit direction.
  final String currentConsumerId;

  final VoidCallback? onTap;

  const BanzaTransferItem({
    super.key,
    required this.transfer,
    required this.currentConsumerId,
    this.onTap,
  });

  bool get _isOutgoing => transfer.senderId == currentConsumerId;

  @override
  Widget build(BuildContext context) {
    final isOut      = _isOutgoing;
    final amountColor = isOut ? BanzaColors.gray900 : BanzaColors.success;
    final amountSign  = isOut ? '− ' : '+ ';
    final icon        = isOut
        ? Icons.arrow_upward_rounded
        : Icons.arrow_downward_rounded;
    final iconColor   = isOut ? BanzaColors.wine : BanzaColors.success;
    final label       = isOut ? 'Enviado' : 'Recebido';

    return InkWell(
      onTap:         onTap,
      borderRadius:  BanzaRadius.mdAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.lg,
          vertical:   BanzaSpacing.md,
        ),
        child: Row(
          children: [
            // Direction icon
            Container(
              width:       40,
              height:      40,
              decoration:  BoxDecoration(
                color:        iconColor.withValues(alpha: 0.1),
                borderRadius: BanzaRadius.mdAll,
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: BanzaSpacing.md),

            // Label + description
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: BanzaTextStyles.headingSm),
                  if (transfer.description?.isNotEmpty == true)
                    Text(
                      transfer.description!,
                      style: BanzaTextStyles.bodySm,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),

            // Amount + date
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '$amountSign${transfer.amountFormatted}',
                  style: BanzaTextStyles.mono.copyWith(
                    color:      amountColor,
                    fontWeight: FontWeight.w600,
                    fontSize:   15,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _formatDate(transfer.createdAt),
                  style: BanzaTextStyles.bodySm,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) {
    final now  = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0)  return DateFormat.Hm().format(dt);
    if (diff.inDays == 1)  return 'Ontem';
    if (diff.inDays < 7)   return DateFormat.EEEE('pt_PT').format(dt);
    return DateFormat('dd/MM/yy').format(dt);
  }
}
