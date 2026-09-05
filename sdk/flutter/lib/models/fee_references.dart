/// BANZA ADR-039 fee references — operator-internal categorization.
///
/// These are **references only**. They let the operator categorize and price a
/// payment or settlement internally. The SDK never sends or receives a fee, a
/// percentage, or a pricing rule; the operator resolves any fee internally and a
/// client can neither choose nor see it.
///
/// Both enums are forward-compatible: an unknown wire value maps to [unknown]
/// and resolves to a zero fee, so a newer operator category never breaks an
/// older app.
library;

/// The kind of commerce a payment represents (reference only — never a price).
enum BusinessCategory {
  donation('DONATION'),
  crowdfunding('CROWDFUNDING'),
  marketplace('MARKETPLACE'),
  ecommerce('ECOMMERCE'),
  delivery('DELIVERY'),
  foodDelivery('FOOD_DELIVERY'),
  rideHailing('RIDE_HAILING'),
  subscription('SUBSCRIPTION'),
  ticketing('TICKETING'),
  digitalGoods('DIGITAL_GOODS'),
  physicalGoods('PHYSICAL_GOODS'),
  p2p('P2P'),
  billPayment('BILL_PAYMENT'),
  ngo('NGO'),
  government('GOVERNMENT'),

  /// A category this build does not know yet (forward-compatible; zero fee).
  unknown('');

  const BusinessCategory(this.wire);

  /// The wire value sent to / received from the operator.
  final String wire;

  static BusinessCategory fromWire(String value) =>
      BusinessCategory.values.firstWhere((c) => c.wire == value,
          orElse: () => BusinessCategory.unknown);
}

/// Commercial pricing tier (reference only; never a price).
enum PricingProfile {
  standard('STANDARD'),
  business('BUSINESS'),
  enterprise('ENTERPRISE'),
  partner('PARTNER'),
  ngo('NGO'),
  government('GOVERNMENT'),
  custom('CUSTOM'),
  unknown('');

  const PricingProfile(this.wire);

  final String wire;

  static PricingProfile fromWire(String value) => PricingProfile.values
      .firstWhere((p) => p.wire == value, orElse: () => PricingProfile.unknown);
}
