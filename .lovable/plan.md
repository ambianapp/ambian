
# Multi-Currency Support: EUR and USD

## Overview
This plan implements automatic currency detection so users in the USA see prices in USD while European users see prices in EUR - both in the app UI and during Stripe checkout.

## Price IDs Summary

| Plan | EUR Price ID | USD Price ID |
|------|--------------|--------------|
| Subscription Monthly | price_1S2BhCJrU52a7SNLtRRpyoCl | price_1SvJoMJrU52a7SNLo959c2de |
| Subscription Yearly | price_1S2BqdJrU52a7SNLAnOR8Nhf | price_1SvJowJrU52a7SNLGaCy1fSV |
| Prepaid Monthly | price_1SfhOOJrU52a7SNLPPopAVyb | price_1SvJqQJrU52a7SNLQVDEH3YZ |
| Prepaid Yearly | price_1SfhOZJrU52a7SNLIejHHUh4 | price_1SvJqmJrU52a7SNLpKF8z2oF |
| Device Slot Monthly | price_1SfhoMJrU52a7SNLpLI3yoEl | price_1SvKEDJrU52a7SNLnMfkHpUz |
| Device Slot Yearly | price_1Sj2PMJrU52a7SNLzhpFYfJd | price_1SvKDCJrU52a7SNL6YI9kCAI |

---

## How It Will Work

1. **Currency Detection**: Detect user region from browser locale/timezone
2. **Display Prices**: Show correct currency symbol and amounts throughout the app
3. **Stripe Integration**: Pass correct currency-specific price IDs to checkout

---

## Implementation Steps

### Step 1: Create Pricing Configuration

Create a new centralized pricing file:

```text
src/lib/pricing.ts
```

This will contain:
- All price IDs mapped by currency (EUR/USD)
- Display prices for each plan and currency
- Helper function to get user's detected currency
- Functions to get correct price IDs based on currency

Detection logic:
- Check browser locale (navigator.language)
- US users (en-US) get USD
- European countries get EUR
- Default to EUR for other regions

### Step 2: Create Currency Context

Create a new context to manage currency state:

```text
src/contexts/CurrencyContext.tsx
```

This will:
- Detect and store user's currency preference
- Provide currency symbol and formatting functions
- Persist preference in localStorage
- Save to user profile when logged in

### Step 3: Update Pricing Page

Modify `src/pages/Pricing.tsx`:
- Import and use pricing configuration
- Display prices in user's currency
- Pass correct price ID to checkout based on currency
- Update savings calculations for each currency

### Step 4: Update Subscription Gate

Modify `src/components/SubscriptionGate.tsx`:
- Import pricing configuration
- Display prices in user's currency

### Step 5: Update Auth Page

Modify `src/pages/Auth.tsx`:
- Display prices in user's currency on the marketing sections

### Step 6: Update Profile Page

Modify `src/pages/Profile.tsx`:
- Display device slot prices in user's currency
- Pass correct currency to edge functions

### Step 7: Update Translations

Modify `src/lib/translations.ts`:
- Make price strings dynamic (remove hardcoded prices)
- Add currency-specific formatting

### Step 8: Update Edge Functions

Update backend functions to accept and use currency parameter:

**supabase/functions/create-checkout/index.ts**
- Accept `currency` parameter in request body
- Select correct price ID based on currency
- Add currency-specific price mappings

**supabase/functions/create-invoice/index.ts**
- Accept `currency` parameter
- Use correct yearly prepaid price for currency

**supabase/functions/add-device-slot/index.ts**
- Add USD device slot price IDs
- Accept currency parameter to use correct price

**supabase/functions/add-device-slot-prepaid/index.ts**
- Update base price constant to support USD
- Use correct currency in checkout session

**supabase/functions/change-subscription-plan/index.ts**
- Add USD subscription price IDs
- Accept currency parameter

**supabase/functions/sync-device-slots/index.ts**
- Add USD device slot price IDs to recognition list

---

## Technical Details

### Currency Detection Logic

```text
Priority:
1. Saved user preference (from localStorage/profile)
2. Browser locale (navigator.language)
3. Default to EUR

Region mapping:
- en-US, en-CA -> USD
- All other locales -> EUR
```

### Pricing Structure

```text
EUR Prices:
- Monthly: €8.90
- Yearly: €89 (save €17.80)
- Device Slot Monthly: €5
- Device Slot Yearly: €50

USD Prices (assuming similar structure):
- Monthly: $9.90
- Yearly: $99 (save ~$20)
- Device Slot Monthly: $5.50
- Device Slot Yearly: $55
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/pricing.ts` | Centralized pricing configuration and helpers |
| `src/contexts/CurrencyContext.tsx` | Currency state management |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Pricing.tsx` | Use pricing config, pass currency to checkout |
| `src/components/SubscriptionGate.tsx` | Display dynamic prices |
| `src/pages/Auth.tsx` | Display dynamic prices |
| `src/pages/Profile.tsx` | Pass currency for device slots |
| `src/lib/translations.ts` | Dynamic price placeholders |
| `src/App.tsx` | Add CurrencyProvider |
| `supabase/functions/create-checkout/index.ts` | Add USD prices, accept currency |
| `supabase/functions/create-invoice/index.ts` | Add USD price support |
| `supabase/functions/add-device-slot/index.ts` | Add USD device slot prices |
| `supabase/functions/add-device-slot-prepaid/index.ts` | USD support |
| `supabase/functions/change-subscription-plan/index.ts` | Add USD subscription prices |
| `supabase/functions/sync-device-slots/index.ts` | Recognize USD device slot prices |

---

## User Experience

1. User visits from USA (browser locale en-US)
2. App detects USD preference
3. All prices display in $ (e.g., "$9.90/month")
4. Checkout uses USD price IDs
5. Stripe checkout shows USD amounts
6. Invoice/receipt in USD

For European users, everything continues working as before with EUR.
