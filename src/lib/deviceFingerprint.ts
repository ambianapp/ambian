/**
 * Device Fingerprint Utility
 * 
 * Generates a stable device fingerprint using hardware/software characteristics.
 * This helps recognize the same physical device across different browsers,
 * tabs, or after storage clears.
 */

/**
 * Simple string hash function (djb2 algorithm)
 * Produces a consistent hash from any string input
 */
const hashString = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to hex string, ensuring positive number
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/**
 * Collects device characteristics that remain stable across browsers
 */
const collectDeviceCharacteristics = (): string[] => {
  const characteristics: string[] = [];

  try {
    // Screen properties (same on all browsers of same device)
    characteristics.push(String(screen.width || 0));
    characteristics.push(String(screen.height || 0));
    characteristics.push(String(screen.colorDepth || 0));
    characteristics.push(String(window.devicePixelRatio || 1));

    // Platform info
    characteristics.push(navigator.platform || 'unknown');

    // Timezone (same across all browsers)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      characteristics.push(tz || 'unknown');
    } catch {
      characteristics.push('unknown');
    }

    // Hardware capabilities
    characteristics.push(String(navigator.hardwareConcurrency || 0));
    
    // Device memory (Chrome/Edge only, but helps differentiate)
    const nav = navigator as Navigator & { deviceMemory?: number };
    characteristics.push(String(nav.deviceMemory || 0));

    // Primary language
    characteristics.push(navigator.language || 'unknown');

    // Max touch points (helps identify touch devices)
    characteristics.push(String(navigator.maxTouchPoints || 0));

  } catch (error) {
    console.warn('Error collecting device characteristics:', error);
  }

  return characteristics;
};

/**
 * Generates a device fingerprint hash
 * Returns a hex string that should be consistent across browsers on the same device
 */
export const generateDeviceFingerprint = (): string => {
  try {
    const characteristics = collectDeviceCharacteristics();
    const rawFingerprint = characteristics.join('|');
    const hash = hashString(rawFingerprint);
    
    // Create a longer hash by combining multiple passes
    const extendedHash = hashString(hash + rawFingerprint) + hash;
    
    console.log('[DeviceFingerprint] Generated:', extendedHash.substring(0, 8) + '...');
    return extendedHash;
  } catch (error) {
    console.warn('[DeviceFingerprint] Failed to generate, returning empty:', error);
    return '';
  }
};

/**
 * Gets a stable device ID using fingerprinting with storage fallback
 * 
 * Priority:
 * 1. In-memory reference (for session stability)
 * 2. Device fingerprint (stable across browsers)
 * 3. Stored ID from localStorage/sessionStorage (backward compatibility)
 * 4. New random UUID (last resort)
 */
export const getStableDeviceId = (
  memoryRef: { current: string | null },
  storageKey: string,
  sessionKey: string
): string => {
  // 1) Return in-memory ID if already set
  if (memoryRef.current) {
    return memoryRef.current;
  }

  // 2) Generate device fingerprint
  const fingerprint = generateDeviceFingerprint();
  
  // 3) Check localStorage for existing ID (backward compatibility)
  let storedId: string | null = null;
  try {
    storedId = localStorage.getItem(storageKey);
  } catch {
    // ignore
  }

  // 4) Check sessionStorage as fallback
  if (!storedId) {
    try {
      storedId = sessionStorage.getItem(sessionKey);
    } catch {
      // ignore
    }
  }

  // Determine final device ID
  let deviceId: string;
  
  if (fingerprint) {
    // Use fingerprint as the primary identifier
    // Prefix with 'fp_' to distinguish from old random UUIDs
    deviceId = `fp_${fingerprint}`;
  } else if (storedId) {
    // Fall back to stored ID if fingerprinting failed
    deviceId = storedId;
  } else {
    // Last resort: generate a new random UUID
    deviceId = crypto.randomUUID();
  }

  // Persist to storage for backward compatibility
  try {
    localStorage.setItem(storageKey, deviceId);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(sessionKey, deviceId);
  } catch {
    // ignore
  }

  memoryRef.current = deviceId;
  return deviceId;
};

/**
 * Extracts just the fingerprint portion from a device ID
 * Returns null if the ID doesn't contain a fingerprint
 */
export const extractFingerprint = (deviceId: string): string | null => {
  if (deviceId.startsWith('fp_')) {
    return deviceId.substring(3);
  }
  return null;
};
