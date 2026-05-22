import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../client/banza_client.dart';
import '../models/payment_link.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';

/// Full-screen payment page for a Banzami payment link.
///
/// Hosts can push this screen when a customer taps a "Pay with Banzami"
/// button. It polls the API every 3 seconds and calls [onSuccess] when paid.
///
/// ```dart
/// Navigator.push(context, MaterialPageRoute(
///   builder: (_) => CheckoutScreen(
///     client: client,
///     slug:   'abc123def456',
///     onSuccess: (_) => Navigator.pop(context),
///   ),
/// ));
/// ```
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({
    super.key,
    required this.client,
    required this.slug,
    this.onSuccess,
    this.onCancel,
    this.logoAssetPath,
  });

  final BanzaClient client;
  final String slug;
  final void Function(PaymentLink link)? onSuccess;
  final VoidCallback? onCancel;

  /// Optional asset path for the logo embedded at the centre of the QR code.
  /// e.g. `'assets/images/banzami_icon.png'`
  final String? logoAssetPath;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  PaymentLink? _link;
  bool _loading = true;
  String? _error;
  bool _paid = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final link = await widget.client.getPaymentLinkBySlug(widget.slug);
      if (!mounted) return;
      setState(() { _link = link; _loading = false; });
      if (link.status == PaymentLinkStatus.active) _startPolling();
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      try {
        final status = await widget.client.getPaymentLinkStatus(widget.slug);
        if (status && mounted) {
          _pollTimer?.cancel();
          setState(() => _paid = true);
          await Future.delayed(const Duration(milliseconds: 1500));
          if (mounted) widget.onSuccess?.call(_link!);
        }
      } catch (_) {}
    });
  }

  void _openApp() {
    final uri = Uri.parse('banzami://pay/link/${widget.slug}');
    launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: BanzaColors.gray700),
          onPressed: () {
            widget.onCancel?.call();
            Navigator.pop(context);
          },
        ),
        title: Text(
          'Banza Pay',
          style: TextStyle(color: BanzaColors.gray900, fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: BanzaColors.wine));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.error_outline, color: BanzaColors.error, size: 48),
            const SizedBox(height: 12),
            const Text('Não foi possível carregar o link de pagamento.',
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () { setState(() { _loading = true; _error = null; }); _load(); },
              child: const Text('Tentar novamente'),
            ),
          ]),
        ),
      );
    }

    final link = _link!;

    if (_paid || link.status == PaymentLinkStatus.used) {
      return _PaidState();
    }
    if (link.status == PaymentLinkStatus.expired ||
        link.status == PaymentLinkStatus.cancelled) {
      return _InvalidState(status: link.status);
    }

    return _ActivePayment(link: link, onOpenApp: _openApp, logoAssetPath: widget.logoAssetPath);
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

class _ActivePayment extends StatelessWidget {
  const _ActivePayment({ required this.link, required this.onOpenApp, this.logoAssetPath });
  final PaymentLink link;
  final VoidCallback onOpenApp;
  final String? logoAssetPath;

  @override
  Widget build(BuildContext context) {
    final deepLink = 'banzami://pay/link/${link.slug}';
    final amountText = link.amountMinor != null
        ? formatMinor(link.amountMinor!, link.currency)
        : 'Valor livre';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(children: [
        // Header card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          decoration: BoxDecoration(
            color: BanzaColors.wine,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(children: [
            Text(
              link.description ?? 'Valor a pagar',
              style: const TextStyle(color: Colors.white70, fontSize: 12,
                  letterSpacing: 0.05),
            ),
            const SizedBox(height: 4),
            Text(amountText,
                style: const TextStyle(color: Colors.white, fontSize: 36,
                    fontWeight: FontWeight.bold)),
          ]),
        ),
        const SizedBox(height: 16),
        // QR + actions
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(.06), blurRadius: 8)],
          ),
          child: Column(children: [
            const Text('Digitalize o código QR com a app Banzami',
                style: TextStyle(fontSize: 13, color: BanzaColors.gray700),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            QrImageView(
              data:                 deepLink,
              version:              QrVersions.auto,
              size:                 200,
              errorCorrectionLevel: QrErrorCorrectLevel.H,
              eyeStyle:        const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color:    BanzaColors.wine,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color:           BanzaColors.gray900,
              ),
              embeddedImage: logoAssetPath != null
                  ? AssetImage(logoAssetPath!)
                  : null,
              embeddedImageStyle: logoAssetPath != null
                  ? const QrEmbeddedImageStyle(size: Size(40, 40))
                  : null,
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: onOpenApp,
                style: ElevatedButton.styleFrom(
                  backgroundColor: BanzaColors.wine,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('Abrir app Banzami', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 12),
            const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              SizedBox(width: 14, height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2,
                      color: BanzaColors.gray400)),
              SizedBox(width: 8),
              Text('A aguardar confirmação…',
                  style: TextStyle(fontSize: 12, color: BanzaColors.gray400)),
            ]),
          ]),
        ),
      ]),
    );
  }
}

class _PaidState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 64, height: 64,
          decoration: BoxDecoration(color: const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(32)),
          child: const Icon(Icons.check, color: Color(0xFF1A7A4A), size: 32),
        ),
        const SizedBox(height: 16),
        const Text('Pagamento confirmado!',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold,
                color: BanzaColors.gray900)),
        const SizedBox(height: 8),
        const Text('Obrigado pelo pagamento.',
            style: TextStyle(color: BanzaColors.gray400)),
      ]),
    );
  }
}

class _InvalidState extends StatelessWidget {
  const _InvalidState({ required this.status });
  final PaymentLinkStatus status;

  @override
  Widget build(BuildContext context) {
    final msg = status == PaymentLinkStatus.expired
        ? 'Este link de pagamento expirou.'
        : 'Este link foi cancelado.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 64, height: 64,
            decoration: BoxDecoration(color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(32)),
            child: const Icon(Icons.close, color: BanzaColors.error, size: 32),
          ),
          const SizedBox(height: 16),
          const Text('Link inválido',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(msg, style: const TextStyle(color: BanzaColors.gray400),
              textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}
