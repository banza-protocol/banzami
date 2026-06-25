import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';

/// Lets the merchant create and manage payment requests — ask a specific
/// @banza payer for a fixed amount, then track and cancel pending ones.
class PaymentRequestsScreen extends StatefulWidget {
  const PaymentRequestsScreen({super.key});

  @override
  State<PaymentRequestsScreen> createState() => _PaymentRequestsScreenState();
}

class _PaymentRequestsScreenState extends State<PaymentRequestsScreen> {
  List<PaymentRequest> _items = [];
  bool    _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    final client = context.read<BanzamiClient>();
    try {
      final page = await client.listPaymentRequests(limit: 50);
      if (mounted) setState(() => _items = page.data);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível carregar os pedidos.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancel(PaymentRequest r) async {
    final client = context.read<BanzamiClient>();
    try {
      await client.cancelPaymentRequest(r.id);
      _load();
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível cancelar.')),
      );
    }
  }

  Future<void> _newRequest() async {
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const _NewRequestScreen()),
    );
    if (created == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: BanzamiAppBar(
        title: 'Pedidos de pagamento',
        actions: [
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _newRequest,
        backgroundColor: BanzamiColors.primary,
        foregroundColor: BanzamiColors.white,
        icon:  const Icon(Icons.add_rounded),
        label: const Text('Novo pedido'),
      ),
      body: RefreshIndicator(
        color: BanzamiColors.primary,
        onRefresh: _load,
        child: _loading && _items.isEmpty
            ? const Center(child: CircularProgressIndicator(color: BanzamiColors.primary))
            : _error != null && _items.isEmpty
                ? _centered(_error!)
                : _items.isEmpty
                    ? _centered('Ainda não há pedidos. Toque em "Novo pedido".')
                    : ListView.separated(
                        padding: const EdgeInsets.all(BanzamiSpacing.lg),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: BanzamiSpacing.sm),
                        itemBuilder: (_, i) => _RequestTile(request: _items[i], onCancel: _cancel),
                      ),
      ),
    );
  }

  Widget _centered(String text) => Center(
        child: Padding(
          padding: const EdgeInsets.all(BanzamiSpacing.xl),
          child: Text(text,
              textAlign: TextAlign.center,
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        ),
      );
}

class _RequestTile extends StatelessWidget {
  final PaymentRequest request;
  final void Function(PaymentRequest) onCancel;
  const _RequestTile({required this.request, required this.onCancel});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (request.status) {
      PaymentRequestStatus.pending   => (BanzamiColors.warning, 'Pendente'),
      PaymentRequestStatus.paid      => (BanzamiColors.success, 'Pago'),
      PaymentRequestStatus.declined  => (BanzamiColors.error,   'Recusado'),
      PaymentRequestStatus.cancelled => (BanzamiColors.gray400, 'Cancelado'),
      PaymentRequestStatus.expired   => (BanzamiColors.gray400, 'Expirado'),
    };

    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: const BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.lgAll,
      ),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(formatMinor(request.amountMinor, request.currency),
                style: BanzamiTextStyles.headingSm),
            const SizedBox(height: 2),
            Text(request.description ?? 'Pedido de pagamento',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ]),
        ),
        const SizedBox(width: BanzamiSpacing.sm),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BanzamiRadius.fieldAll,
          ),
          child: Text(label, style: BanzamiTextStyles.label.copyWith(color: color)),
        ),
        if (request.status.isPending)
          IconButton(
            tooltip: 'Cancelar',
            onPressed: () => onCancel(request),
            icon: const Icon(Icons.close_rounded, size: 18, color: BanzamiColors.gray400),
          ),
      ]),
    );
  }
}

class _NewRequestScreen extends StatefulWidget {
  const _NewRequestScreen();

  @override
  State<_NewRequestScreen> createState() => _NewRequestScreenState();
}

class _NewRequestScreenState extends State<_NewRequestScreen> {
  final _formKey   = GlobalKey<FormState>();
  final _handleCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _descCtrl   = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _handleCtrl.dispose();
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _submitting = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();
    final raw = _amountCtrl.text.trim().replaceAll(',', '.');
    final amountMinor = (double.parse(raw) * 100).round();
    final handle = _handleCtrl.text.trim().replaceAll('@', '');

    try {
      await client.createPaymentRequest(
        requesterId: session.merchantId,
        amountMinor: amountMinor,
        payerHandle: handle.isEmpty ? null : handle,
        description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on BanzamiApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Não foi possível criar o pedido.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: const BanzamiAppBar(title: 'Novo pedido'),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          children: [
            TextFormField(
              controller: _handleCtrl,
              decoration: const InputDecoration(
                labelText: '@banza do pagador',
                hintText: '@maria',
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Indique o @banza do pagador' : null,
            ),
            const SizedBox(height: BanzamiSpacing.md),
            TextFormField(
              controller: _amountCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Valor (Kz)', hintText: '5000'),
              validator: (v) {
                final raw = (v ?? '').trim().replaceAll(',', '.');
                final d = double.tryParse(raw);
                if (d == null || d <= 0) return 'Valor inválido';
                return null;
              },
            ),
            const SizedBox(height: BanzamiSpacing.md),
            TextFormField(
              controller: _descCtrl,
              decoration: const InputDecoration(labelText: 'Descrição (opcional)'),
            ),
            if (_error != null) ...[
              const SizedBox(height: BanzamiSpacing.md),
              Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
            ],
            const SizedBox(height: BanzamiSpacing.xl),
            BanzamiPrimaryButton(
              label: _submitting ? 'A enviar…' : 'Enviar pedido',
              onPressed: _submitting ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
