import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../client/api_exception.dart';
import '../client/consumer_public_client.dart';
import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_components.dart';

/// Premium organizer screen for a split payment (P2P-002). The owner enters a
/// group total, opens a split session, and shows a scannable QR for others to
/// pay their share — with live progress that polls the session until the total
/// is collected.
class BanzamiSplitCreateScreen extends StatefulWidget {
  final ConsumerPublicClient client;

  /// The owner/recipient consumer id (collected funds land in their wallet).
  final String ownerId;
  final String currency;
  final bool isSandbox;

  const BanzamiSplitCreateScreen({
    super.key,
    required this.client,
    required this.ownerId,
    this.currency = 'AOA',
    this.isSandbox = false,
  });

  @override
  State<BanzamiSplitCreateScreen> createState() => _BanzamiSplitCreateScreenState();
}

class _BanzamiSplitCreateScreenState extends State<BanzamiSplitCreateScreen> {
  int _totalMinor = 0;
  String? _amountError;
  bool _creating = false;
  String? _error;

  // Active session
  String? _splitId;
  String? _qrPayload;
  int _paidMinor = 0;
  int _totalCollected = 0;
  String _status = 'OPEN';
  Timer? _poll;

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _create() async {
    if (_creating) return;
    if (_totalMinor <= 0) {
      setState(() => _amountError = 'Introduza um total válido');
      return;
    }
    HapticFeedback.mediumImpact();
    setState(() { _creating = true; _error = null; });
    try {
      final s = await widget.client.createSplit(
        ownerId: widget.ownerId,
        totalMinor: _totalMinor,
        currency: widget.currency,
      );
      if (!mounted) return;
      setState(() {
        _creating = false;
        _splitId = s['id'] as String?;
        _qrPayload = s['qr_payload'] as String?;
        _totalCollected = (s['total_minor'] as num?)?.toInt() ?? _totalMinor;
        _paidMinor = 0;
        _status = 'OPEN';
      });
      _startPolling();
    } on BanzamiApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = e.message.isNotEmpty ? e.message : 'Não foi possível criar a divisão.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _creating = false; _error = 'Erro de ligação. Tente novamente.'; });
    }
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) async {
      final id = _splitId;
      if (id == null) return;
      try {
        final s = await widget.client.getSplit(id);
        if (!mounted) return;
        setState(() {
          _paidMinor = (s['paid_minor'] as num?)?.toInt() ?? _paidMinor;
          _status = (s['status'] as String?) ?? _status;
        });
        if (_status != 'OPEN') {
          _poll?.cancel();
          HapticFeedback.heavyImpact();
        }
      } catch (_) {
        /* transient — keep polling */
      }
    });
  }

  Widget _buildForm() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          BanzamiSpacing.xl, 40, BanzamiSpacing.xl, BanzamiSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.groups_rounded, size: 56, color: BanzamiColors.primary),
          const SizedBox(height: BanzamiSpacing.md),
          Text('Dividir uma conta',
              textAlign: TextAlign.center,
              style: BanzamiTextStyles.headingSm.copyWith(
                  color: BanzamiColors.gray900, fontWeight: FontWeight.w700)),
          const SizedBox(height: BanzamiSpacing.sm),
          Text('Define o total. Cada pessoa paga a sua parte ao ler o QR.',
              textAlign: TextAlign.center,
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          const SizedBox(height: BanzamiSpacing.xl),
          BanzamiAmountInput(
            onChanged: (v) => setState(() { _totalMinor = v; _amountError = null; }),
            errorText: _amountError,
          ),
          if (_error != null) ...[
            const SizedBox(height: BanzamiSpacing.md),
            BanzamiErrorBanner(message: _error!),
          ],
          const Spacer(),
          BanzamiPrimaryButton(
            label: _totalMinor > 0
                ? 'Criar divisão de ${formatMinor(_totalMinor, widget.currency)}'
                : 'Criar divisão',
            isLoading: _creating,
            height: 58,
            onPressed: _create,
          ),
        ],
      ),
    );
  }

  Widget _buildActiveSplit() {
    final complete = _status != 'OPEN';
    final remaining = (_totalCollected - _paidMinor).clamp(0, _totalCollected);
    final frac = _totalCollected == 0 ? 0.0 : (_paidMinor / _totalCollected).clamp(0.0, 1.0);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
          BanzamiSpacing.xl, 24, BanzamiSpacing.xl, BanzamiSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (complete) ...[
            const SizedBox(height: BanzamiSpacing.lg),
            Center(
              child: Container(
                width: 88,
                height: 88,
                decoration: const BoxDecoration(
                    gradient: BanzamiGradients.primary, shape: BoxShape.circle),
                child: const Icon(Icons.check_rounded, color: BanzamiColors.white, size: 48),
              ),
            ),
            const SizedBox(height: BanzamiSpacing.lg),
            Text('Divisão concluída!',
                textAlign: TextAlign.center,
                style: BanzamiTextStyles.headingSm.copyWith(
                    color: BanzamiColors.gray900, fontWeight: FontWeight.w700)),
          ] else ...[
            Center(
              child: Container(
                padding: const EdgeInsets.all(BanzamiSpacing.lg),
                decoration: BoxDecoration(
                  color: BanzamiColors.white,
                  borderRadius: BorderRadius.circular(BanzamiRadius.lg),
                  border: Border.all(color: BanzamiColors.gray100),
                ),
                child: QrImageView(
                  data: _qrPayload ?? '',
                  size: 200,
                  eyeStyle: const QrEyeStyle(
                      eyeShape: QrEyeShape.square, color: BanzamiColors.primary),
                  dataModuleStyle: const QrDataModuleStyle(
                      dataModuleShape: QrDataModuleShape.square,
                      color: BanzamiColors.primary),
                ),
              ),
            ),
            const SizedBox(height: BanzamiSpacing.md),
            Text('Mostra este QR ao grupo para pagar',
                textAlign: TextAlign.center,
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          ],
          const SizedBox(height: BanzamiSpacing.xl),
          ClipRRect(
            borderRadius: BorderRadius.circular(BanzamiRadius.full),
            child: LinearProgressIndicator(
              value: frac,
              minHeight: 10,
              backgroundColor: BanzamiColors.gray100,
              valueColor: const AlwaysStoppedAnimation(BanzamiColors.primary),
            ),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${formatMinor(_paidMinor, widget.currency)} recebido',
                  style: BanzamiTextStyles.bodyMd.copyWith(
                      color: BanzamiColors.gray900, fontWeight: FontWeight.w600)),
              Text('de ${formatMinor(_totalCollected, widget.currency)}',
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
            ],
          ),
          if (!complete) ...[
            const SizedBox(height: 4),
            Text('${formatMinor(remaining, widget.currency)} em falta',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          ],
          const SizedBox(height: BanzamiSpacing.xl),
          BanzamiPrimaryButton(
            label: complete ? 'Concluir' : 'Fechar',
            height: 54,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      appBar: const BanzamiAppBar(title: 'Dividir conta', showBack: true),
      body: SafeArea(child: _splitId == null ? _buildForm() : _buildActiveSplit()),
    );
  }
}
