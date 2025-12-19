-- Fix public data exposure: Require authentication for playlist_tracks SELECT
DROP POLICY IF EXISTS "Users can view playlist tracks" ON public.playlist_tracks;
CREATE POLICY "Authenticated users can view playlist tracks" 
ON public.playlist_tracks 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM playlists
    WHERE playlists.id = playlist_tracks.playlist_id 
    AND (playlists.user_id = auth.uid() OR playlists.is_public = true OR playlists.is_system = true)
  )
);

-- Fix public data exposure: Require authentication for playlists SELECT
DROP POLICY IF EXISTS "Users can view own playlists" ON public.playlists;
CREATE POLICY "Authenticated users can view playlists" 
ON public.playlists 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND
  (user_id = auth.uid() OR is_public = true OR is_system = true)
);

-- Add missing DELETE policy for active_sessions
CREATE POLICY "Users can delete own sessions" 
ON public.active_sessions 
FOR DELETE 
USING (auth.uid() = user_id);