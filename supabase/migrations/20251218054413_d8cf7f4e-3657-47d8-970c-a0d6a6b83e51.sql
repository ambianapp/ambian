-- Add category column to playlists for mood/genre categorization
ALTER TABLE public.playlists ADD COLUMN category text;

-- Add index for better query performance
CREATE INDEX idx_playlists_category ON public.playlists(category);