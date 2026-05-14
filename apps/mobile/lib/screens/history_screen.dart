import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/session_service.dart';

/// Full paginated transfer history for the current consumer.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final List<Transfer> _transfers = [];
  String? _cursor;
  bool    _loading     = false;
  bool    _hasMore     = true;
  String? _error;

  static const int _pageSize = 30;

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

    final svc    = context.read<SessionService>();
    final client = context.read<BanzamiClient>();

    try {
      final page = await client.listTransfers(
        consumerId: svc.session!.consumerId,
        limit:      _pageSize,
        cursor:     _cursor,
      );
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

  @override
  Widget build(BuildContext context) {
    final consumerId = context.read<SessionService>().session!.consumerId;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title: const Text('Histórico', style: BanzamiTextStyles.headingSm),
        actions: [
          IconButton(
            icon:      const Icon(Icons.refresh_rounded),
            onPressed: () => _load(refresh: true),
          ),
        ],
      ),
      body: RefreshIndicator(
        color:     BanzamiColors.wine,
        onRefresh: () => _load(refresh: true),
        child: _buildBody(consumerId),
      ),
    );
  }

  Widget _buildBody(String consumerId) {
    if (_loading && _transfers.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.wine));
    }
    if (_error != null && _transfers.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: 12),
        Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        const SizedBox(height: 16),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
      ]));
    }
    if (_transfers.isEmpty) {
      return Center(child: Text(
        'Nenhuma transacção ainda.',
        style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
      ));
    }

    return ListView.separated(
      padding:           const EdgeInsets.symmetric(vertical: 8),
      itemCount:         _transfers.length + (_hasMore ? 1 : 0),
      separatorBuilder:  (_, __) => const Divider(height: 1, indent: 72),
      itemBuilder: (context, i) {
        if (i == _transfers.length) {
          // Load-more trigger
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(24),
            child:   Center(child: CircularProgressIndicator(color: BanzamiColors.wine)),
          );
        }
        return BanzamiTransferItem(
          transfer:          _transfers[i],
          currentConsumerId: consumerId,
        );
      },
    );
  }
}
