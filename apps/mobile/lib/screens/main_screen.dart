import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/session_service.dart';
import 'history_screen.dart';
import 'profile_screen.dart';

/// Root scaffold with bottom navigation.
/// Tabs: Home (balance + actions) | Histórico | Perfil
class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> with WidgetsBindingObserver {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Lock when app goes to background, unlock via PIN/biometrics on resume.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      context.read<SessionService>().lock();
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionService>().session!;
    final client  = context.read<BanzamiClient>();

    final tabs = [
      BanzamiHomeScreen(
        client:     client,
        consumerId: session.consumerId,
        walletId:   session.walletId,
      ),
      const HistoryScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex:    _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor:  BanzamiColors.white,
        indicatorColor:   BanzamiColors.wine.withValues(alpha: 0.12),
        labelBehavior:    NavigationDestinationLabelBehavior.alwaysShow,
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
            icon:         Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded, color: BanzamiColors.wine),
            label:        'Perfil',
          ),
        ],
      ),
    );
  }
}
