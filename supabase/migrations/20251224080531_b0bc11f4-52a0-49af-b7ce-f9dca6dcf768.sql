-- Create activity_logs table for tracking user events
CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  event_type text NOT NULL,
  event_message text,
  event_details jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_event_type ON public.activity_logs(event_type);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view all activity logs"
ON public.activity_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow insert from service role (edge functions)
CREATE POLICY "Service role can insert logs"
ON public.activity_logs
FOR INSERT
WITH CHECK (true);

-- Admins can delete old logs
CREATE POLICY "Admins can delete activity logs"
ON public.activity_logs
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));