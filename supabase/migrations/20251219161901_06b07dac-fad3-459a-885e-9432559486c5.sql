-- Create playlist_schedules table for time-based playlist scheduling
CREATE TABLE public.playlist_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  name text,
  days_of_week integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sunday, 6=Saturday
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0, -- higher priority wins on overlap
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.playlist_schedules ENABLE ROW LEVEL SECURITY;

-- Users can view their own schedules
CREATE POLICY "Users can view own schedules"
ON public.playlist_schedules
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own schedules
CREATE POLICY "Users can create own schedules"
ON public.playlist_schedules
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own schedules
CREATE POLICY "Users can update own schedules"
ON public.playlist_schedules
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own schedules
CREATE POLICY "Users can delete own schedules"
ON public.playlist_schedules
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_playlist_schedules_updated_at
BEFORE UPDATE ON public.playlist_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();