import 'dart:async';
import 'dart:math';

import 'wallet_refresh_bus.dart';

/// CONSUMER-HOME-REALTIME-001 — the ONE shared Consumer Home refresh coordinator
/// for iOS, Android and Web.
///
/// Canonical rule: realtime tells the app WHEN to refresh; the API/Core tells it
/// WHAT is true. This controller NEVER carries or mutates financial state — it
/// only decides when a canonical refetch should happen and pings the existing
/// [WalletRefreshBus], which the Home listens to and answers with a fresh
/// `getBalance()` + activity read. There is no client-side ledger arithmetic.
///
/// It coordinates every trigger through a single path:
///   • an authenticated realtime stream ([ConsumerRealtimeSource]) — a
///     `wallet.changed` (or the first `snapshot`) signals a refresh;
///   • reconnect with bounded exponential backoff + jitter, and an immediate
///     canonical refresh on every (re)connect (so events missed while
///     disconnected are recovered);
///   • a bounded fallback poll while the stream is unavailable, so freshness is
///     never lost and never a per-second storm; stopped once the stream is live;
///   • foreground / tab-visible → an immediate refresh and a reconnect;
///   • all of it debounced/coalesced so a burst of events is one refetch.
///
/// Manual pull-to-refresh stays on the SAME canonical path (the Home's `_load`,
/// which the bus drives) — there is no second refresh implementation.
enum ConsumerRealtimeSignal { snapshot, changed, expired }

/// One realtime connection attempt. `connect()` opens a stream that emits
/// signals and closes on disconnect/expiry/error; the controller owns backoff
/// and re-invokes `connect()`. Platform transports implement this (native
/// authenticated SSE with a Bearer; web same-origin BFF EventSource with the
/// opaque session cookie — no upstream Bearer ever reaches browser JS).
abstract class ConsumerRealtimeSource {
  Stream<ConsumerRealtimeSignal> connect();
  void dispose();
}

class ConsumerHomeRefreshController {
  ConsumerHomeRefreshController({
    required ConsumerRealtimeSource source,
    WalletRefreshBus? bus,
    Duration debounce = const Duration(milliseconds: 300),
    Duration fallbackInterval = const Duration(seconds: 15),
    Duration maxBackoff = const Duration(seconds: 30),
  })  : _source = source,
        _bus = bus ?? WalletRefreshBus.instance,
        _debounceFor = debounce,
        _fallbackInterval = fallbackInterval,
        _maxBackoff = maxBackoff;

  final ConsumerRealtimeSource _source;
  final WalletRefreshBus _bus;
  final Duration _debounceFor;
  final Duration _fallbackInterval;
  final Duration _maxBackoff;
  final Random _rng = Random();

  StreamSubscription<ConsumerRealtimeSignal>? _sub;
  Timer? _debounce;
  Timer? _reconnect;
  Timer? _fallback;
  int _attempt = 0;
  bool _connected = false;
  bool _foreground = true;
  bool _started = false;
  bool _disposed = false;

  // ── lifecycle ──────────────────────────────────────────────────────────────

  /// Begin coordinating. Idempotent. Does NOT itself fetch — the Home performs
  /// its own initial canonical fetch on mount; the first stream `snapshot` then
  /// confirms freshness.
  void start() {
    if (_started || _disposed) return;
    _started = true;
    _foreground = true;
    _connect();
    _armFallback();
  }

  /// App returned to the foreground (native) or the tab became visible (web).
  /// Refresh immediately (the OS/browser may have suspended the stream) and make
  /// sure we are (re)connected.
  void onForeground() {
    if (_disposed) return;
    _foreground = true;
    _refreshNow(); // immediate — recover any payment received while away
    if (_sub == null) {
      _attempt = 0;
      _connect();
    }
    _armFallback();
  }

  /// App went to the background / tab hidden. Drop the stream and stop timers so
  /// we do not hold a dead connection or poll while suspended.
  void onBackground() {
    _foreground = false;
    _reconnect?.cancel();
    _reconnect = null;
    _disarmFallback();
    _sub?.cancel();
    _sub = null;
    _connected = false;
  }

  /// Manual refresh entry point (kept identical to the automatic path).
  void refreshNow() => _refreshNow();

  void dispose() {
    _disposed = true;
    _debounce?.cancel();
    _reconnect?.cancel();
    _disarmFallback();
    _sub?.cancel();
    _source.dispose();
  }

  bool get isConnected => _connected;

  // ── stream ───────────────────────────────────────────────────────────────

  void _connect() {
    if (_disposed || !_foreground) return;
    _sub?.cancel();
    try {
      _sub = _source.connect().listen(
        (sig) {
          switch (sig) {
            case ConsumerRealtimeSignal.snapshot:
              // Connected. Reset backoff, stop the fallback poll, and refresh
              // once now to reconcile anything missed while connecting.
              _connected = true;
              _attempt = 0;
              _disarmFallback();
              _refreshSoon();
              break;
            case ConsumerRealtimeSignal.changed:
              _refreshSoon();
              break;
            case ConsumerRealtimeSignal.expired:
              // The session/token lifetime ended. Stop; the next canonical
              // read (or the app's own 401 handling) drives session recovery.
              _connected = false;
              _sub?.cancel();
              _sub = null;
              break;
          }
        },
        onError: (_) => _scheduleReconnect(),
        onDone: _scheduleReconnect,
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _connected = false;
    _sub?.cancel();
    _sub = null;
    _armFallback(); // keep freshness while the stream is down
    if (_disposed || !_foreground) return;
    // bounded exponential backoff with jitter
    final base = min(_maxBackoff.inMilliseconds, 1000 * (1 << min(_attempt, 5)));
    final jitter = _rng.nextInt(400);
    _attempt++;
    _reconnect?.cancel();
    _reconnect = Timer(Duration(milliseconds: base + jitter), () {
      // On (re)connect we will get a fresh snapshot → an immediate refresh,
      // recovering events missed during the disconnect.
      _connect();
    });
  }

  // ── refresh (debounced, single path through the bus) ──────────────────────

  void _refreshSoon() {
    _debounce?.cancel();
    _debounce = Timer(_debounceFor, _refreshNow);
  }

  void _refreshNow() {
    if (_disposed) return;
    _bus.signal(); // → Home reloads canonical balance + activity (no mutation)
  }

  // ── bounded fallback poll ─────────────────────────────────────────────────

  void _armFallback() {
    if (_disposed || !_foreground) return;
    _fallback ??= Timer.periodic(_fallbackInterval, (_) {
      if (!_connected && _foreground) _refreshNow();
    });
  }

  void _disarmFallback() {
    _fallback?.cancel();
    _fallback = null;
  }
}
