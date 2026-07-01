// Backwards-compatible money helpers — thin wrappers over the Money Engine
// (lib/money/money_engine.dart), which is the single source of truth. Prefer
// importing the engine directly for new code.

import '../money/money_engine.dart';

export '../money/money_engine.dart';

/// Format integer minor units for display: "50 000 Kz" / "50 000,50 Kz".
/// Decimal-aware — delegates to the Money Engine.
String formatMinor(int amountMinor, String currency) =>
    formatMoneyMinor(amountMinor, currency: currency);

/// Returns true if the amount is zero.
bool isZero(int amountMinor) => amountMinor == 0;
