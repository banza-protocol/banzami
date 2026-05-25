import 'package:flutter/material.dart';

import '../models/activity_item.dart';
import '../theme/banza_theme.dart';
import '../utils/date_formatter.dart';

/// A single row in the consumer activity feed.
///
/// Direction (OUTGOING / INCOMING) is computed server-side and read from
/// [ActivityItem.direction] — no consumer-ID comparison needed here.
class BanzaTransferItem extends StatelessWidget {
  final ActivityItem item;
  final VoidCallback? onTap;

  const BanzaTransferItem({
    super.key,
    required this.item,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isOut = item.isOutgoing;

    final amountColor = isOut ? BanzaColors.gray900 : BanzaColors.success;
    final amountSign  = isOut ? '− ' : '+ ';
    final iconColor   = isOut ? BanzaColors.wine : BanzaColors.success;

    final (icon, label) = switch (item.itemType) {
      'P2P_SENT'       => (Icons.arrow_upward_rounded,   'Enviado'),
      'P2P_RECEIVED'   => (Icons.arrow_downward_rounded, 'Recebido'),
      'WALLET_FUNDED'  => (Icons.add_rounded,            'Carregamento'),
      'WALLET_REVERSED'=> (Icons.remove_rounded,         'Estorno'),
      _                => (Icons.swap_horiz_rounded,     'Transacção'),
    };

    final subtitle = item.counterpartyHandle != null
        ? item.counterpartyDisplayName ?? item.counterpartyHandle!
        : item.note;

    return InkWell(
      onTap:        onTap,
      borderRadius: BanzaRadius.mdAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.lg,
          vertical:   BanzaSpacing.md,
        ),
        child: Row(
          children: [
            Container(
              width:       40,
              height:      40,
              decoration:  BoxDecoration(
                color:        iconColor.withValues(alpha: 0.10),
                borderRadius: BanzaRadius.mdAll,
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: BanzaSpacing.md),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: BanzaTextStyles.headingSm),
                  if (subtitle != null && subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      style:    BanzaTextStyles.bodySm,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),

            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '$amountSign${item.amountFormatted}',
                  style: BanzaTextStyles.mono.copyWith(
                    color:      amountColor,
                    fontWeight: FontWeight.w600,
                    fontSize:   15,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _formatDate(item.createdAt),
                  style: BanzaTextStyles.bodySm,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) => BanzaDateFormatter.formatShortTime(dt);
}
