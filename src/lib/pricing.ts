// Centralized pricing configuration for multi-currency support
// When adding new currencies, also update supabase/functions/_shared/pricing.ts

export type Currency = "EUR" | "USD" | "SEK" | "NOK" | "GBP";

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
  // TODO: Add Stripe Price IDs once created in Stripe Dashboard
  SEK: {
    subscription: {
      monthly: "price_1SvLLNJrU52a7SNLXqAZBgNJ",
      yearly: "price_1SvLLhJrU52a7SNLAlCULDCb",
    },
    prepaid: {
      monthly: "price_1SvLLyJrU52a7SNL7lkJPiAe",
      yearly: "price_1SvLMHJrU52a7SNLJKf7S7ty",
    },
    deviceSlot: {
      monthly: "price_1SvLkEJrU52a7SNLEc2p5H6Q",
      yearly: "price_1SvLhNJrU52a7SNLFg38xzQc",
    },
  },
  NOK: {
    subscription: {
      monthly: "price_1SvLMtJrU52a7SNLfTAYFrzd",
      yearly: "price_1SvLNAJrU52a7SNLXIsfKvSz",
    },
    prepaid: {
      monthly: "price_1SvLNpJrU52a7SNLvznnyORD",
      yearly: "price_1SvLOBJrU52a7SNLeQkVBdDi",
    },
    deviceSlot: {
      monthly: "price_1SvLkYJrU52a7SNLdnMRp7js",
      yearly: "price_1SvLgtJrU52a7SNLWSwY0Xhk",
    },
  },
  GBP: {
    subscription: {
      monthly: "price_1SvLPDJrU52a7SNLCre6iSm3",
      yearly: "price_1SvLPXJrU52a7SNLudGngEyu",
    },
    prepaid: {
      monthly: "price_1SvLPqJrU52a7SNLttKNZSeg",
      yearly: "price_1SvLQ6JrU52a7SNL8sMmlz7L",
    },
    deviceSlot: {
      monthly: "price_1SvLkuJrU52a7SNLLn4wvNVX",
      yearly: "price_1SvLfWJrU52a7SNLt7FXuVGt",
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
  SEK: {
    subscription: {
      monthly: { amount: 99, formatted: "99 kr" },
      yearly: { amount: 990, formatted: "990 kr" },
    },
    prepaid: {
      monthly: { amount: 99, formatted: "99 kr" },
      yearly: { amount: 990, formatted: "990 kr" },
    },
    deviceSlot: {
      monthly: { amount: 55, formatted: "55 kr" },
      yearly: { amount: 550, formatted: "550 kr" },
    },
    savings: {
      yearly: "198 kr",
      yearlyAmount: 198,
    },
    symbol: "kr",
    monthlyEquivalent: "82.50 kr", // 990/12 rounded
  },
  NOK: {
    subscription: {
      monthly: { amount: 99, formatted: "99 kr" },
      yearly: { amount: 990, formatted: "990 kr" },
    },
    prepaid: {
      monthly: { amount: 99, formatted: "99 kr" },
      yearly: { amount: 990, formatted: "990 kr" },
    },
    deviceSlot: {
      monthly: { amount: 55, formatted: "55 kr" },
      yearly: { amount: 550, formatted: "550 kr" },
    },
    savings: {
      yearly: "198 kr",
      yearlyAmount: 198,
    },
    symbol: "kr",
    monthlyEquivalent: "82.50 kr", // 990/12 rounded
  },
  GBP: {
    subscription: {
      monthly: { amount: 7.9, formatted: "£7.90" },
      yearly: { amount: 79, formatted: "£79" },
    },
    prepaid: {
      monthly: { amount: 7.9, formatted: "£7.90" },
      yearly: { amount: 79, formatted: "£79" },
    },
    deviceSlot: {
      monthly: { amount: 4.5, formatted: "£4.50" },
      yearly: { amount: 45, formatted: "£45" },
    },
    savings: {
      yearly: "£15.80",
      yearlyAmount: 15.8,
    },
    symbol: "£",
    monthlyEquivalent: "£6.58", // 79/12 rounded
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
  SEK: [
    ...Object.values(PRICE_IDS.SEK.subscription),
    ...Object.values(PRICE_IDS.SEK.prepaid),
    ...Object.values(PRICE_IDS.SEK.deviceSlot),
  ],
  NOK: [
    ...Object.values(PRICE_IDS.NOK.subscription),
    ...Object.values(PRICE_IDS.NOK.prepaid),
    ...Object.values(PRICE_IDS.NOK.deviceSlot),
  ],
  GBP: [
    ...Object.values(PRICE_IDS.GBP.subscription),
    ...Object.values(PRICE_IDS.GBP.prepaid),
    ...Object.values(PRICE_IDS.GBP.deviceSlot),
  ],
};

// All device slot price IDs (for recognition in sync-device-slots)
export const ALL_DEVICE_SLOT_PRICE_IDS = [
  ...Object.values(PRICE_IDS.EUR.deviceSlot),
  ...Object.values(PRICE_IDS.USD.deviceSlot),
  ...Object.values(PRICE_IDS.SEK.deviceSlot),
  ...Object.values(PRICE_IDS.NOK.deviceSlot),
  ...Object.values(PRICE_IDS.GBP.deviceSlot),
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

// Detect currency from browser timezone (primary) and locale (secondary)
// Note: localStorage is NOT checked here - only explicit user selection saves to localStorage
// IMPORTANT: Timezone is checked FIRST because language ≠ currency location
// (e.g., Swedish-speaking Finns use EUR, not SEK)
export function detectCurrency(): Currency {
  // 1. Check timezone FIRST - this is the most reliable indicator of actual location
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Finland uses EUR (important: Swedish-speaking Finns should get EUR, not SEK)
    if (timezone === "Europe/Helsinki") {
      return "EUR";
    }
    
    // Sweden
    if (timezone === "Europe/Stockholm") {
      return "SEK";
    }
    
    // Norway
    if (timezone === "Europe/Oslo") {
      return "NOK";
    }
    
    // UK
    if (timezone === "Europe/London") {
      return "GBP";
    }
    
    // US/Canada
    if (isNorthAmericanTimezone(timezone)) {
      return "USD";
    }
  } catch {
    // Timezone detection not supported, fall through to locale
  }

  // 2. Fall back to browser locale if timezone didn't match
  const locale = navigator.language || navigator.languages?.[0] || "en";
  
  // Finnish locale - always EUR
  if (locale.startsWith("fi")) {
    return "EUR";
  }
  
  // Swedish locale (only if we couldn't detect timezone - assume Sweden)
  if (locale.startsWith("sv")) {
    return "SEK";
  }
  
  // Norwegian locale (nb = Bokmål, nn = Nynorsk, no = generic Norwegian)
  if (locale.startsWith("nb") || locale.startsWith("nn") || locale.startsWith("no")) {
    return "NOK";
  }
  
  // UK English
  if (locale === "en-GB") {
    return "GBP";
  }
  
  // US/Canada English
  if (locale.startsWith("en-US") || locale.startsWith("en-CA")) {
    return "USD";
  }

  // 3. Default to EUR for all other regions
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
  
  // For Scandinavian currencies, symbol comes after the amount
  if (currency === "SEK" || currency === "NOK") {
    return `${formatted} ${symbol}`;
  }
  
  return `${symbol}${formatted}`;
}
