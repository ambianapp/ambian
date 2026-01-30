// Centralized pricing configuration for multi-currency support (EUR/USD)

export type Currency = "EUR" | "USD";

// Price IDs mapped by currency
export const PRICE_IDS = {
  EUR: {
    subscription: {
      monthly: "price_1S2BhCJrU52a7SNLtRRpyoCl",
      yearly: "price_1S2BqdJrU52a7SNLAnOR8Nhf",
    },
    prepaid: {
      monthly: "price_1SfhOOJrU52a7SNLPPopAVyb",
      yearly: "price_1SfhOZJrU52a7SNLIejHHUh4",
    },
    deviceSlot: {
      monthly: "price_1SfhoMJrU52a7SNLpLI3yoEl",
      yearly: "price_1Sj2PMJrU52a7SNLzhpFYfJd",
    },
  },
  USD: {
    subscription: {
      monthly: "price_1SvJoMJrU52a7SNLo959c2de",
      yearly: "price_1SvJowJrU52a7SNLGaCy1fSV",
    },
    prepaid: {
      monthly: "price_1SvJqQJrU52a7SNLQVDEH3YZ",
      yearly: "price_1SvJqmJrU52a7SNLpKF8z2oF",
    },
    deviceSlot: {
      monthly: "price_1SvKEDJrU52a7SNLnMfkHpUz",
      yearly: "price_1SvKDCJrU52a7SNL6YI9kCAI",
    },
  },
} as const;

// Display prices for each currency
export const DISPLAY_PRICES = {
  EUR: {
    subscription: {
      monthly: { amount: 8.9, formatted: "€8.90" },
      yearly: { amount: 89, formatted: "€89" },
    },
    prepaid: {
      monthly: { amount: 8.9, formatted: "€8.90" },
      yearly: { amount: 89, formatted: "€89" },
    },
    deviceSlot: {
      monthly: { amount: 5, formatted: "€5" },
      yearly: { amount: 50, formatted: "€50" },
    },
    savings: {
      yearly: "€17.80",
      yearlyAmount: 17.8,
    },
    symbol: "€",
    monthlyEquivalent: "€7.40", // 89/12 rounded
  },
  USD: {
    subscription: {
      monthly: { amount: 9.9, formatted: "$9.90" },
      yearly: { amount: 99, formatted: "$99" },
    },
    prepaid: {
      monthly: { amount: 9.9, formatted: "$9.90" },
      yearly: { amount: 99, formatted: "$99" },
    },
    deviceSlot: {
      monthly: { amount: 5.5, formatted: "$5.50" },
      yearly: { amount: 55, formatted: "$55" },
    },
    savings: {
      yearly: "$19.80",
      yearlyAmount: 19.8,
    },
    symbol: "$",
    monthlyEquivalent: "$8.25", // 99/12 rounded
  },
} as const;

// All valid price IDs for each currency (used for recognition in edge functions)
export const ALL_PRICE_IDS = {
  EUR: [
    ...Object.values(PRICE_IDS.EUR.subscription),
    ...Object.values(PRICE_IDS.EUR.prepaid),
    ...Object.values(PRICE_IDS.EUR.deviceSlot),
  ],
  USD: [
    ...Object.values(PRICE_IDS.USD.subscription),
    ...Object.values(PRICE_IDS.USD.prepaid),
    ...Object.values(PRICE_IDS.USD.deviceSlot),
  ],
};

// All device slot price IDs (for recognition in sync-device-slots)
export const ALL_DEVICE_SLOT_PRICE_IDS = [
  ...Object.values(PRICE_IDS.EUR.deviceSlot),
  ...Object.values(PRICE_IDS.USD.deviceSlot),
];

// US timezones for geographic detection
const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Adak",
  "Pacific/Honolulu",
  "America/Detroit",
  "America/Indiana",
  "America/Kentucky",
  "America/Boise",
  "America/Juneau",
  "America/Nome",
  "America/Sitka",
  "America/Yakutat",
  "America/Metlakatla",
];

// Canadian timezones for geographic detection
const CANADA_TIMEZONES = [
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "America/Regina",
  "America/Yellowknife",
  "America/Whitehorse",
  "America/Iqaluit",
];

function isNorthAmericanTimezone(timezone: string): boolean {
  return US_TIMEZONES.some(tz => timezone.startsWith(tz)) || 
         CANADA_TIMEZONES.some(tz => timezone.startsWith(tz));
}

// Detect currency from browser locale and timezone
export function detectCurrency(): Currency {
  // 1. Check localStorage first for saved preference
  const saved = localStorage.getItem("ambian_currency");
  if (saved === "EUR" || saved === "USD") {
    return saved;
  }

  // 2. Detect from browser locale
  const locale = navigator.language || navigator.languages?.[0] || "en";
  if (locale.startsWith("en-US") || locale.startsWith("en-CA")) {
    return "USD";
  }

  // 3. Check timezone as secondary signal for US/Canada
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isNorthAmericanTimezone(timezone)) {
      return "USD";
    }
  } catch {
    // Timezone detection not supported, continue to default
  }

  // 4. Default to EUR for all other regions
  return "EUR";
}

// Get price ID for a specific plan, type, and currency
export function getPriceId(
  type: "subscription" | "prepaid" | "deviceSlot",
  plan: "monthly" | "yearly",
  currency: Currency
): string {
  return PRICE_IDS[currency][type][plan];
}

// Get display price for a specific plan, type, and currency
export function getDisplayPrice(
  type: "subscription" | "prepaid" | "deviceSlot",
  plan: "monthly" | "yearly",
  currency: Currency
): { amount: number; formatted: string } {
  return DISPLAY_PRICES[currency][type][plan];
}

// Get savings info for yearly plans
export function getYearlySavings(currency: Currency): { formatted: string; amount: number } {
  return {
    formatted: DISPLAY_PRICES[currency].savings.yearly,
    amount: DISPLAY_PRICES[currency].savings.yearlyAmount,
  };
}

// Get currency symbol
export function getCurrencySymbol(currency: Currency): string {
  return DISPLAY_PRICES[currency].symbol;
}

// Get monthly equivalent for yearly price (for display)
export function getMonthlyEquivalent(currency: Currency): string {
  return DISPLAY_PRICES[currency].monthlyEquivalent;
}

// Format a price amount with currency
export function formatPrice(amount: number, currency: Currency): string {
  const symbol = getCurrencySymbol(currency);
  // Format with proper decimal handling
  const formatted = amount % 1 === 0 ? amount.toString() : amount.toFixed(2);
  return currency === "USD" ? `${symbol}${formatted}` : `${symbol}${formatted}`;
}
