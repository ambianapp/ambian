

# Fix Currency Detection Priority

## Problem
Currency detection checks localStorage first, which caches the old "EUR" preference. Even after changing MacBook settings to US region + EN-US language, the cached value takes priority and the app still shows EUR.

Additionally, the timezone is still set to GMT+2 (European), so timezone detection wouldn't help anyway - only the locale check (en-US) would correctly detect USD.

## Current Detection Flow
```text
1. localStorage "ambian_currency" → "EUR" found → Returns EUR immediately
   (Steps 2-4 never execute)
2. Browser locale check (en-US)
3. Timezone check (GMT+2 = European)
4. Default to EUR
```

## Solution
Remove localStorage from automatic detection. Only use localStorage when user explicitly chooses a currency via a UI selector. This ensures browser settings are always respected.

## Updated Detection Flow
```text
1. Browser locale check → "en-US" → Returns USD ✓
2. Timezone check (fallback for generic "en" locales)
3. Default to EUR
```

---

## Implementation

### Update `src/lib/pricing.ts`

Remove the localStorage check from `detectCurrency()`:

```typescript
export function detectCurrency(): Currency {
  // 1. Detect from browser locale (respects user's system settings)
  const locale = navigator.language || navigator.languages?.[0] || "en";
  if (locale.startsWith("en-US") || locale.startsWith("en-CA")) {
    return "USD";
  }

  // 2. Check timezone as secondary signal for US/Canada
  // (catches users with generic "en" locale but US timezone)
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isNorthAmericanTimezone(timezone)) {
      return "USD";
    }
  } catch {
    // Timezone detection not supported, continue to default
  }

  // 3. Default to EUR for all other regions
  return "EUR";
}
```

### Update `src/contexts/CurrencyContext.tsx`

Remove automatic localStorage save on detection. Only save when user explicitly changes currency:

```typescript
// Remove auto-save from detectCurrency calls
// Only save to localStorage when user manually selects currency via UI
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/pricing.ts` | Remove localStorage check from `detectCurrency()` |
| `src/contexts/CurrencyContext.tsx` | Don't auto-save detected currency to localStorage |

---

## Expected Result After Fix

With MacBook set to US region + EN-US language:
1. App detects `navigator.language` = "en-US"
2. Matches US locale check → Returns USD
3. User sees $8.25/mo pricing

With Finnish settings:
1. App detects `navigator.language` = "fi" or "fi-FI"
2. Doesn't match US locale
3. Timezone check: GMT+2 = European (not North American)
4. Returns EUR
5. User sees €7.40/mo pricing

---

## Future Enhancement (Optional)
Add a manual currency selector in the footer or settings page so users can override the automatic detection if needed.

