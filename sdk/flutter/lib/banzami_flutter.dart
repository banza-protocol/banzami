/// Banzami Flutter SDK
///
/// Import this single file to access all payment widgets, screens,
/// API client, and models.
///
/// ```dart
/// import 'package:banzami_flutter/banzami_flutter.dart';
///
/// // The app's own signed-in session — a merchant/consumer credential the
/// // user authenticated for, never a Developer Platform secret key.
/// final client = BanzamiClient(
///   jwt:         session.jwt,
///   environment: BanzamiEnvironment.sandbox,
/// );
/// ```
///
/// ## Credentials — what may live in a mobile binary
///
/// This package is Banzami's **own** mobile application framework (the Consumer
/// and Business apps depend on it by path). Its `apiKey` is the credential the
/// signed-in merchant's app already holds for itself, exchanged for a session
/// JWT — not a Developer Platform key belonging to a third party.
///
/// A Developer Platform **secret** key (`bz_test_sk_…`, `bz_live_sk_…`) must
/// NEVER be compiled into a mobile application. Anyone who can download the app
/// can read the binary, and that key can move money. The examples here used to
/// show exactly that, which is why this note exists.
///
/// The correct shape for a third-party mobile integration is:
///
/// ```text
///   Flutter app ──publishable key──▶ Banzami   (read a payment, its status)
///        │
///        └──────▶ your backend ──secret key──▶ Banzami   (create, refund, transfer)
/// ```
///
/// A publishable key (`bz_test_pk_…`) is safe to ship in an app: the operator
/// restricts it to read scopes, so it cannot move money even if extracted.

library banzami_flutter;

// Client
export 'client/banzami_client.dart';
export 'client/merchant_session_tokens.dart';
export 'client/banzami_environment.dart';
export 'client/consumer_public_client.dart';
export 'client/pinned_http_client.dart';
export 'client/api_exception.dart';

// Models
export 'models/activity_item.dart';
export 'models/consumer.dart';
// models/fee_references.dart is deliberately gone.
//
// It exported BusinessCategory and PricingProfile enums, documented as
// "references only ... an unknown wire value maps to unknown and resolves to a
// zero fee". No method in this SDK ever took either type, and the operator no
// longer accepts a pricing selector on any public surface — naming a rule
// dimension is naming the rate. Nothing in this repository imported them.
export 'models/consumer_pay_link.dart';
export 'models/kyc.dart';
export 'models/merchant.dart';
export 'models/merchant_kyb.dart';
export 'models/merchant_wallet_payment.dart';
export 'models/wallet_balance.dart';
export 'models/transfer.dart';
export 'models/payment_link.dart';
export 'models/receipt.dart';
export 'models/project_link_code.dart';
export 'models/collection.dart';
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
export 'utils/qr_scheme.dart';
export 'utils/screen_security.dart';

// Widgets
export 'widgets/banzami_button.dart';
export 'widgets/banzami_amount_input.dart';
export 'widgets/money_amount.dart';
export 'widgets/money_input.dart';
export 'widgets/banzami_logo.dart';
export 'widgets/banzami_qr.dart';
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
export 'screens/structured_qr_pay_screen.dart';
