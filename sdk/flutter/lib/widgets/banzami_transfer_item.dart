import 'package:flutter/material.dart';

import '../models/activity_item.dart';
import '../theme/banzami_theme.dart';
import '../utils/date_formatter.dart';

/// A single row in the consumer activity feed.
///
/// Direction (OUTGOING / INCOMING) is computed server-side and read from
/// [ActivityItem.direction] — no consumer-ID comparison needed here.
class BanzamiTransferItem extends StatelessWidget {
  final ActivityItem item;
  final VoidCallback? onTap;

  const BanzamiTransferItem({
    super.key,
    required this.item,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isOut = item.isOutgoing;

    final amountColor = isOut ? BanzamiColors.gray900 : BanzamiColors.success;
    final amountSign = isOut ? '− ' : '+ ';
    final iconColor = isOut ? BanzamiColors.primary : BanzamiColors.success;

    final (icon, label) = switch (item.itemType) {
      'P2P_SENT' => (Icons.arrow_upward_rounded, 'Enviado'),
      'P2P_RECEIVED' => (Icons.arrow_downward_rounded, 'Recebido'),
      'MERCHANT_PAYMENT_SENT' => (Icons.storefront_rounded, 'Pagamento'),
      'WALLET_FUNDED' => (Icons.add_rounded, 'Carregamento'),
      'WALLET_REVERSED' => (Icons.remove_rounded, 'Estorno'),
      // Never surface a raw technical code — fall back to the shared label.
      _ => (Icons.swap_horiz_rounded, item.typeLabel),
    };

    // The @banza first; the display name only when there is no handle.
    final subtitle = item.counterpartyAt ?? item.counterpartyDisplayName ?? item.note;

    return InkWell(
      onTap: onTap,
      borderRadius: BanzamiRadius.mdAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical: BanzamiSpacing.md,
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.10),
                borderRadius: BanzamiRadius.mdAll,
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: BanzamiSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: BanzamiTextStyles.headingSm),
                  if (subtitle != null && subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      style: BanzamiTextStyles.bodySm,
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
                  style: BanzamiTextStyles.mono.copyWith(
                    color: amountColor,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _formatDate(item.createdAt),
                  style: BanzamiTextStyles.bodySm,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime dt) => BanzamiDateFormatter.formatShortTime(dt);
}
