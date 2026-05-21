import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    HapticFeedback.selectionClick();
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
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── App bar ────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzaSpacing.xl, BanzaSpacing.lg,
                BanzaSpacing.xl, BanzaSpacing.md,
              ),
              child: const Text('Histórico', style: BanzaTextStyles.headingMd),
            ),

            // ── Filter pills ───────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(
                BanzaSpacing.xl, 0, BanzaSpacing.xl, BanzaSpacing.md,
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

            // ── Body ───────────────────────────────────────────────────────
            Expanded(
              child: RefreshIndicator(
                color:     BanzaColors.wine,
                onRefresh: () => _load(refresh: true),
                child:     _buildBody(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _items.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: BanzaColors.wine, strokeWidth: 2),
      );
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
            width:  64,
            height: 64,
            decoration: const BoxDecoration(
              color: BanzaColors.gray100,
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
            switch (_filter) {
              _HistoryFilter.all      => 'Nenhuma transacção ainda',
              _HistoryFilter.received => 'Nenhum pagamento recebido',
              _HistoryFilter.sent     => 'Nenhum pagamento enviado',
            },
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
        BanzaSpacing.xl, 0, BanzaSpacing.xl, BanzaSpacing.page,
      ),
      itemCount: grouped.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        // Load-more sentinel
        if (i == grouped.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(BanzaSpacing.xl),
            child:   Center(child: CircularProgressIndicator(
              color: BanzaColors.wine, strokeWidth: 2,
            )),
          );
        }

        final row = grouped[i];

        // Date header
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

        final item  = row as ActivityItem;
        final prev  = i > 0 ? grouped[i - 1] : null;
        final next  = i < grouped.length - 1 ? grouped[i + 1] : null;
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
              _HistoryRow(item: item),
              if (!isLast)
                const Divider(height: 1, indent: 68, color: BanzaColors.gray100),
            ],
          ),
        );
      },
    );
  }
}

// =============================================================================
// History row — richer than BanzaTransferItem
// =============================================================================

class _HistoryRow extends StatelessWidget {
  final ActivityItem item;
  const _HistoryRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final isCredit = item.isIncoming;
    final amount   = '${isCredit ? "+" : "−"}${formatMinor(item.amountMinor, item.currency)}';
    final title    = item.counterpartyDisplayName ??
                     (item.counterpartyHandle != null
                         ? '@${item.counterpartyHandle}'
                         : _typeLabel(item.itemType));
    final subtitle = _subtitle(item.itemType);
    final time     = _formatTime(item.createdAt);
    final initial  = (item.counterpartyDisplayName ?? item.counterpartyHandle ?? item.itemType)[0];

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Row(
        children: [
          // Avatar
          _Avatar(type: item.itemType, initial: initial, isCredit: isCredit),
          const SizedBox(width: BanzaSpacing.md),
          // Text
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
                  maxLines:  1,
                  overflow:  TextOverflow.ellipsis,
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
          // Amount + time
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize:       MainAxisSize.min,
            children: [
              Text(
                amount,
                style: BanzaTextStyles.bodyMd.copyWith(
                  color:      isCredit ? BanzaColors.success : BanzaColors.gray900,
                  fontWeight: FontWeight.w700,
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
    if (type == 'P2P_SENT')     return 'Enviado';
    if (type == 'P2P_RECEIVED') return 'Recebido';
    if (type == 'WALLET_FUNDED') return 'Carregamento';
    return type;
  }

  String _typeLabel(String type) {
    if (type == 'WALLET_FUNDED') return 'Multicaixa';
    return type;
  }

  String _formatTime(DateTime? dt) {
    if (dt == null) return '';
    final now  = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) {
      return '${_pad(dt.hour)}:${_pad(dt.minute)}';
    } else if (diff.inDays == 1) {
      return 'Ontem';
    }
    return '${dt.day}/${dt.month}';
  }

  String _pad(int n) => n.toString().padLeft(2, '0');
}

class _Avatar extends StatelessWidget {
  final String type;
  final String initial;
  final bool   isCredit;

  const _Avatar({required this.type, required this.initial, required this.isCredit});

  @override
  Widget build(BuildContext context) {
    if (type == 'WALLET_FUNDED') {
      return Container(
        width:  44,
        height: 44,
        decoration: const BoxDecoration(
          color: BanzaColors.successBg,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.account_balance_rounded, color: BanzaColors.success, size: 20),
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
        duration: const Duration(milliseconds: 180),
        curve:    Curves.easeInOut,
        padding:  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color:        selected ? BanzaColors.wine : BanzaColors.white,
          borderRadius: BanzaRadius.fullAll,
          boxShadow:    selected ? [] : BanzaShadows.card,
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
