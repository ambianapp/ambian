-- Enable realtime for playlists table (safe if already enabled)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.playlists;
EXCEPTION
  WHEN duplicate_object THEN
    -- Table is already part of the publication
    NULL;
  WHEN others THEN
    -- Some Postgres versions raise a different error; ignore if it's already a member
    IF SQLERRM LIKE '%already member of publication%' THEN
      NULL;
    ELSE
      RAISE;
    END IF;
END $$;