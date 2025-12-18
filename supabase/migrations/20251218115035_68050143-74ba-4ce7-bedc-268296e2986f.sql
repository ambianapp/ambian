-- Fix liked_songs RLS policies - change from restrictive to permissive
DROP POLICY IF EXISTS "Users can like songs" ON public.liked_songs;
DROP POLICY IF EXISTS "Users can unlike songs" ON public.liked_songs;
DROP POLICY IF EXISTS "Users can view their own liked songs" ON public.liked_songs;

-- Recreate as permissive policies (default)
CREATE POLICY "Users can like songs" 
ON public.liked_songs 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike songs" 
ON public.liked_songs 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own liked songs" 
ON public.liked_songs 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Also fix liked_playlists while we're at it (same issue)
DROP POLICY IF EXISTS "Users can like playlists" ON public.liked_playlists;
DROP POLICY IF EXISTS "Users can unlike playlists" ON public.liked_playlists;
DROP POLICY IF EXISTS "Users can view their own liked playlists" ON public.liked_playlists;

CREATE POLICY "Users can like playlists" 
ON public.liked_playlists 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike playlists" 
ON public.liked_playlists 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own liked playlists" 
ON public.liked_playlists 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);