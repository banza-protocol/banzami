import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

enum _HistoryFilter { all, received, sent }

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final List<ActivityItem> _items = [];
  String?        _cursor;
  bool           _loading = false;
  bool           _hasMore = true;
  String?        _error;
  _HistoryFilter _filter  = _HistoryFilter.all;

  static const int _pageSize = 50;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({ bool refresh = false }) async {
    if (_loading) return;
    if (!_hasMore && !refresh) return;

    setState(() { _loading = true; _error = null; });
    if (refresh) { _items.clear(); _cursor = null; _hasMore = true; }

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
    } catch (_) {
      setState(() => _error = 'Não foi possível carregar o histórico.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _switchFilter(_HistoryFilter f) async {
    if (f == _filter) return;
    setState(() { _filter = f; _items.clear(); _cursor = null; _hasMore = true; });
    await _load();
  }

  List<dynamic> _grouped(List<ActivityItem> items) {
    final now       = DateTime.now();
    final today     = DateUtils.dateOnly(now);
    final yesterday = today.subtract(const Duration(days: 1));

    final grouped = <dynamic>[];
    String? lastKey;

    for (final item in items) {
      final date = DateUtils.dateOnly(item.createdAt);
      final String key;
      if (date == today) {
        key = 'Hoje';
      } else if (date == yesterday) {
        key = 'Ontem';
      } else {
        key = DateFormat('d MMM yyyy', 'pt_PT').format(date);
      }

      if (key != lastKey) {
        grouped.add(key);
        lastKey = key;
      }
      grouped.add(item);
    }

    return grouped;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      appBar: AppBar(
        backgroundColor:        BanzaColors.offWhite,
        foregroundColor:        BanzaColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0,
        title: const Text('Histórico', style: BanzaTextStyles.headingMd),
      ),
      body: RefreshIndicator(
        color:     BanzaColors.wine,
        onRefresh: () => _load(refresh: true),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzaSpacing.lg, 0, BanzaSpacing.lg, BanzaSpacing.md,
              ),
              child: Row(
                children: [
                  _FilterPill(
                    label:    'Todas',
                    selected: _filter == _HistoryFilter.all,
                    onTap:    () => _switchFilter(_HistoryFilter.all),
                  ),
                  const SizedBox(width: BanzaSpacing.sm),
                  _FilterPill(
                    label:    'Recebidas',
                    selected: _filter == _HistoryFilter.received,
                    onTap:    () => _switchFilter(_HistoryFilter.received),
                  ),
                  const SizedBox(width: BanzaSpacing.sm),
                  _FilterPill(
                    label:    'Enviadas',
                    selected: _filter == _HistoryFilter.sent,
                    onTap:    () => _switchFilter(_HistoryFilter.sent),
                  ),
                ],
              ),
            ),

            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzaColors.wine));
    }

    if (_error != null && _items.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline_rounded, color: BanzaColors.error, size: 40),
          const SizedBox(height: BanzaSpacing.md),
          Text(_error!, style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400)),
          const SizedBox(height: BanzaSpacing.lg),
          TextButton(onPressed: _load, child: const Text('Tentar novamente')),
        ]),
      );
    }

    if (_items.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64, height: 64,
            decoration: const BoxDecoration(
              color: BanzaColors.gray200,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.receipt_long_outlined,
              size:  28,
              color: BanzaColors.gray400,
            ),
          ),
          const SizedBox(height: BanzaSpacing.md),
          Text(
            _filter == _HistoryFilter.all
                ? 'Nenhuma transacção ainda'
                : _filter == _HistoryFilter.received
                    ? 'Nenhum pagamento recebido'
                    : 'Nenhum pagamento enviado',
            style: BanzaTextStyles.headingSm,
          ),
          const SizedBox(height: BanzaSpacing.xs),
          Text(
            'As suas actividades aparecerão aqui',
            style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
          ),
        ]),
      );
    }

    final grouped = _grouped(_items);

    return ListView.builder(
      padding:   const EdgeInsets.fromLTRB(
        BanzaSpacing.lg, 0, BanzaSpacing.lg, BanzaSpacing.page,
      ),
      itemCount: grouped.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == grouped.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(BanzaSpacing.xl),
            child:   Center(child: CircularProgressIndicator(color: BanzaColors.wine)),
          );
        }

        final row = grouped[i];

        if (row is String) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(
              BanzaSpacing.xs, BanzaSpacing.lg, BanzaSpacing.xs, BanzaSpacing.sm,
            ),
            child: Text(
              row,
              style: BanzaTextStyles.label.copyWith(
                color:         BanzaColors.gray400,
                letterSpacing: 0.4,
              ),
            ),
          );
        }

        final item = row as ActivityItem;
        final prev = i > 0 ? grouped[i - 1] : null;
        final next = i < grouped.length - 1 ? grouped[i + 1] : null;

        final isFirst = prev == null || prev is String;
        final isLast  = next == null || next is String;

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
              BanzaTransferItem(item: item),
              if (!isLast)
                const Divider(height: 1, indent: 68, color: BanzaColors.gray200),
            ],
          ),
        );
      },
    );
  }
}

// =============================================================================
// Filter pill
// =============================================================================

class _FilterPill extends StatelessWidget {
  final String       label;
  final bool         selected;
  final VoidCallback onTap;

  const _FilterPill({
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
        padding:  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color:        selected ? BanzaColors.wine : BanzaColors.white,
          borderRadius: BanzaRadius.fullAll,
          boxShadow:    selected ? BanzaShadows.none : BanzaShadows.card,
        ),
        child: Text(
          label,
          style: BanzaTextStyles.label.copyWith(
            color: selected ? BanzaColors.white : BanzaColors.gray600,
          ),
        ),
      ),
    );
  }
}
