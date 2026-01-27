-- Create table for quick mix history
CREATE TABLE public.quick_mix_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  playlist_ids UUID[] NOT NULL,
  played_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  name TEXT -- Optional descriptive name like "Jazz, Blues, Soul"
);

-- Enable RLS
ALTER TABLE public.quick_mix_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own quick mix history
CREATE POLICY "Users can view own quick mix history"
ON public.quick_mix_history
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own quick mix history
CREATE POLICY "Users can insert own quick mix history"
ON public.quick_mix_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own quick mix history
CREATE POLICY "Users can delete own quick mix history"
ON public.quick_mix_history
FOR DELETE
USING (auth.uid() = user_id);