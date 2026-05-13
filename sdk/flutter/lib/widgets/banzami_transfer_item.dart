import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/transfer.dart';
import '../theme/banzami_theme.dart';

/// A single row in a transfer/transaction list.
///
/// Shows direction (incoming/outgoing relative to [currentConsumerId]),
/// amount, counterparty handle, and timestamp.
class BanzamiTransferItem extends StatelessWidget {
  final Transfer transfer;

  /// The logged-in consumer's ID — used to determine debit/credit direction.
  final String currentConsumerId;

  final VoidCallback? onTap;

  const BanzamiTransferItem({
    super.key,
    required this.transfer,
    required this.currentConsumerId,
    this.onTap,
  });

  bool get _isOutgoing => transfer.senderId == currentConsumerId;

  @override
  Widget build(BuildContext context) {
    final isOut      = _isOutgoing;
    final amountColor = isOut ? BanzamiColors.gray900 : BanzamiColors.success;
    final amountSign  = isOut ? '− ' : '+ ';
    final icon        = isOut
        ? Icons.arrow_upward_rounded
        : Icons.arrow_downward_rounded;
    final iconColor   = isOut ? BanzamiColors.wine : BanzamiColors.success;
    final label       = isOut ? 'Enviado' : 'Recebido';

    return InkWell(
      onTap:         onTap,
      borderRadius:  BanzamiRadius.mdAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical:   BanzamiSpacing.md,
        ),
        child: Row(
          children: [
            // Direction icon
            Container(
              width:       40,
              height:      40,
              decoration:  BoxDecoration(
                color:        iconColor.withValues(alpha: 0.1),
                borderRadius: BanzamiRadius.mdAll,
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: BanzamiSpacing.md),

            // Label + description
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: BanzamiTextStyles.headingSm),
                  if (transfer.description?.isNotEmpty == true)
                    Text(
                      transfer.description!,
                      style: BanzamiTextStyles.bodySm,
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
                  style: BanzamiTextStyles.mono.copyWith(
                    color:      amountColor,
                    fontWeight: FontWeight.w600,
                    fontSize:   15,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _formatDate(transfer.createdAt),
                  style: BanzamiTextStyles.bodySm,
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
