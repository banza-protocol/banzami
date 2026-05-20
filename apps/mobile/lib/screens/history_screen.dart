import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/session_service.dart';

enum _HistoryFilter { all, received, sent }

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final List<Transfer> _transfers = [];
  String?        _cursor;
  bool           _loading  = false;
  bool           _hasMore  = true;
  String?        _error;
  _HistoryFilter _filter   = _HistoryFilter.all;

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
    if (refresh) { _transfers.clear(); _cursor = null; _hasMore = true; }

    final client = context.read<ConsumerPublicClient>();

    try {
      final page = await client.listTransfers(limit: _pageSize, cursor: _cursor);
      setState(() {
        _transfers.addAll(page.data);
        _cursor  = page.nextCursor;
        _hasMore = page.nextCursor != null;
      });
    } catch (_) {
      setState(() => _error = 'Não foi possível carregar o histórico.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Transfer> _filtered(String consumerId) {
    return switch (_filter) {
      _HistoryFilter.received => _transfers.where((t) => t.recipientId == consumerId).toList(),
      _HistoryFilter.sent     => _transfers.where((t) => t.senderId    == consumerId).toList(),
      _HistoryFilter.all      => List.of(_transfers),
    };
  }

  // Returns a list of [String] (date headers) and [Transfer] (items) in order.
  List<dynamic> _grouped(List<Transfer> transfers) {
    final now       = DateTime.now();
    final today     = DateUtils.dateOnly(now);
    final yesterday = today.subtract(const Duration(days: 1));

    final items = <dynamic>[];
    String? lastKey;

    for (final t in transfers) {
      final date = DateUtils.dateOnly(t.createdAt);
      final String key;
      if (date == today) {
        key = 'Hoje';
      } else if (date == yesterday) {
        key = 'Ontem';
      } else {
        key = DateFormat('d MMM yyyy', 'pt_PT').format(date);
      }

      if (key != lastKey) {
        items.add(key);
        lastKey = key;
      }
      items.add(t);
    }

    return items;
  }

  @override
  Widget build(BuildContext context) {
    final consumerId = context.read<SessionService>().session!.consumerId;

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
            // Filter tabs
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzaSpacing.lg, 0, BanzaSpacing.lg, BanzaSpacing.md,
              ),
              child: Row(
                children: [
                  _FilterPill(
                    label:    'Todas',
                    selected: _filter == _HistoryFilter.all,
                    onTap:    () => setState(() => _filter = _HistoryFilter.all),
                  ),
                  const SizedBox(width: BanzaSpacing.sm),
                  _FilterPill(
                    label:    'Recebidas',
                    selected: _filter == _HistoryFilter.received,
                    onTap:    () => setState(() => _filter = _HistoryFilter.received),
                  ),
                  const SizedBox(width: BanzaSpacing.sm),
                  _FilterPill(
                    label:    'Enviadas',
                    selected: _filter == _HistoryFilter.sent,
                    onTap:    () => setState(() => _filter = _HistoryFilter.sent),
                  ),
                ],
              ),
            ),

            Expanded(child: _buildBody(consumerId)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(String consumerId) {
    if (_loading && _transfers.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzaColors.wine));
    }

    if (_error != null && _transfers.isEmpty) {
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

    final filtered = _filtered(consumerId);

    if (filtered.isEmpty) {
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

    final grouped = _grouped(filtered);

    return ListView.builder(
      padding:   const EdgeInsets.fromLTRB(
        BanzaSpacing.lg, 0, BanzaSpacing.lg, BanzaSpacing.page,
      ),
      itemCount: grouped.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        // Load more sentinel
        if (i == grouped.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(BanzaSpacing.xl),
            child:   Center(child: CircularProgressIndicator(color: BanzaColors.wine)),
          );
        }

        final item = grouped[i];

        // Date header
        if (item is String) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(
              BanzaSpacing.xs, BanzaSpacing.lg, BanzaSpacing.xs, BanzaSpacing.sm,
            ),
            child: Text(
              item,
              style: BanzaTextStyles.label.copyWith(
                color:         BanzaColors.gray400,
                letterSpacing: 0.4,
              ),
            ),
          );
        }

        final transfer = item as Transfer;

        // Determine card borders (round top/bottom of first/last in each group)
        final prev = i > 0 ? grouped[i - 1] : null;
        final next = i < grouped.length - 1 ? grouped[i + 1] : null;

        final isFirst = prev == null || prev is String;
        final isLast  = next == null || next is String;

        final topRadius    = isFirst ? BanzaRadius.xl : 0.0;
        final bottomRadius = isLast  ? BanzaRadius.xl : 0.0;

        return Container(
          decoration: BoxDecoration(
            color: BanzaColors.white,
            borderRadius: BorderRadius.vertical(
              top:    Radius.circular(topRadius),
              bottom: Radius.circular(bottomRadius),
            ),
            boxShadow: isFirst ? BanzaShadows.card : BanzaShadows.none,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BanzaTransferItem(
                transfer:          transfer,
                currentConsumerId: consumerId,
              ),
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
