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

    await FirebaseMessaging.instance.requestPermission(
      alert: true, badge: true, sound: true,
    );

    await FirebaseMessaging.instance.getAPNSToken();

    await PushNotificationService.subscribeToTopic('consumer_${session.consumerId}');
    await PushNotificationService.getToken();
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
        displayName:   session.displayName,
        logoAssetPath: 'assets/images/banzami_icon.png',
      ),
      const HistoryScreen(),
      ReceiveHubScreen(
        onViewAll: () => setState(() => _tab = 1),
      ),
      const ProfileScreen(),
    ];

    return Scaffold(
      backgroundColor:     BanzamiColors.offWhite,
      body:                IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: _FloatingTabBar(
        selectedIndex: _tab,
        onTap:         (i) => setState(() => _tab = i),
      ),
    );
  }
}

// =============================================================================
// Floating tab bar
// =============================================================================

class _FloatingTabBar extends StatelessWidget {
  final int                selectedIndex;
  final ValueChanged<int>  onTap;

  const _FloatingTabBar({
    required this.selectedIndex,
    required this.onTap,
  });

  static const _items = [
    (outlinedIcon: Icons.home_outlined,          filledIcon: Icons.home_rounded,          label: 'Início'),
    (outlinedIcon: Icons.history_outlined,        filledIcon: Icons.history_rounded,        label: 'Histórico'),
    (outlinedIcon: Icons.qr_code_outlined,        filledIcon: Icons.qr_code_rounded,        label: 'Receber'),
    (outlinedIcon: Icons.person_outline_rounded,  filledIcon: Icons.person_rounded,         label: 'Perfil'),
  ];

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;

    return Container(
      color: Colors.transparent,
      padding: EdgeInsets.fromLTRB(
        BanzamiSpacing.lg,
        BanzamiSpacing.xs,
        BanzamiSpacing.lg,
        bottom > 0 ? bottom + BanzamiSpacing.sm : BanzamiSpacing.lg,
      ),
      child: Container(
        decoration: BoxDecoration(
          color:        BanzamiColors.white,
          borderRadius: BanzamiRadius.xxlAll,
          boxShadow: [
            BoxShadow(
              color:      BanzamiColors.wineDark.withValues(alpha: 0.08),
              blurRadius: 24,
              spreadRadius: 0,
              offset:     const Offset(0, 4),
            ),
            const BoxShadow(
              color:      Color(0x0A000000),
              blurRadius: 8,
              offset:     Offset(0, 2),
            ),
          ],
        ),
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.xs,
          vertical:   BanzamiSpacing.xs,
        ),
        child: Row(
          children: List.generate(
            _items.length,
            (i) => _TabItem(
              outlinedIcon:  _items[i].outlinedIcon,
              filledIcon:    _items[i].filledIcon,
              label:         _items[i].label,
              index:         i,
              selectedIndex: selectedIndex,
              onTap:         onTap,
            ),
          ),
        ),
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  final IconData         outlinedIcon;
  final IconData         filledIcon;
  final String           label;
  final int              index;
  final int              selectedIndex;
  final ValueChanged<int> onTap;

  const _TabItem({
    required this.outlinedIcon,
    required this.filledIcon,
    required this.label,
    required this.index,
    required this.selectedIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isSelected = index == selectedIndex;

    return Expanded(
      child: GestureDetector(
        onTap:     () => onTap(index),
        behavior:  HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve:    Curves.easeInOut,
          padding:  const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          decoration: BoxDecoration(
            color:        isSelected
                ? BanzamiColors.wine.withValues(alpha: 0.08)
                : Colors.transparent,
            borderRadius: BanzamiRadius.xlAll,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isSelected ? filledIcon : outlinedIcon,
                size:  22,
                color: isSelected ? BanzamiColors.wine : BanzamiColors.gray400,
              ),
              const SizedBox(height: 3),
              Text(
                label,
                style: BanzamiTextStyles.label.copyWith(
                  fontSize: 10,
                  color: isSelected ? BanzamiColors.wine : BanzamiColors.gray400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
