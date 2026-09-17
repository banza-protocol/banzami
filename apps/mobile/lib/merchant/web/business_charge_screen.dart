import 'package:banzami_flutter/banzami_flutter.dart' hide Consumer;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'merchant_web_session.dart';

const _payBase = 'https://pay.banzami.com';

/// Criar cobrança (Create Charge) — a canonical payment link + QR in the one
/// Banzami QR universe. The payer settles it through the normal Consumer flow.
class BusinessChargeScreen extends StatefulWidget {
  const BusinessChargeScreen({super.key});
  @override
  State<BusinessChargeScreen> createState() => _BusinessChargeScreenState();
}

class _BusinessChargeScreenState extends State<BusinessChargeScreen> {
  final _amount = TextEditingController();
  final _desc = TextEditingController();
  bool _busy = false;
  String? _error;
  PaymentLink? _link;

  String get _payUrl => '$_payBase/${_link?.slug ?? ''}';

  Future<void> _create() async {
    final session = context.read<MerchantWebSession>();
    final merchant = session.merchant;
    final walletId = session.walletId;
    if (merchant == null || walletId == null) {
      setState(() => _error = 'A sua carteira ainda não está pronta.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      final kz = int.tryParse(_amount.text.trim().replaceAll(' ', ''));
      _link = await session.client.createPaymentLink(
        merchantId: merchant.id,
        walletId: walletId,
        amountMinor: (kz != null && kz > 0) ? kz * 100 : null,
        description: _desc.text.trim().isEmpty ? null : _desc.text.trim(),
      );
    } catch (_) {
      _error = 'Não foi possível criar a cobrança. Tente novamente.';
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  void dispose() {
    _amount.dispose();
    _desc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(backgroundColor: BanzamiColors.offWhite, foregroundColor: BanzamiColors.gray900, elevation: 0, title: const Text('Criar cobrança')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: _link == null ? _form() : _result(_link!),
          ),
        ),
      ),
    );
  }

  Widget _form() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Align(alignment: Alignment.centerLeft, child: Text('Montante (opcional)', style: TextStyle(fontSize: 13, color: BanzamiColors.gray400, fontWeight: FontWeight.w600))),
        const SizedBox(height: 6),
        Semantics(
          label: 'Montante',
          textField: true,
          child: TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(hintText: '0', suffixText: 'Kz', border: OutlineInputBorder()),
          ),
        ),
        const SizedBox(height: 16),
        const Align(alignment: Alignment.centerLeft, child: Text('Descrição (opcional)', style: TextStyle(fontSize: 13, color: BanzamiColors.gray400, fontWeight: FontWeight.w600))),
        const SizedBox(height: 6),
        Semantics(
          label: 'Descrição',
          textField: true,
          child: TextField(
            controller: _desc,
            decoration: const InputDecoration(hintText: 'Ex: jantar', border: OutlineInputBorder()),
          ),
        ),
        if (_error != null) ...[const SizedBox(height: 12), Text(_error!, style: const TextStyle(color: BanzamiColors.error))],
        const SizedBox(height: 24),
        FilledButton(
          onPressed: _busy ? null : _create,
          style: FilledButton.styleFrom(backgroundColor: BanzamiColors.primary, padding: const EdgeInsets.symmetric(vertical: 16)),
          child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Gerar cobrança', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        ),
      ],
    );
  }

  Widget _result(PaymentLink link) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0xFFEEE4E4))),
          child: BanzamiQrDisplay(payload: _payUrl, size: 240),
        ),
        const SizedBox(height: 16),
        if (link.amountMinor != null) MoneyAmount(link.amountMinor!, currency: link.currency, size: MoneySize.lg, tone: MoneyTone.brand),
        if (link.description != null) ...[const SizedBox(height: 4), Text(link.description!, style: const TextStyle(color: BanzamiColors.gray400))],
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: () {
            Clipboard.setData(ClipboardData(text: _payUrl));
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ligação copiada')));
          },
          icon: const Icon(Icons.copy_rounded, size: 18),
          label: const Text('Copiar ligação'),
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: () => setState(() { _link = null; _amount.clear(); _desc.clear(); }), child: const Text('Criar outra')),
      ],
    );
  }
}
