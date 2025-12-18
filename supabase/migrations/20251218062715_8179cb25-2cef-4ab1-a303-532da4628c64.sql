-- Create liked_playlists table for users to save playlists to their library
CREATE TABLE public.liked_playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, playlist_id)
);

-- Enable Row Level Security
ALTER TABLE public.liked_playlists ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own liked playlists" 
ON public.liked_playlists 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can like playlists" 
ON public.liked_playlists 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike playlists" 
ON public.liked_playlists 
FOR DELETE 
USING (auth.uid() = user_id);