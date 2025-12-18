-- Create play history table to track recently played playlists
CREATE TABLE public.play_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  played_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own play history
CREATE POLICY "Users can view own play history"
ON public.play_history
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own play history
CREATE POLICY "Users can insert own play history"
ON public.play_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own play history
CREATE POLICY "Users can delete own play history"
ON public.play_history
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_play_history_user_played ON public.play_history(user_id, played_at DESC);