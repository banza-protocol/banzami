/// Banzami Flutter SDK
///
/// Import this single file to access all payment widgets, screens,
/// API client, and models.
///
/// ```dart
/// import 'package:banzami_flutter/banzami_flutter.dart';
///
/// // Production
/// final client = BanzamiClient(
///   apiKey:      'bz_live_...',
///   environment: BanzamiEnvironment.production,
/// );
///
/// // Sandbox (integration testing)
/// final client = BanzamiClient(
///   apiKey:      'bz_test_...',
///   environment: BanzamiEnvironment.sandbox,
/// );
/// ```
library banzami_flutter;

// Client
export 'client/banzami_client.dart';
export 'client/banzami_environment.dart';
export 'client/consumer_public_client.dart';
export 'client/pinned_http_client.dart';
export 'client/api_exception.dart';

// Models
export 'models/activity_item.dart';
export 'models/consumer.dart';
export 'models/fee_references.dart';
export 'models/consumer_pay_link.dart';
export 'models/kyc.dart';
export 'models/merchant.dart';
export 'models/merchant_kyb.dart';
export 'models/merchant_wallet_payment.dart';
export 'models/wallet_balance.dart';
export 'models/transfer.dart';
export 'models/payment_link.dart';
export 'models/payment_request.dart';
export 'models/qr_code.dart';

// Theme
export 'theme/banzami_theme.dart';

// Utils
export 'utils/banzami_toast.dart';
export 'utils/camera_permission.dart';
export 'utils/date_formatter.dart';
export 'utils/money_format.dart';
export 'utils/qr_logo_utils.dart';
export 'utils/qr_parser.dart';
export 'utils/screen_security.dart';

// Widgets
export 'widgets/banzami_button.dart';
export 'widgets/banzami_amount_input.dart';
export 'widgets/banzami_logo.dart';
export 'widgets/banzami_qr_display.dart';
export 'widgets/banzami_qr_scanner.dart';
export 'widgets/banzami_sandbox_banner.dart';
export 'widgets/banzami_transfer_item.dart';
export 'widgets/banzami_components.dart';
export 'widgets/banzami_verified_mark.dart';
export 'widgets/p2p_share_card.dart';

// Screens
export 'screens/home_screen.dart';
export 'screens/send_screen.dart';
export 'screens/confirm_screen.dart';
export 'screens/payment_request_screen.dart';
export 'screens/payment_link_screen.dart';
export 'screens/receipt_screen.dart';
export 'screens/receive_screen.dart';
export 'screens/scan_screen.dart';
export 'screens/split_create_screen.dart';
export 'screens/split_pay_screen.dart';
export 'screens/structured_qr_pay_screen.dart';
