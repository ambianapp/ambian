-- Add display_order column to playlists table for custom ordering
ALTER TABLE public.playlists
ADD COLUMN display_order INTEGER DEFAULT 0;

-- Set initial order based on name for existing mood playlists
UPDATE public.playlists 
SET display_order = subquery.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) as row_num
  FROM public.playlists 
  WHERE category = 'mood' AND is_system = true
) as subquery
WHERE public.playlists.id = subquery.id;

-- Set initial order for genre playlists too
UPDATE public.playlists 
SET display_order = subquery.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) as row_num
  FROM public.playlists 
  WHERE category = 'genre' AND is_system = true
) as subquery
WHERE public.playlists.id = subquery.id;