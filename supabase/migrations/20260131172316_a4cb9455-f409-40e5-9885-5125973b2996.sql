-- Add featured flag to playlist_tracks for controlling first impression
ALTER TABLE public.playlist_tracks 
ADD COLUMN is_featured boolean NOT NULL DEFAULT false;

-- Add index for efficient querying of featured tracks
CREATE INDEX idx_playlist_tracks_featured ON public.playlist_tracks(playlist_id, is_featured, position);