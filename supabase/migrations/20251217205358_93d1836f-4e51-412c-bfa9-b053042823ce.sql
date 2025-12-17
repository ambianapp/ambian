-- Create table for user liked songs
CREATE TABLE public.liked_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, track_id)
);

-- Enable RLS
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;

-- Users can view their own liked songs
CREATE POLICY "Users can view their own liked songs"
ON public.liked_songs
FOR SELECT
USING (auth.uid() = user_id);

-- Users can like songs
CREATE POLICY "Users can like songs"
ON public.liked_songs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can unlike songs
CREATE POLICY "Users can unlike songs"
ON public.liked_songs
FOR DELETE
USING (auth.uid() = user_id);