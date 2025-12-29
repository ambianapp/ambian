import { supabase } from "@/integrations/supabase/client";

// 4 hours in seconds - longer expiry for 24/7 playback
const SIGNED_URL_EXPIRY = 14400;

// CDN configuration for faster global audio delivery
const CDN_ENABLED = true; // Set to false to disable CDN
const CDN_BASE_URL = "https://ambian-audio.b-cdn.net";
const SUPABASE_STORAGE_URL = "https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1";

/**
 * Generate a signed URL for audio file or cover image access
 * Routes through BunnyCDN for faster global delivery and caching
 * Since the audio bucket is private, we need signed URLs for authenticated access
 */
export async function getSignedAudioUrl(audioUrl: string | null): Promise<string | undefined> {
  if (!audioUrl) return undefined;
  
  // Extract the path from the URL
  // Handles both /storage/v1/object/public/audio/ and /storage/v1/object/audio/ formats
  let filePath: string | undefined;
  
  // Try standard public URL format first
  const publicUrlParts = audioUrl.split('/storage/v1/object/public/audio/');
  if (publicUrlParts.length === 2) {
    filePath = publicUrlParts[1];
  } else {
    // Try signed URL format
    const signedUrlParts = audioUrl.split('/storage/v1/object/sign/audio/');
    if (signedUrlParts.length === 2) {
      // For signed URLs, extract path before the query params
      filePath = signedUrlParts[1].split('?')[0];
    } else {
      // Try direct path format
      const directParts = audioUrl.split('/storage/v1/object/audio/');
      if (directParts.length === 2) {
        filePath = directParts[1];
      } else {
        // Last resort: extract just the filename
        const pathParts = audioUrl.split('/');
        filePath = pathParts[pathParts.length - 1];
      }
    }
  }
  
  if (!filePath) return undefined;
  
  // Decode URI components (handles %20, etc.)
  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // If decoding fails, use as-is
  }
  
  const { data, error } = await supabase.storage
    .from('audio')
    .createSignedUrl(filePath, SIGNED_URL_EXPIRY);
  
  if (error) {
    console.error("Error creating signed URL:", error);
    return undefined;
  }
  
  // The signedUrl from Supabase is a full URL like:
  // https://hjecjqyonxvrrvprbvgr.supabase.co/storage/v1/object/sign/audio/file.mp3?token=xxx
  const signedUrl = data.signedUrl;
  
  if (!CDN_ENABLED) {
    return signedUrl;
  }
  
  // Route through CDN for faster global delivery
  // Replace the Supabase storage URL with CDN URL
  // CDN will forward to origin with the token for authentication
  const cdnUrl = signedUrl.replace(SUPABASE_STORAGE_URL, CDN_BASE_URL + "/storage/v1");
  
  console.log("Audio URL routing:", { original: signedUrl.substring(0, 80), cdn: cdnUrl.substring(0, 80) });
  
  return cdnUrl;
}
