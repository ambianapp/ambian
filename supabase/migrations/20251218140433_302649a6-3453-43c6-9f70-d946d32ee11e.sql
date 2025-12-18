-- Add device_slots column to subscriptions table (default 1)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS device_slots integer NOT NULL DEFAULT 1;

-- Modify active_sessions to allow multiple sessions per user
ALTER TABLE public.active_sessions DROP CONSTRAINT IF EXISTS active_sessions_user_id_key;

-- Add unique constraint on user_id + session_id instead
ALTER TABLE public.active_sessions ADD CONSTRAINT active_sessions_user_session_unique UNIQUE (user_id, session_id);

-- Add index for efficient session counting
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON public.active_sessions(user_id);