-- Enable realtime for active_sessions table so devices can be notified immediately when disconnected
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_sessions;