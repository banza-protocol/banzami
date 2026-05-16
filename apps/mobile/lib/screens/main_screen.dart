import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import 'package:firebase_messaging/firebase_messaging.dart';

import '../services/push_notification_service.dart';
import '../services/session_service.dart';
import '../services/transfer_notification_service.dart';
import 'history_screen.dart';
import 'profile_screen.dart';
import 'receive_hub_screen.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> with WidgetsBindingObserver {
  int _tab = 0;
  TransferNotificationService? _notifSvc;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _startNotifications());
  }

  Future<void> _startNotifications() async {
    final session = context.read<SessionService>().session!;
    final client  = context.read<ConsumerPublicClient>();
    _notifSvc = TransferNotificationService(client, consumerId: session.consumerId)
      ..startPolling();

    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true, badge: true, sound: true,
    );
    debugPrint('FCM permission status: ${settings.authorizationStatus}');

    final apns = await FirebaseMessaging.instance.getAPNSToken();
    debugPrint('FCM APNs token (immediate): $apns');

    await PushNotificationService.subscribeToTopic('consumer_${session.consumerId}');
    final token = await PushNotificationService.getToken();
    debugPrint('FCM TOKEN (consumer): $token');
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
      context.read<SessionService>().lock();
    } else if (state == AppLifecycleState.resumed) {
      _notifSvc?.startPolling();
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionService>().session!;
    final client  = context.read<ConsumerPublicClient>();

    final tabs = [
      BanzamiHomeScreen(
        client:        client,
        consumerId:    session.consumerId,
        handle:        session.handle,
        logoAssetPath: 'assets/images/banzami_icon_1024.png',
      ),
      const HistoryScreen(),
      ReceiveHubScreen(
        onViewAll: () => setState(() => _tab = 1),
      ),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex:         _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor:       BanzamiColors.white,
        indicatorColor:        BanzamiColors.wine.withValues(alpha: 0.12),
        labelBehavior:         NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(
            icon:         Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded, color: BanzamiColors.wine),
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
