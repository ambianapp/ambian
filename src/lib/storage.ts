import { supabase } from "@/integrations/supabase/client";

// 4 hours in seconds - longer expiry for 24/7 playback
const SIGNED_URL_EXPIRY = 14400;

/**
 * Generate a signed URL for audio file or cover image access
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
  
  return data.signedUrl;
}
