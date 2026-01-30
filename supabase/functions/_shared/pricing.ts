// Shared pricing configuration for all edge functions
// This is the single source of truth for Stripe Price IDs on the backend

export type Currency = "EUR" | "USD" | "SEK" | "NOK" | "GBP";

// =============================================================================
// STRIPE PRICE IDS
// =============================================================================
// When adding new currencies or changing prices, update this section
// and the corresponding frontend config in src/lib/pricing.ts

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
      monthly: "price_TODO_SEK_SUB_MONTHLY", // 99 kr/month
      yearly: "price_TODO_SEK_SUB_YEARLY",   // 990 kr/year
    },
    prepaid: {
      monthly: "price_TODO_SEK_PREPAID_MONTHLY",
      yearly: "price_TODO_SEK_PREPAID_YEARLY",
    },
    deviceSlot: {
      monthly: "price_TODO_SEK_DEVICE_MONTHLY", // 55 kr/month
      yearly: "price_TODO_SEK_DEVICE_YEARLY",   // 550 kr/year
    },
  },
  NOK: {
    subscription: {
      monthly: "price_TODO_NOK_SUB_MONTHLY", // 99 kr/month
      yearly: "price_TODO_NOK_SUB_YEARLY",   // 990 kr/year
    },
    prepaid: {
      monthly: "price_TODO_NOK_PREPAID_MONTHLY",
      yearly: "price_TODO_NOK_PREPAID_YEARLY",
    },
    deviceSlot: {
      monthly: "price_TODO_NOK_DEVICE_MONTHLY", // 55 kr/month
      yearly: "price_TODO_NOK_DEVICE_YEARLY",   // 550 kr/year
    },
  },
  GBP: {
    subscription: {
      monthly: "price_TODO_GBP_SUB_MONTHLY", // £7.90/month
      yearly: "price_TODO_GBP_SUB_YEARLY",   // £79/year
    },
    prepaid: {
      monthly: "price_TODO_GBP_PREPAID_MONTHLY",
      yearly: "price_TODO_GBP_PREPAID_YEARLY",
    },
    deviceSlot: {
      monthly: "price_TODO_GBP_DEVICE_MONTHLY", // £4.50/month
      yearly: "price_TODO_GBP_DEVICE_YEARLY",   // £45/year
    },
  },
} as const;

// Test prices (EUR only for now)
export const TEST_PRICES = {
  subscription_daily: "price_1SjxomJrU52a7SNL3ImdC1N0",
  prepaid_daily: "price_1SjxozJrU52a7SNLnoFrDtvf",
};

// Legacy VAT-inclusive prices (EUR only, for compatibility)
export const LEGACY_VAT_PRICES = {
  monthly_with_vat: "price_1RREw6JrU52a7SNLjcBLbT7w", // €11.17
  yearly_with_vat: "price_1RREw6JrU52a7SNLevS4o4gf",  // €111.70
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Get all subscription price IDs (for recognizing main subscriptions)
export function getAllSubscriptionPriceIds(): string[] {
  const prices: string[] = [];
  for (const currency of Object.keys(PRICE_IDS) as Currency[]) {
    prices.push(PRICE_IDS[currency].subscription.monthly);
    prices.push(PRICE_IDS[currency].subscription.yearly);
  }
  // Add legacy and test prices
  prices.push(LEGACY_VAT_PRICES.monthly_with_vat);
  prices.push(LEGACY_VAT_PRICES.yearly_with_vat);
  prices.push(TEST_PRICES.subscription_daily);
  return prices;
}

// Get all prepaid price IDs
export function getAllPrepaidPriceIds(): string[] {
  const prices: string[] = [];
  for (const currency of Object.keys(PRICE_IDS) as Currency[]) {
    prices.push(PRICE_IDS[currency].prepaid.monthly);
    prices.push(PRICE_IDS[currency].prepaid.yearly);
  }
  prices.push(TEST_PRICES.prepaid_daily);
  return prices;
}

// Get all device slot price IDs
export function getAllDeviceSlotPriceIds(): string[] {
  const prices: string[] = [];
  for (const currency of Object.keys(PRICE_IDS) as Currency[]) {
    prices.push(PRICE_IDS[currency].deviceSlot.monthly);
    prices.push(PRICE_IDS[currency].deviceSlot.yearly);
  }
  return prices;
}

// Get all yearly price IDs (for plan type detection)
export function getAllYearlyPriceIds(): string[] {
  const prices: string[] = [];
  for (const currency of Object.keys(PRICE_IDS) as Currency[]) {
    prices.push(PRICE_IDS[currency].subscription.yearly);
    prices.push(PRICE_IDS[currency].prepaid.yearly);
    prices.push(PRICE_IDS[currency].deviceSlot.yearly);
  }
  prices.push(LEGACY_VAT_PRICES.yearly_with_vat);
  return prices;
}

// Get all daily test price IDs
export function getAllDailyTestPriceIds(): string[] {
  return [TEST_PRICES.subscription_daily, TEST_PRICES.prepaid_daily];
}

// Detect currency from a price ID
export function detectCurrencyFromPriceId(priceId: string): Currency {
  for (const currency of Object.keys(PRICE_IDS) as Currency[]) {
    const currencyPrices = PRICE_IDS[currency];
    const subscriptionPrices = Object.values(currencyPrices.subscription) as string[];
    const prepaidPrices = Object.values(currencyPrices.prepaid) as string[];
    const deviceSlotPrices = Object.values(currencyPrices.deviceSlot) as string[];
    
    if (
      subscriptionPrices.includes(priceId) ||
      prepaidPrices.includes(priceId) ||
      deviceSlotPrices.includes(priceId)
    ) {
      return currency;
    }
  }
  // Check legacy EUR prices
  const legacyPrices = Object.values(LEGACY_VAT_PRICES) as string[];
  if (legacyPrices.includes(priceId)) {
    return "EUR";
  }
  // Check test prices (EUR)
  const testPrices = Object.values(TEST_PRICES) as string[];
  if (testPrices.includes(priceId)) {
    return "EUR";
  }
  // Default to EUR if not found
  return "EUR";
}

// Check if a price ID is for a device slot
export function isDeviceSlotPrice(priceId: string): boolean {
  return getAllDeviceSlotPriceIds().includes(priceId);
}

// Check if a price ID is for a main subscription (not device slot)
export function isMainSubscriptionPrice(priceId: string): boolean {
  return getAllSubscriptionPriceIds().includes(priceId);
}

// Get device slot price for a given currency and interval
export function getDeviceSlotPriceId(currency: Currency, interval: "monthly" | "yearly"): string {
  return PRICE_IDS[currency].deviceSlot[interval];
}

// Get subscription price for a given currency and interval
export function getSubscriptionPriceId(currency: Currency, interval: "monthly" | "yearly"): string {
  return PRICE_IDS[currency].subscription[interval];
}

// Get prepaid price for a given currency and interval
export function getPrepaidPriceId(currency: Currency, interval: "monthly" | "yearly"): string {
  return PRICE_IDS[currency].prepaid[interval];
}

// Full price amounts by currency (in currency units, not cents)
export const DEVICE_SLOT_FULL_PRICES = {
  EUR: { monthly: 5, yearly: 50 },
  USD: { monthly: 5.5, yearly: 55 },
  SEK: { monthly: 55, yearly: 550 },
  NOK: { monthly: 55, yearly: 550 },
  GBP: { monthly: 4.5, yearly: 45 },
} as const;

// Yearly device slot prices in cents (for proration calculations)
export const YEARLY_DEVICE_SLOT_PRICES_CENTS = {
  EUR: 5000,  // €50
  USD: 5500,  // $55
  SEK: 55000, // 550 kr
  NOK: 55000, // 550 kr
  GBP: 4500,  // £45
} as const;
