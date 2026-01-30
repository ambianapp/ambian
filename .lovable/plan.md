

# Adding Swedish, Norwegian, and UK Currencies

## Current Architecture Analysis

The app currently supports **EUR** and **USD** currencies with:

### Frontend (Centralized)
| File | Purpose |
|------|---------|
| `src/lib/pricing.ts` | Central config: Price IDs, display prices, detection logic |
| `src/contexts/CurrencyContext.tsx` | React context for currency state |

### Backend (Duplicated Price IDs)
Price IDs are **manually duplicated** across 8+ edge functions:

| Function | Hardcoded Price IDs |
|----------|---------------------|
| `create-checkout` | Subscription + Prepaid (EUR/USD) |
| `create-invoice` | Yearly Prepaid (EUR/USD) |
| `change-subscription-plan` | Subscription (EUR/USD) |
| `add-device-slot` | Device slots + Main subscription (EUR/USD) |
| `add-device-slot-prepaid` | Device slots (EUR/USD) |
| `sync-device-slots` | Device slots (EUR/USD) |
| `cancel-device-slot` | Device slots (EUR only!) |
| `check-subscription` | Device slots (EUR only!) |
| `stripe-webhook` | Device slots (EUR only!) - multiple locations |

---

## Problem: Manual Duplication is Error-Prone

Adding SEK, NOK, and GBP means:
- **12 new Stripe prices** to create (3 currencies x 4 price types)
- **20+ code locations** to update across edge functions
- High risk of missing updates

---

## Recommended Solution: Shared Pricing Module for Edge Functions

Create a **single source of truth** that both frontend and backend can reference.

### Option A: Shared Deno Module (Recommended)
Create a shared TypeScript module in `supabase/functions/_shared/pricing.ts` that all edge functions import.

```text
supabase/functions/
├── _shared/
│   └── pricing.ts          <-- Single source of truth for backend
├── create-checkout/
├── create-invoice/
└── ...
```

**Pros:**
- Single update point for all edge functions
- Type-safe
- No network calls

**Cons:**
- Frontend still needs its own copy (can't import Deno modules)
- Must keep frontend/backend in sync manually

### Option B: Database-Driven Pricing
Store price IDs in a `pricing_config` table and fetch at runtime.

**Pros:**
- True single source of truth
- Update prices without code deployment

**Cons:**
- Adds database dependency to every payment flow
- Latency on every request
- Overkill for infrequent price changes

---

## Implementation Plan

### Step 1: Create Stripe Prices
You'll need to create prices in Stripe Dashboard for each new currency:

| Currency | Symbol | Subscription Monthly | Subscription Yearly | Prepaid Monthly | Prepaid Yearly | Device Monthly | Device Yearly |
|----------|--------|---------------------|---------------------|-----------------|----------------|----------------|---------------|
| SEK | kr | 99 kr | 990 kr | 99 kr | 990 kr | 55 kr | 550 kr |
| NOK | kr | 99 kr | 990 kr | 99 kr | 990 kr | 55 kr | 550 kr |
| GBP | £ | £7.90 | £79 | £7.90 | £79 | £4.50 | £45 |

*(These are example amounts - adjust based on your pricing strategy)*

### Step 2: Create Shared Backend Module
Create `supabase/functions/_shared/pricing.ts`:

```typescript
// Shared pricing configuration for all edge functions
export type Currency = "EUR" | "USD" | "SEK" | "NOK" | "GBP";

export const PRICE_IDS = {
  EUR: {
    subscription: { monthly: "price_...", yearly: "price_..." },
    prepaid: { monthly: "price_...", yearly: "price_..." },
    deviceSlot: { monthly: "price_...", yearly: "price_..." },
  },
  USD: { /* ... */ },
  SEK: { /* new prices */ },
  NOK: { /* new prices */ },
  GBP: { /* new prices */ },
} as const;

// Helper functions
export function getAllDeviceSlotPriceIds(): string[] { /* ... */ }
export function getAllSubscriptionPriceIds(): string[] { /* ... */ }
export function detectCurrencyFromPriceId(priceId: string): Currency { /* ... */ }
```

### Step 3: Update Frontend Config
Update `src/lib/pricing.ts`:
- Add SEK, NOK, GBP to `Currency` type
- Add price IDs for each currency
- Add display prices and symbols
- Add timezone/locale detection for Nordic countries and UK

### Step 4: Update Detection Logic
Add locale/timezone detection for new regions:

```typescript
// Swedish locale
if (locale.startsWith("sv")) return "SEK";

// Norwegian locale  
if (locale.startsWith("nb") || locale.startsWith("nn") || locale.startsWith("no")) return "NOK";

// UK locale
if (locale === "en-GB") return "GBP";

// Timezone fallback
if (timezone === "Europe/Stockholm") return "SEK";
if (timezone === "Europe/Oslo") return "NOK";
if (timezone === "Europe/London") return "GBP";
```

### Step 5: Update Edge Functions
Replace hardcoded price IDs with imports from shared module:

```typescript
// Before (in each function)
const DEVICE_SLOT_PRICES = ["price_1Sfh...", "price_1Sj2..."];

// After
import { getAllDeviceSlotPriceIds } from "../_shared/pricing.ts";
const DEVICE_SLOT_PRICES = getAllDeviceSlotPriceIds();
```

Functions to update:
- `create-checkout`
- `create-invoice`
- `change-subscription-plan`
- `add-device-slot`
- `add-device-slot-prepaid`
- `sync-device-slots`
- `cancel-device-slot`
- `check-subscription`
- `stripe-webhook` (multiple locations)
- `verify-payment`
- `verify-device-slot-payment`

### Step 6: Add Currency Selector UI
Add a dropdown in the pricing page footer or settings to allow manual currency override.

---

## Files to Create/Modify

| Action | File | Changes |
|--------|------|---------|
| Create | `supabase/functions/_shared/pricing.ts` | Shared pricing config for backend |
| Modify | `src/lib/pricing.ts` | Add SEK, NOK, GBP currencies |
| Modify | `src/contexts/CurrencyContext.tsx` | Update types |
| Modify | `supabase/functions/create-checkout/index.ts` | Import from shared |
| Modify | `supabase/functions/create-invoice/index.ts` | Import from shared |
| Modify | `supabase/functions/change-subscription-plan/index.ts` | Import from shared |
| Modify | `supabase/functions/add-device-slot/index.ts` | Import from shared |
| Modify | `supabase/functions/add-device-slot-prepaid/index.ts` | Import from shared |
| Modify | `supabase/functions/sync-device-slots/index.ts` | Import from shared |
| Modify | `supabase/functions/cancel-device-slot/index.ts` | Import from shared |
| Modify | `supabase/functions/check-subscription/index.ts` | Import from shared |
| Modify | `supabase/functions/stripe-webhook/index.ts` | Import from shared |
| Modify | `supabase/functions/verify-payment/index.ts` | Import from shared |
| Modify | `supabase/functions/verify-device-slot-payment/index.ts` | Import from shared |
| Optional | `src/components/CurrencySelector.tsx` | Manual currency picker UI |

---

## Prerequisites Before Implementation

1. **Create Stripe Prices**: You need to create 12 new prices in Stripe Dashboard (4 price types x 3 currencies) and note their IDs

2. **Decide on Amounts**: Confirm the exact pricing for each currency:
   - SEK: ~10x EUR (99/990 kr suggested)
   - NOK: ~10x EUR (99/990 kr suggested)
   - GBP: ~0.85x EUR (£7.90/£79 suggested)

---

## Maintenance Benefits After Implementation

| Scenario | Current | After |
|----------|---------|-------|
| Add new currency | Edit 12+ files | Edit 2 files (frontend + shared backend) |
| Change price ID | Hunt through all functions | Single update point |
| Add new product type | Copy-paste everywhere | Add to shared config |

