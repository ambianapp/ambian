

# Plan: Better Device Recognition Across Tabs and Browsers

## Problem Summary
When you use the app in different browsers (Chrome vs Safari) or different browser tabs that don't share storage, the app treats each as a separate device. This happens because the current system uses a randomly generated ID stored in browser storage - each browser has its own storage.

## Solution: Device Fingerprinting

We'll create a "device fingerprint" using characteristics of your actual physical device. This fingerprint will be the same regardless of which browser you use, allowing the app to recognize it's the same device.

### What device characteristics we'll use:
- Screen resolution and color depth
- Operating system and platform
- Timezone
- Device memory and CPU cores
- Browser language

This creates a stable identifier that stays consistent across:
- Different browsers on the same device
- Multiple tabs
- Browser restarts
- Storage clears

---

## Implementation Steps

### Step 1: Create Device Fingerprint Utility

Create a new utility file `src/lib/deviceFingerprint.ts` that generates a consistent device fingerprint using hardware/software characteristics.

```text
Device characteristics collected:
+----------------------------+
|  Screen: 1920x1080 @24bit  |
|  Platform: MacIntel        |
|  Timezone: Europe/Helsinki |
|  Cores: 8, Memory: 16GB    |
|  Language: en-US           |
+----------------------------+
           |
           v
    Hash -> "a7f3b2c1..."
           (Same across all browsers)
```

### Step 2: Update Device ID Generation in AuthContext

Modify the `getDeviceId()` function to:
1. First check for an existing stored device ID (for backward compatibility)
2. Generate a device fingerprint
3. Use a hybrid approach: fingerprint + fallback to random UUID if fingerprint is unavailable

### Step 3: Update Backend Session Registration

Modify the `register-session` edge function to:
1. Accept both `sessionId` (current) and `deviceFingerprint` (new)
2. When registering, check if another session with the same fingerprint already exists
3. If yes, update that session instead of creating a new one (consolidate sessions from same device)

### Step 4: Improve Device Limit Dialog Display

Update the `DeviceLimitDialog` to:
- Group sessions that appear to be from the same device (based on user-agent similarity)
- Show clearer labels like "iPhone - Safari" vs "iPhone - Chrome"
- Add a note when sessions look like they're from the same physical device

---

## Technical Details

### Device Fingerprint Generation
```typescript
const generateFingerprint = (): string => {
  const components = [
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency || 0,
    (navigator as any).deviceMemory || 0,
    navigator.language,
  ];
  // Hash these values to create consistent identifier
  return hashString(components.join('|'));
};
```

### Backend Session Consolidation
When a new session is registered:
1. Check if any existing session has the same fingerprint
2. If found, update that session's timestamp and user-agent instead of creating new
3. This automatically consolidates Chrome + Safari on the same device

### Backward Compatibility
- Existing sessions continue to work
- Fingerprint is added as an additional identifier, not a replacement
- If fingerprinting fails (e.g., in some privacy-focused browsers), fall back to current behavior

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/deviceFingerprint.ts` | **New** - Device fingerprint generation utility |
| `src/contexts/AuthContext.tsx` | Update `getDeviceId()` to use fingerprint |
| `supabase/functions/register-session/index.ts` | Accept fingerprint, consolidate same-device sessions |
| `src/components/DeviceLimitDialog.tsx` | Improve device grouping/display |

---

## Benefits

1. **Same device, different browsers**: Recognized as one device
2. **Cleared browser storage**: Still recognized as same device  
3. **Multiple tabs**: Continue working as before
4. **Privacy-friendly**: Uses only non-identifying device characteristics (no tracking cookies)

## Limitations

- Two identical devices (same model, OS, screen) may share a fingerprint
- VMs or remote desktops may have generic fingerprints
- Some privacy browsers block fingerprinting APIs

These edge cases are rare and the improved experience for the common case (same person, same device, different browsers) outweighs them.

