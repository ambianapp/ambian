import { supabase } from "@/integrations/supabase/client";

/**
 * Generate a signed URL for audio file access
 * Since the audio bucket is private, we need signed URLs for authenticated access
 */
export async function getSignedAudioUrl(audioUrl: string | null): Promise<string | undefined> {
  if (!audioUrl) return undefined;
  
  // Extract the path from the audio URL
  // The audio_url is stored as a full public URL, we need to extract the path
  const urlParts = audioUrl.split('/storage/v1/object/public/audio/');
  if (urlParts.length !== 2) {
    // If the URL doesn't match expected format, try extracting just the filename
    const pathParts = audioUrl.split('/');
    const fileName = pathParts[pathParts.length - 1];
    if (!fileName) return undefined;
    
    const { data, error } = await supabase.storage
      .from('audio')
      .createSignedUrl(fileName, 3600); // 1 hour expiry
    
    if (error) {
      console.error("Error creating signed URL:", error);
      return undefined;
    }
    return data.signedUrl;
  }
  
  const filePath = urlParts[1];
  
  const { data, error } = await supabase.storage
    .from('audio')
    .createSignedUrl(filePath, 3600); // 1 hour expiry
  
  if (error) {
    console.error("Error creating signed URL:", error);
    return undefined;
  }
  
  return data.signedUrl;
}
