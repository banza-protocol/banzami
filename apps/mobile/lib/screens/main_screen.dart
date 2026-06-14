import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../branding_assets.dart';
import '../config.dart';
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _startNotifications();
      _refreshProfile();
    });
  }

  Future<void> _startNotifications() async {
    final session = context.read<SessionService>().session!;
    final client  = context.read<ConsumerPublicClient>();
    _notifSvc = TransferNotificationService(client, consumerId: session.consumerId)
      ..startPolling();

    final granted = await PushNotificationService.requestPermission();
    debugPrint('[FCM] permission granted=$granted');
    if (!granted) return;

    // Register foreground handler — shows a tappable BanzamiToast banner.
    // Tapping the banner fires the same onTap callback used for background taps,
    // routing to the correct screen (receipt, payment request, or history).
    if (mounted) {
      final ctx = context;
      PushNotificationService.onForegroundMessage = (msg) {
        final title = msg.notification?.title ?? '';
        final body  = msg.notification?.body ?? '';
        final text  = body.isNotEmpty ? body : title;
        if (text.isNotEmpty && ctx.mounted) {
          BanzamiToast.showInfoTappable(ctx, text, onTap: () {
            PushNotificationService.onTap?.call(msg);
          });
        }
      };
    }

    await PushNotificationService.subscribeConsumer(session.consumerId);
    final token = await PushNotificationService.getToken();
    debugPrint('[FCM] token registered consumerId=${session.consumerId} hasToken=${token != null}');
  }

  Future<void> _refreshProfile() async {
    try {
      final client  = context.read<ConsumerPublicClient>();
      final svc     = context.read<SessionService>();
      final profile = await client.getProfile();
      final badgeStr = profile.verificationBadge;
      final badge = badgeStr == 'CONSUMER' ? VerificationBadgeType.consumer
                  : badgeStr == 'MERCHANT' ? VerificationBadgeType.merchant
                  : null;
      await svc.updateVerificationBadge(badge);
    } catch (_) {
      // Non-fatal — badge stays as stored.
    }
  }

  @override
  void dispose() {
    _notifSvc?.stopPolling();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Locking is handled globally by SecureAppLifecycleGuard.
    // MainScreen only manages its own notification polling here.
    if (state == AppLifecycleState.paused) {
      _notifSvc?.stopPolling();
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
        logoAssetPath: BrandingAssets.icon,
        environment:   AppConfig.isSandbox
            ? BanzamiEnvironment.sandbox
            : BanzamiEnvironment.production,
        onReceive:     () => setState(() => _tab = 2),
      ),
      const HistoryScreen(),
      ReceiveHubScreen(
        onViewAll: () => setState(() => _tab = 1),
      ),
      const ProfileScreen(),
    ];

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: Column(
        children: [
Expanded(child: IndexedStack(index: _tab, children: tabs)),
        ],
      ),
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
              color:      BanzamiColors.primaryDark.withValues(alpha: 0.08),
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
                ? BanzamiColors.primary.withValues(alpha: 0.08)
                : Colors.transparent,
            borderRadius: BanzamiRadius.xlAll,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isSelected ? filledIcon : outlinedIcon,
                size:  22,
                color: isSelected ? BanzamiColors.primary : BanzamiColors.gray400,
              ),
              const SizedBox(height: 3),
              Text(
                label,
                style: BanzamiTextStyles.label.copyWith(
                  fontSize: 10,
                  color: isSelected ? BanzamiColors.primary : BanzamiColors.gray400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
