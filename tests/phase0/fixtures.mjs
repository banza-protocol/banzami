// Phase 0 synthetic fixture generator — internal Sandbox only.
// Produces SYNTHETIC participants and SYNTHETIC balances. No real personal data,
// no real documents, no real bank accounts, no real payment rails. All NIF/ID and
// phone values are explicitly marked SYNTHETIC placeholders.
//
// Amounts are in minor units (1 AOA = 100 minor) and are non-monetary in Phase 0.

export const PILOT_LIMITS_MINOR = {
  consumer_per_payment: 2_500_000, // Kz 25.000
  consumer_daily: 5_000_000, // Kz 50.000
  consumer_max_balance: 5_000_000, // Kz 50.000
  merchant_per_receive: 2_500_000, // Kz 25.000
  merchant_daily_receive: 10_000_000, // Kz 100.000
  merchant_max_balance: 10_000_000, // Kz 100.000
  aggregate_funds: 50_000_000, // Kz 500.000
  aggregate_volume: 200_000_000, // Kz 2.000.000
};

const CATEGORIES = ['cantina', 'taxi', 'loja', 'servicos', 'doacao'];

export function generateFixtures() {
  const consumers = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return {
      id: `synthetic-consumer-${String(n).padStart(2, '0')}`,
      display_name: `SYNTHETIC Consumer ${n}`,
      handle: `@synthetic_c${n}`,
      phone_placeholder: `SYNTHETIC-PHONE-C${String(n).padStart(3, '0')}`,
      nif_placeholder: `SYNTHETIC-NIF-C${String(n).padStart(3, '0')}`,
      synthetic_balance_minor: 3_000_000, // Kz 30.000 (within consumer cap)
      synthetic: true,
    };
  });
  const merchants = Array.from({ length: 5 }, (_, i) => {
    const n = i + 1;
    return {
      id: `synthetic-merchant-${String(n).padStart(2, '0')}`,
      display_name: `SYNTHETIC Merchant ${n}`,
      handle: `@synthetic_m${n}`,
      category: CATEGORIES[i % CATEGORIES.length],
      nif_placeholder: `SYNTHETIC-NIF-M${String(n).padStart(3, '0')}`,
      synthetic_balance_minor: 0,
      synthetic: true,
    };
  });
  return {
    profile: 'phase0-internal-sandbox',
    synthetic: true,
    note: 'SYNTHETIC fixtures only. No real personal data, documents, bank accounts or payment rails.',
    pilot_limits_minor: PILOT_LIMITS_MINOR,
    consumers,
    merchants,
  };
}
