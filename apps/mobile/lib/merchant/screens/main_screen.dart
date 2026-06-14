import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

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
  static const int _kGraceSeconds = 30;

  int       _tab      = 0;
  DateTime? _pausedAt;
  PaymentNotificationService? _notifSvc;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _startNotifications());
  }

  Future<void> _startNotifications() async {
    final client  = context.read<BanzamiClient>();
    final session = context.read<MerchantSessionService>().session!;
    _notifSvc = PaymentNotificationService(client)..startPolling();

    final granted = await PushNotificationService.requestPermission();
    if (!granted) return;

    await PushNotificationService.subscribeToTopic('merchant_${session.merchantId}');
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
      _pausedAt = DateTime.now();
      debugPrint('[APP-LOCK] merchant pausedAt=${_pausedAt?.toIso8601String()}');
      // Lock decision is deferred to resumed to allow a grace period.
    } else if (state == AppLifecycleState.resumed) {
      _notifSvc?.startPolling();
      final elapsed = _pausedAt != null
          ? DateTime.now().difference(_pausedAt!).inSeconds
          : _kGraceSeconds + 1;
      _pausedAt = null;
      debugPrint('[APP-LOCK] merchant resumedAfterSeconds=$elapsed requireUnlock=${elapsed >= _kGraceSeconds}');
      if (elapsed >= _kGraceSeconds) {
        context.read<MerchantSessionService>().lock();
      }
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
// Floating tab bar — identical pattern to consumer app
// =============================================================================

class _FloatingTabBar extends StatelessWidget {
  final int               selectedIndex;
  final ValueChanged<int> onTap;

  const _FloatingTabBar({
    required this.selectedIndex,
    required this.onTap,
  });

  static const _items = [
    (outlinedIcon: Icons.dashboard_outlined,      filledIcon: Icons.dashboard_rounded,      label: 'Início'),
    (outlinedIcon: Icons.history_outlined,         filledIcon: Icons.history_rounded,         label: 'Histórico'),
    (outlinedIcon: Icons.qr_code_outlined,         filledIcon: Icons.qr_code_rounded,         label: 'Receber'),
    (outlinedIcon: Icons.person_outline_rounded,   filledIcon: Icons.person_rounded,          label: 'Perfil'),
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
              color:        BanzamiColors.primaryDark.withValues(alpha: 0.08),
              blurRadius:   24,
              spreadRadius: 0,
              offset:       const Offset(0, 4),
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
  final IconData          outlinedIcon;
  final IconData          filledIcon;
  final String            label;
  final int               index;
  final int               selectedIndex;
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
        onTap:    () => onTap(index),
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration:    const Duration(milliseconds: 200),
          curve:       Curves.easeInOut,
          padding:     const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          decoration:  BoxDecoration(
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
                  color:    isSelected ? BanzamiColors.primary : BanzamiColors.gray400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
