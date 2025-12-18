-- Create active_sessions table for single-device enforcement
CREATE TABLE public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  session_id text NOT NULL,
  device_info text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own active session
CREATE POLICY "Users can view own session"
ON public.active_sessions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert/update their own session
CREATE POLICY "Users can upsert own session"
ON public.active_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session"
ON public.active_sessions
FOR UPDATE
USING (auth.uid() = user_id);

-- Create function to update timestamp
CREATE TRIGGER update_active_sessions_updated_at
BEFORE UPDATE ON public.active_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();