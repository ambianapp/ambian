import { supabase } from "@/integrations/supabase/client";

// 4 hours in seconds - longer expiry for 24/7 playback
const SIGNED_URL_EXPIRY = 14400;

// In-memory cache for signed URLs to avoid repeated edge function calls
// Cache expires slightly before the actual signed URL (3.5 hours vs 4 hours)
const CACHE_EXPIRY_MS = 3.5 * 60 * 60 * 1000; // 3.5 hours in milliseconds
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Get cached signed URL or return undefined if not cached/expired
 */
function getCachedSignedUrl(originalUrl: string): string | undefined {
  const cached = signedUrlCache.get(originalUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }
  // Remove expired entry
  if (cached) {
    signedUrlCache.delete(originalUrl);
  }
  return undefined;
}

/**
 * Cache a signed URL
 */
function cacheSignedUrl(originalUrl: string, signedUrl: string): void {
  signedUrlCache.set(originalUrl, {
    url: signedUrl,
    expiresAt: Date.now() + CACHE_EXPIRY_MS,
  });
}

// CDN configuration for faster global audio delivery
const CDN_ENABLED = false; // Temporarily disabled until BunnyCDN origin settings are correct
const CDN_BASE_URL = "https://ambian-audio.b-cdn.net";
const SUPABASE_STORAGE_URL = "https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1";

/**
 * Check if a URL is from the private audio bucket
 */
function isAudioBucketUrl(url: string): boolean {
  return url.includes("/storage/v1/object/public/audio/") || 
         url.includes("/storage/v1/object/audio/");
}

/**
 * Batch prefetch and cache signed URLs for multiple audio bucket URLs
 * Call this when loading a playlist to pre-cache all cover images
 */
export async function prefetchSignedUrls(urls: (string | null | undefined)[]): Promise<void> {
  // Filter to only audio bucket URLs that aren't already cached
  const urlsToSign = urls.filter((url): url is string => {
    if (!url) return false;
    if (!isAudioBucketUrl(url)) return false;
    if (getCachedSignedUrl(url)) return false;
    return true;
  });

  // Deduplicate
  const uniqueUrls = [...new Set(urlsToSign)];
  
  if (uniqueUrls.length === 0) return;

  console.log(`[storage] Batch prefetching ${uniqueUrls.length} signed URLs`);

  try {
    const { data, error } = await supabase.functions.invoke("get-signed-audio-url", {
      body: { audioUrls: uniqueUrls },
    });

    if (error) {
      console.error("[storage] Batch prefetch failed:", error);
      return;
    }

    const signedUrls = (data as any)?.signedUrls as Record<string, string | null> | undefined;
    if (!signedUrls) return;

    // Cache all the signed URLs
    for (const [originalUrl, signedUrl] of Object.entries(signedUrls)) {
      if (signedUrl) {
        cacheSignedUrl(originalUrl, signedUrl);
      }
    }

    console.log(`[storage] Cached ${Object.keys(signedUrls).length} signed URLs`);
  } catch (err) {
    console.error("[storage] Batch prefetch error:", err);
  }
}

/**
 * Generate a signed URL for audio file or cover image access
 * Routes through BunnyCDN for faster global delivery and caching
 * Since the audio bucket is private, we need signed URLs for authenticated access
 */
export async function getSignedAudioUrl(audioUrl: string | null): Promise<string | undefined> {
  if (!audioUrl) return undefined;
  
  // Check cache first
  const cachedUrl = getCachedSignedUrl(audioUrl);
  if (cachedUrl) {
    return cachedUrl;
  }
  
  // Use backend function to validate access (trial / pending_payment) and generate signed URL.
  // This avoids client-side policy mismatches that can block trial users.
  const { data, error } = await supabase.functions.invoke("get-signed-audio-url", {
    body: { audioUrl },
  });

  if (error) {
    console.error("Error creating signed URL (backend):", error);
    return undefined;
  }

  const signedUrl = (data as any)?.signedUrl as string | undefined;
  if (!signedUrl) return undefined;
  
  // Cache the signed URL for future use
  cacheSignedUrl(audioUrl, signedUrl);
  
  if (!CDN_ENABLED) {
    return signedUrl;
  }
  
  // Route through CDN for faster global delivery
  // Replace the Supabase storage URL with CDN URL
  // CDN will forward to origin with the token for authentication
  const cdnUrl = signedUrl.replace(SUPABASE_STORAGE_URL, CDN_BASE_URL + "/storage/v1");
  
  return cdnUrl;
}

