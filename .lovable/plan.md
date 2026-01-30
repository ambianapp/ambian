

# Fix Currency Detection for US Visitors

## Problem
The current currency detection only checks `navigator.language`, which returns the browser's language preference - not the user's geographic location. GTmetrix testing from Seattle, WA still showed EUR because the test browser likely has a generic English locale (like `en` or `en-GB`) rather than specifically `en-US`.

## Root Cause
```typescript
// Current logic - only matches exact "en-US" or "en-CA"
if (locale.startsWith("en-US") || locale.startsWith("en-CA")) {
  return "USD";
}
```

A browser in the US might report:
- `en` (generic English)
- `en-GB` (British English - common default)
- `en-AU` (Australian English)

None of these trigger USD.

---

## Solution: Add Timezone-Based Detection

Use `Intl.DateTimeFormat().resolvedOptions().timeZone` to detect US/Canada timezones as a secondary signal. This is more reliable than browser language for geographic detection.

### US Timezones to Detect
- America/New_York
- America/Chicago  
- America/Denver
- America/Los_Angeles
- America/Phoenix
- America/Anchorage
- Pacific/Honolulu
- (and other US territories)

### Canadian Timezones
- America/Toronto
- America/Vancouver
- America/Edmonton
- America/Winnipeg
- (and others)

---

## Implementation

### Update `src/lib/pricing.ts`

Add timezone detection as a secondary check:

```typescript
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

  // 3. NEW: Check timezone as secondary signal for US/Canada
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isNorthAmericanTimezone(timezone)) {
      return "USD";
    }
  } catch {
    // Timezone detection not supported, continue to default
  }

  // 4. Default to EUR
  return "EUR";
}

function isNorthAmericanTimezone(timezone: string): boolean {
  const usTimezones = [
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
  
  const canadaTimezones = [
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

  // Check for exact match or prefix match (for sub-zones)
  return usTimezones.some(tz => timezone.startsWith(tz)) || 
         canadaTimezones.some(tz => timezone.startsWith(tz));
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/pricing.ts` | Add timezone-based detection with `isNorthAmericanTimezone()` helper |

---

## How It Will Work After Fix

1. User in Seattle visits the app
2. Browser locale might be `en` or `en-GB` (doesn't match)
3. Timezone check runs: `America/Los_Angeles` detected
4. Matches US timezone list → USD returned
5. User sees $9.90/month pricing

---

## Testing Notes

After implementation, GTmetrix from Seattle should show:
- `$8.25/mo` on Auth page (instead of €7.40)
- `$99/year` on Pricing page (instead of €89)
- `$` symbol throughout

