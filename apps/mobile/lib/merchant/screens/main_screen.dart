import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/merchant_session_service.dart';
import '../services/payment_notification_service.dart';
import '../../services/push_notification_service.dart';
import 'dashboard_screen.dart';
import 'history_screen.dart';
import 'profile_screen.dart';
import 'qr_screen.dart';

class MerchantMainScreen extends StatefulWidget {
  const MerchantMainScreen({super.key});

  @override
  State<MerchantMainScreen> createState() => _MerchantMainScreenState();
}

class _MerchantMainScreenState extends State<MerchantMainScreen>
    with WidgetsBindingObserver {
  int _tab = 0;
  PaymentNotificationService? _notifSvc;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _startNotifications());
  }

  void _startNotifications() {
    final client  = context.read<BanzamiClient>();
    final session = context.read<MerchantSessionService>().session!;
    _notifSvc = PaymentNotificationService(client)..startPolling();

    PushNotificationService.requestPermission();
    PushNotificationService.subscribeToTopic('merchant_${session.merchantId}');
  }

  @override
  void dispose() {
    _notifSvc?.stopPolling();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _notifSvc?.stopPolling();
      context.read<MerchantSessionService>().lock();
    } else if (state == AppLifecycleState.resumed) {
      _notifSvc?.startPolling();
    }
  }

  @override
  Widget build(BuildContext context) {
    const tabs = [
      DashboardScreen(),
      MerchantHistoryScreen(),
      MerchantQrScreen(),
      MerchantProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex:   _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: BanzamiColors.white,
        indicatorColor:  BanzamiColors.wine.withValues(alpha: 0.12),
        labelBehavior:   NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(
            icon:         Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard_rounded, color: BanzamiColors.wine),
            label:        'Início',
          ),
          NavigationDestination(
            icon:         Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history_rounded, color: BanzamiColors.wine),
            label:        'Histórico',
          ),
          NavigationDestination(
            icon:         Icon(Icons.qr_code_rounded),
            selectedIcon: Icon(Icons.qr_code_rounded, color: BanzamiColors.wine),
            label:        'Receber',
          ),
          NavigationDestination(
            icon:         Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded, color: BanzamiColors.wine),
            label:        'Perfil',
          ),
        ],
      ),
    );
  }
}
