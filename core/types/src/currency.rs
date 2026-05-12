use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Currency {
    /// Angolan Kwanza — primary settlement currency
    AOA,
    USD,
    EUR,
}

impl Currency {
    /// Number of minor units per major unit.
    /// AOA: 1 Kwanza = 100 cêntimos. USD/EUR: 1 unit = 100 cents.
    pub const fn minor_units_per_major(self) -> u32 {
        match self {
            Currency::AOA | Currency::USD | Currency::EUR => 100,
        }
    }

    pub const fn code(self) -> &'static str {
        match self {
            Currency::AOA => "AOA",
            Currency::USD => "USD",
            Currency::EUR => "EUR",
        }
    }
}

impl Currency {
    /// Parse from an ISO 4217 code string. Returns None for unknown codes.
    pub fn from_code(code: &str) -> Option<Self> {
        match code {
            "AOA" => Some(Currency::AOA),
            "USD" => Some(Currency::USD),
            "EUR" => Some(Currency::EUR),
            _ => None,
        }
    }
}

impl fmt::Display for Currency {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}
