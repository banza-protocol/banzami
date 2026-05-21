import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_components.dart';

/// Final screen of the P2P send flow — shown after a successful transfer.
///
/// The transfer is already complete when this screen appears.
/// "Concluído" pops the entire navigation stack back to [MainScreen]
/// and invokes [onDone] so the home screen can refresh balance and activity.
class BanzamiReceiptScreen extends StatefulWidget {
  final Transfer transfer;
  final String?  ownHandle;
  final void Function(Transfer) onDone;

  const BanzamiReceiptScreen({
    super.key,
    required this.transfer,
    this.ownHandle,
    required this.onDone,
  });

  @override
  State<BanzamiReceiptScreen> createState() => _BanzamiReceiptScreenState();
}

class _BanzamiReceiptScreenState extends State<BanzamiReceiptScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _checkScale;
  late final Animation<double>   _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: BanzaMotion.slow,
    );
    _checkScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: const Interval(0.2, 0.7, curve: Curves.elasticOut)),
    );
    _fade = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.5, curve: Curves.easeOut));

    _ctrl.forward();
    HapticFeedback.mediumImpact();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final amount = formatMinor(widget.transfer.amountMinor, widget.transfer.currency);
    final ts     = widget.transfer.completedAt ?? widget.transfer.createdAt;
    final date   = DateFormat("d 'de' MMMM 'de' y, HH:mm", 'pt').format(ts.toLocal());
    final ref    = widget.transfer.transferId.length >= 8
        ? widget.transfer.transferId.substring(0, 8).toUpperCase()
        : widget.transfer.transferId.toUpperCase();

    return Scaffold(
      backgroundColor: BanzaColors.wineDark,
      body: Container(
        width:  double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(gradient: BanzaGradients.wine),
        child: SafeArea(
          child: FadeTransition(
            opacity: _fade,
            child: Column(
              children: [
                // Top bar
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzaSpacing.lg,
                    vertical:   BanzaSpacing.md,
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(
                          Icons.close_rounded,
                          color: Colors.white54,
                          size:  22,
                        ),
                        onPressed: () {
                          widget.onDone(widget.transfer);
                          Navigator.of(context).popUntil((route) => route.isFirst);
                        },
                      ),
                      const Spacer(),
                      Text(
                        'Comprovativo',
                        style: BanzaTextStyles.headingSm.copyWith(
                          color: BanzaColors.white.withValues(alpha: 0.75),
                        ),
                      ),
                      const Spacer(),
                      const SizedBox(width: 48),
                    ],
                  ),
                ),

                const Spacer(),

                // Animated check mark
                ScaleTransition(
                  scale: _checkScale,
                  child: Container(
                    width:  88,
                    height: 88,
                    decoration: BoxDecoration(
                      color:  BanzaColors.white.withValues(alpha: 0.15),
                      shape:  BoxShape.circle,
                      border: Border.all(
                        color: BanzaColors.white.withValues(alpha: 0.30),
                        width: 1.5,
                      ),
                    ),
                    child: const Icon(
                      Icons.check_rounded,
                      color: BanzaColors.white,
                      size:  48,
                    ),
                  ),
                ),

                const SizedBox(height: BanzaSpacing.lg),

                Text(
                  'Enviado com sucesso',
                  style: BanzaTextStyles.headingSm.copyWith(
                    color: BanzaColors.white.withValues(alpha: 0.80),
                  ),
                ),

                const SizedBox(height: BanzaSpacing.sm),

                Text(
                  amount,
                  style: BanzaTextStyles.monoLg.copyWith(
                    color: BanzaColors.white,
                  ),
                ),

                const SizedBox(height: BanzaSpacing.xs),

                Text(
                  'para @${widget.transfer.recipient}',
                  style: BanzaTextStyles.bodyMd.copyWith(
                    color: BanzaColors.white.withValues(alpha: 0.60),
                  ),
                ),

                const Spacer(),

                // Details card
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
                  child: BanzaGlassCard(
                    child: Column(
                      children: [
                        if (widget.ownHandle != null || widget.transfer.sender.isNotEmpty)
                          _Row(label: 'De', value: '@${widget.ownHandle ?? widget.transfer.sender}'),
                        if (widget.transfer.note != null && widget.transfer.note!.isNotEmpty)
                          _Row(label: 'Nota', value: widget.transfer.note!),
                        _Row(label: 'Data',   value: date),
                        _Row(label: 'Ref',    value: ref),
                        const _Row(label: 'Método', value: 'Saldo Banza', isLast: true),
                      ],
                    ),
                  ),
                ),

                const Spacer(),

                // CTAs
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
                  child: Column(
                    children: [
                      BanzaPrimaryButton(
                        label:           'Concluído',
                        backgroundColor: BanzaColors.white,
                        foregroundColor: BanzaColors.wine,
                        onPressed: () {
                          widget.onDone(widget.transfer);
                          Navigator.of(context).popUntil((route) => route.isFirst);
                        },
                      ),
                      TextButton(
                        onPressed: () {},
                        style: TextButton.styleFrom(
                          foregroundColor: BanzaColors.white.withValues(alpha: 0.55),
                        ),
                        child: const Text('Partilhar comprovativo'),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: BanzaSpacing.lg),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Detail row — white on dark
// =============================================================================

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final bool   isLast;

  const _Row({required this.label, required this.value, this.isLast = false});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: BanzaSpacing.sm),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: BanzaTextStyles.bodySm.copyWith(
                  color: BanzaColors.white.withValues(alpha: 0.55),
                ),
              ),
              const SizedBox(width: BanzaSpacing.md),
              Flexible(
                child: Text(
                  value,
                  style: BanzaTextStyles.bodyMd.copyWith(
                    fontWeight: FontWeight.w600,
                    color:      BanzaColors.white,
                  ),
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
        ),
        if (!isLast)
          Divider(height: 1, color: BanzaColors.white.withValues(alpha: 0.12)),
      ],
    );
  }
}
