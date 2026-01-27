-- Enable realtime for playlists table
ALTER PUBLICATION supabase_realtime ADD TABLE public.playlists;

-- Enable realtime for playlist_tracks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.playlist_tracks;