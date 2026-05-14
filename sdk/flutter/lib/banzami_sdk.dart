/// Banzami Flutter SDK
///
/// Import this single file to access all payment widgets, screens,
/// API client, and models.
///
/// ```dart
/// import 'package:banzami_sdk/banzami_sdk.dart';
///
/// final client = BanzamiClient(
///   baseUrl: 'https://api.banzami.ao',
///   apiKey:  'bz_live_...',
/// );
/// ```
library banzami_sdk;

// Client
export 'client/banzami_client.dart';
export 'client/consumer_public_client.dart';
export 'client/api_exception.dart';

// Models
export 'models/consumer.dart';
export 'models/merchant.dart';
export 'models/wallet_balance.dart';
export 'models/transfer.dart';
export 'models/payment_link.dart';
export 'models/qr_code.dart';

// Theme
export 'theme/banzami_theme.dart';

// Utils
export 'utils/money_format.dart';

// Widgets
export 'widgets/banzami_button.dart';
export 'widgets/banzami_amount_input.dart';
export 'widgets/banzami_qr_display.dart';
export 'widgets/banzami_qr_scanner.dart';
export 'widgets/banzami_transfer_item.dart';

// Screens
export 'screens/home_screen.dart';
export 'screens/send_screen.dart';
export 'screens/receive_screen.dart';
export 'screens/scan_screen.dart';
export 'screens/checkout_screen.dart';
