import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../widgets/tab_screen_header.dart';

enum _HistoryFilter { all, received, sent }

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen>
    with SingleTickerProviderStateMixin {
  final List<ActivityItem> _items = [];
  String?        _cursor;
  bool           _loading = false;
  bool           _hasMore = true;
  String?        _error;
  _HistoryFilter _filter  = _HistoryFilter.all;

  late AnimationController _fadeCtrl;
  late Animation<double>   _fadeAnim;

  static const int _pageSize = 50;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 320),
    );
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    _load();
  }

  @override
  void dispose() {
    _fadeCtrl.dispose();
    super.dispose();
  }

  Future<void> _load({ bool refresh = false }) async {
    if (_loading) return;
    if (!_hasMore && !refresh) return;

    setState(() { _loading = true; _error = null; });
    if (refresh) {
      _items.clear();
      _cursor  = null;
      _hasMore = true;
      _fadeCtrl.reset();
    }

    final client = context.read<ConsumerPublicClient>();

    try {
      final page = await client.getActivity(
        limit:           _pageSize,
        cursor:          _cursor,
        directionFilter: switch (_filter) {
          _HistoryFilter.received => 'INCOMING',
          _HistoryFilter.sent     => 'OUTGOING',
          _HistoryFilter.all      => null,
        },
      );
      setState(() {
        _items.addAll(page.items);
        _cursor  = page.nextCursor;
        _hasMore = page.hasMore;
      });
      _fadeCtrl.forward();
    } catch (_) {
      setState(() => _error = 'Não foi possível carregar o histórico.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _switchFilter(_HistoryFilter f) async {
    if (f == _filter) return;
    HapticFeedback.selectionClick();
    setState(() {
      _filter = f;
      _items.clear();
      _cursor  = null;
      _hasMore = true;
    });
    await _load();
  }

  List<dynamic> _grouped(List<ActivityItem> items) {
    final today     = BanzaDateFormatter.toLocalDate(DateTime.now());
    final yesterday = today.subtract(const Duration(days: 1));
    final grouped   = <dynamic>[];
    String? lastKey;

    for (final item in items) {
      final date = BanzaDateFormatter.toLocalDate(item.createdAt);
      final String key;
      if (date == today) {
        key = 'Hoje';
      } else if (date == yesterday) {
        key = 'Ontem';
      } else {
        key = DateFormat('d MMM yyyy', 'pt_PT').format(date);
      }
      if (key != lastKey) { grouped.add(key); lastKey = key; }
      grouped.add(item);
    }
    return grouped;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TabScreenHeader(
              title:    'Histórico',
              subtitle: 'As suas movimentações',
              trailing: _items.isEmpty ? null : _CountBadge(count: _items.length),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzaSpacing.xl, 0, BanzaSpacing.xl, BanzaSpacing.lg,
              ),
              child: _HistoryFilterBar(
                selected: _filter,
                onSelect: _switchFilter,
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                color:           BanzaColors.wine,
                backgroundColor: BanzaColors.white,
                strokeWidth:     2.5,
                displacement:    40,
                onRefresh:       () => _load(refresh: true),
                child:           _buildBody(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _items.isEmpty) {
      return const _HistorySkeletonLoader();
    }

    if (_error != null && _items.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(
          BanzaSpacing.xl, BanzaSpacing.section,
          BanzaSpacing.xl, BanzaSpacing.page,
        ),
        children: [
          _ErrorCard(message: _error!, onRetry: _load),
        ],
      );
    }

    if (_items.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(
          BanzaSpacing.xl, BanzaSpacing.section,
          BanzaSpacing.xl, BanzaSpacing.page,
        ),
        children: [
          _EmptyStateCard(filter: _filter),
        ],
      );
    }

    final grouped = _grouped(_items);

    return FadeTransition(
      opacity: _fadeAnim,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(
          BanzaSpacing.xl, 0, BanzaSpacing.xl, BanzaSpacing.page,
        ),
        itemCount: grouped.length + (_hasMore ? 1 : 0),
        itemBuilder: (context, i) {
          if (i == grouped.length) {
            if (!_loading) _load();
            return const Padding(
              padding: EdgeInsets.all(BanzaSpacing.xl),
              child:   Center(
                child: SizedBox(
                  width:  22,
                  height: 22,
                  child:  CircularProgressIndicator(
                    color: BanzaColors.wine, strokeWidth: 2,
                  ),
                ),
              ),
            );
          }

          final row = grouped[i];

          if (row is String) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzaSpacing.xs, BanzaSpacing.xl, BanzaSpacing.xs, BanzaSpacing.sm,
              ),
              child: Text(
                row,
                style: BanzaTextStyles.label.copyWith(
                  color:         BanzaColors.gray400,
                  fontSize:      11,
                  letterSpacing: 0.6,
                  fontWeight:    FontWeight.w600,
                ),
              ),
            );
          }

          final item    = row as ActivityItem;
          final prev    = i > 0 ? grouped[i - 1] : null;
          final next    = i < grouped.length - 1 ? grouped[i + 1] : null;
          final isFirst = prev == null || prev is String;
          final isLast  = next == null || next is String;

          return _ActivityCard(item: item, isFirst: isFirst, isLast: isLast);
        },
      ),
    );
  }
}

// =============================================================================
// Count badge — trailing widget for TabScreenHeader
// =============================================================================

class _CountBadge extends StatelessWidget {
  final int count;
  const _CountBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color:        BanzaColors.wine.withValues(alpha: 0.08),
        borderRadius: BanzaRadius.fullAll,
      ),
      child: Text(
        '$count',
        style: BanzaTextStyles.label.copyWith(
          color:      BanzaColors.wine,
          fontWeight: FontWeight.w700,
          fontSize:   11,
        ),
      ),
    );
  }
}

// =============================================================================
// Filter bar — segmented control
// =============================================================================

class _HistoryFilterBar extends StatelessWidget {
  final _HistoryFilter               selected;
  final ValueChanged<_HistoryFilter> onSelect;

  const _HistoryFilterBar({required this.selected, required this.onSelect});

  static const _chips = [
    (_HistoryFilter.all,      'Todas'),
    (_HistoryFilter.received, 'Recebidas'),
    (_HistoryFilter.sent,     'Enviadas'),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: _chips.map((pair) {
        final (filter, label) = pair;
        return Padding(
          padding: const EdgeInsets.only(right: BanzaSpacing.sm),
          child: _FilterChip(
            label:    label,
            selected: selected == filter,
            onTap:    () => onSelect(filter),
          ),
        );
      }).toList(),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String       label;
  final bool         selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve:    Curves.easeInOut,
        padding:  const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
        decoration: selected
            ? BoxDecoration(
                gradient:     BanzaGradients.wine,
                borderRadius: BanzaRadius.fullAll,
                boxShadow: [
                  BoxShadow(
                    color:        BanzaColors.wine.withValues(alpha: 0.28),
                    blurRadius:   12,
                    spreadRadius: -2,
                    offset:       const Offset(0, 4),
                  ),
                ],
              )
            : BoxDecoration(
                color:        BanzaColors.white,
                borderRadius: BanzaRadius.fullAll,
                border:       Border.all(color: BanzaColors.gray200),
                boxShadow:    BanzaShadows.card,
              ),
        child: Text(
          label,
          style: BanzaTextStyles.label.copyWith(
            color:      selected ? BanzaColors.white : BanzaColors.gray600,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Skeleton loader
// =============================================================================

class _HistorySkeletonLoader extends StatefulWidget {
  const _HistorySkeletonLoader();

  @override
  State<_HistorySkeletonLoader> createState() => _HistorySkeletonLoaderState();
}

class _HistorySkeletonLoaderState extends State<_HistorySkeletonLoader>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double>   _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 850),
    )..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.35, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) => ListView(
        padding: const EdgeInsets.fromLTRB(
          BanzaSpacing.xl, BanzaSpacing.xs,
          BanzaSpacing.xl, BanzaSpacing.page,
        ),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          _dateLabel(),
          _cardGroup(3),
          const SizedBox(height: BanzaSpacing.xl),
          _dateLabel(),
          _cardGroup(2),
          const SizedBox(height: BanzaSpacing.xl),
          _dateLabel(),
          _cardGroup(1),
        ],
      ),
    );
  }

  Widget _block({double? width, double height = 13, double radius = 8}) =>
      Opacity(
        opacity: _anim.value,
        child: Container(
          width:  width,
          height: height,
          decoration: BoxDecoration(
            color:        BanzaColors.gray200,
            borderRadius: BorderRadius.circular(radius),
          ),
        ),
      );

  Widget _dateLabel() => Padding(
    padding: const EdgeInsets.fromLTRB(4, BanzaSpacing.lg, 4, BanzaSpacing.sm),
    child: _block(width: 56, height: 9, radius: 5),
  );

  Widget _row() => Padding(
    padding: const EdgeInsets.symmetric(
      horizontal: BanzaSpacing.lg,
      vertical:   BanzaSpacing.md + 2,
    ),
    child: Row(
      children: [
        Opacity(
          opacity: _anim.value,
          child: const SizedBox(
            width:  44,
            height: 44,
            child:  DecoratedBox(
              decoration: BoxDecoration(
                color: BanzaColors.gray200,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ),
        const SizedBox(width: BanzaSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _block(width: 110, height: 12),
              const SizedBox(height: 7),
              _block(width: 68, height: 10),
            ],
          ),
        ),
        const SizedBox(width: BanzaSpacing.md),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _block(width: 60, height: 12),
            const SizedBox(height: 7),
            _block(width: 32, height: 10),
          ],
        ),
      ],
    ),
  );

  Widget _cardGroup(int count) => Container(
    decoration: const BoxDecoration(
      color:        BanzaColors.white,
      borderRadius: BanzaRadius.xlAll,
      boxShadow:    BanzaShadows.card,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(count, (i) {
        final isLast = i == count - 1;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _row(),
            if (!isLast)
              const Divider(height: 1, indent: 72, color: BanzaColors.gray100),
          ],
        );
      }),
    ),
  );
}

// =============================================================================
// Empty state card
// =============================================================================

class _EmptyStateCard extends StatelessWidget {
  final _HistoryFilter filter;
  const _EmptyStateCard({required this.filter});

  @override
  Widget build(BuildContext context) {
    final title = switch (filter) {
      _HistoryFilter.all      => 'Nenhuma transacção ainda',
      _HistoryFilter.received => 'Nenhum pagamento recebido',
      _HistoryFilter.sent     => 'Nenhum pagamento enviado',
    };

    return Container(
      padding: const EdgeInsets.all(BanzaSpacing.xxl),
      decoration: BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BorderRadius.circular(BanzaRadius.xxl),
        boxShadow:    BanzaShadows.cardElevated,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Layered icon — outer glow ring → inner soft circle → icon
          Container(
            width:  88,
            height: 88,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin:  Alignment.topLeft,
                end:    Alignment.bottomRight,
                colors: [Color(0xFFFCF6F5), Color(0xFFF5EEED)],
              ),
              shape:     BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color:        BanzaColors.wine.withValues(alpha: 0.08),
                  blurRadius:   20,
                  spreadRadius: 0,
                  offset:       const Offset(0, 6),
                ),
              ],
            ),
            child: Center(
              child: Container(
                width:  56,
                height: 56,
                decoration: const BoxDecoration(
                  color: BanzaColors.gray100,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.receipt_long_outlined,
                  size:  26,
                  color: BanzaColors.gray400,
                ),
              ),
            ),
          ),

          const SizedBox(height: BanzaSpacing.xl),

          Text(
            title,
            style: BanzaTextStyles.headingMd.copyWith(fontWeight: FontWeight.w700),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BanzaSpacing.sm),
          Text(
            'As suas actividades aparecerão aqui assim que\ncomeçar a usar a sua carteira.',
            style: BanzaTextStyles.bodyMd.copyWith(
              color:  BanzaColors.gray400,
              height: 1.65,
            ),
            textAlign: TextAlign.center,
          ),

          const SizedBox(height: BanzaSpacing.xl),

          // Decorative divider line
          Container(
            height: 1,
            width:  48,
            decoration: const BoxDecoration(
              color:        BanzaColors.gray200,
              borderRadius: BanzaRadius.fullAll,
            ),
          ),

          const SizedBox(height: BanzaSpacing.lg),

          Text(
            'Envie ou receba pagamentos para começar.',
            style: BanzaTextStyles.bodySm.copyWith(
              color:  BanzaColors.gray400,
              height: 1.5,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Error card
// =============================================================================

class _ErrorCard extends StatelessWidget {
  final String       message;
  final VoidCallback onRetry;

  const _ErrorCard({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzaSpacing.xxl),
      decoration: BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BorderRadius.circular(BanzaRadius.xxl),
        boxShadow:    BanzaShadows.cardElevated,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width:  72,
            height: 72,
            decoration: const BoxDecoration(
              color: BanzaColors.errorBg,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.error_outline_rounded,
              color: BanzaColors.error,
              size:  32,
            ),
          ),
          const SizedBox(height: BanzaSpacing.xl),
          Text(
            'Algo correu mal',
            style: BanzaTextStyles.headingMd.copyWith(fontWeight: FontWeight.w700),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BanzaSpacing.sm),
          Text(
            message,
            style: BanzaTextStyles.bodyMd.copyWith(
              color:  BanzaColors.gray400,
              height: 1.6,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BanzaSpacing.xxl),
          GestureDetector(
            onTap: onRetry,
            child: Container(
              width:  double.infinity,
              height: 52,
              decoration: BoxDecoration(
                gradient:     BanzaGradients.wine,
                borderRadius: BanzaRadius.fieldAll,
                boxShadow: [
                  BoxShadow(
                    color:        BanzaColors.wine.withValues(alpha: 0.30),
                    blurRadius:   16,
                    spreadRadius: -2,
                    offset:       const Offset(0, 4),
                  ),
                ],
              ),
              child: const Center(
                child: Text(
                  'Tentar novamente',
                  style: TextStyle(
                    fontFamily:    'Inter',
                    fontSize:      15,
                    fontWeight:    FontWeight.w600,
                    color:         BanzaColors.white,
                    letterSpacing: 0.1,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Activity card — grouped card wrapper
// =============================================================================

class _ActivityCard extends StatelessWidget {
  final ActivityItem item;
  final bool         isFirst;
  final bool         isLast;

  const _ActivityCard({
    required this.item,
    required this.isFirst,
    required this.isLast,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: BanzaColors.white,
        borderRadius: BorderRadius.vertical(
          top:    Radius.circular(isFirst ? BanzaRadius.xl : 0.0),
          bottom: Radius.circular(isLast  ? BanzaRadius.xl : 0.0),
        ),
        boxShadow: isFirst ? BanzaShadows.card : BanzaShadows.none,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _HistoryRow(item: item),
          if (!isLast)
            const Divider(height: 1, indent: 72, color: BanzaColors.gray100),
        ],
      ),
    );
  }
}

// =============================================================================
// History row
// =============================================================================

class _HistoryRow extends StatelessWidget {
  final ActivityItem item;
  const _HistoryRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final isCredit  = item.isIncoming;
    final amount    = '${isCredit ? "+" : "−"}${formatMinor(item.amountMinor, item.currency)}';
    final title     = item.counterpartyDisplayName ??
                      (item.counterpartyHandle != null
                          ? item.counterpartyHandle!
                          : _typeLabel(item.itemType));
    final subtitle  = _subtitle(item.itemType);
    final time      = _formatTime(item.createdAt);
    final initial   = (item.counterpartyDisplayName
                       ?? item.counterpartyHandle
                       ?? item.itemType)[0];

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md + 2,
      ),
      child: Row(
        children: [
          _Avatar(type: item.itemType, initial: initial, isCredit: isCredit),
          const SizedBox(width: BanzaSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: BanzaTextStyles.bodyMd.copyWith(
                    fontWeight: FontWeight.w600,
                    color:      BanzaColors.gray900,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                ),
              ],
            ),
          ),
          const SizedBox(width: BanzaSpacing.md),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize:       MainAxisSize.min,
            children: [
              Text(
                amount,
                style: BanzaTextStyles.bodyMd.copyWith(
                  color: isCredit
                      ? BanzaColors.success
                      : BanzaColors.gray900,
                  fontWeight:   FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 2),
              Text(
                time,
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _subtitle(String type) {
    if (type == 'P2P_SENT')      return 'Enviado';
    if (type == 'P2P_RECEIVED')  return 'Recebido';
    if (type == 'WALLET_FUNDED') return 'Carregamento';
    return type;
  }

  String _typeLabel(String type) {
    if (type == 'WALLET_FUNDED') return 'Multicaixa';
    return type;
  }

  String _formatTime(DateTime? dt) {
    if (dt == null) return '';
    return BanzaDateFormatter.formatListTime(dt);
  }
}

// =============================================================================
// Avatar
// =============================================================================

class _Avatar extends StatelessWidget {
  final String type;
  final String initial;
  final bool   isCredit;

  const _Avatar({required this.type, required this.initial, required this.isCredit});

  @override
  Widget build(BuildContext context) {
    if (type == 'WALLET_FUNDED' || type == 'WALLET_REVERSED') {
      return Container(
        width:  44,
        height: 44,
        decoration: const BoxDecoration(
          color: BanzaColors.successBg,
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.account_balance_rounded,
          color: BanzaColors.success,
          size:  20,
        ),
      );
    }

    return Container(
      width:  44,
      height: 44,
      decoration: const BoxDecoration(
        gradient: BanzaGradients.wine,
        shape:    BoxShape.circle,
      ),
      child: Center(
        child: Text(
          initial.toUpperCase(),
          style: BanzaTextStyles.headingSm.copyWith(
            color:      BanzaColors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}
