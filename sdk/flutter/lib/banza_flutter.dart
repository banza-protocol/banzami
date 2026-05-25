/// Banzami Flutter SDK
///
/// Import this single file to access all payment widgets, screens,
/// API client, and models.
///
/// ```dart
/// import 'package:banza_flutter/banza_flutter.dart';
///
/// // Production
/// final client = BanzaClient(
///   apiKey:      'bz_live_...',
///   environment: BanzaEnvironment.production,
/// );
///
/// // Sandbox (integration testing)
/// final client = BanzaClient(
///   apiKey:      'bz_test_...',
///   environment: BanzaEnvironment.sandbox,
/// );
/// ```
library banza_flutter;

// Client
export 'client/banza_client.dart';
export 'client/banza_environment.dart';
export 'client/consumer_public_client.dart';
export 'client/pinned_http_client.dart';
export 'client/api_exception.dart';

// Models
export 'models/activity_item.dart';
export 'models/consumer.dart';
export 'models/consumer_pay_link.dart';
export 'models/merchant.dart';
export 'models/wallet_balance.dart';
export 'models/transfer.dart';
export 'models/payment_link.dart';
export 'models/qr_code.dart';

// Theme
export 'theme/banza_theme.dart';

// Utils
export 'utils/money_format.dart';
export 'utils/pdf_receipt_generator.dart';
export 'utils/screen_security.dart';

// Widgets
export 'widgets/banza_button.dart';
export 'widgets/banza_amount_input.dart';
export 'widgets/banza_qr_display.dart';
export 'widgets/banza_qr_scanner.dart';
export 'widgets/banza_transfer_item.dart';
export 'widgets/banza_components.dart';
export 'widgets/p2p_share_card.dart';

// Screens
export 'screens/home_screen.dart';
export 'screens/send_screen.dart';
export 'screens/confirm_screen.dart';
export 'screens/payment_request_screen.dart';
export 'screens/receipt_screen.dart';
export 'screens/receive_screen.dart';
export 'screens/scan_screen.dart';
export 'screens/checkout_screen.dart';
