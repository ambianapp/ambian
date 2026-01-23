-- Create table to track deleted playlist tracks for restoration
CREATE TABLE public.deleted_playlist_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL,
  track_id uuid NOT NULL,
  original_position integer NOT NULL,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES auth.users(id),
  playlist_name text,
  track_title text,
  track_artist text
);

-- Enable RLS
ALTER TABLE public.deleted_playlist_tracks ENABLE ROW LEVEL SECURITY;

-- Only admins can manage deleted tracks
CREATE POLICY "Admins can manage deleted tracks"
ON public.deleted_playlist_tracks
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_deleted_playlist_tracks_playlist ON public.deleted_playlist_tracks(playlist_id);
CREATE INDEX idx_deleted_playlist_tracks_deleted_at ON public.deleted_playlist_tracks(deleted_at DESC);