-- Make audio bucket private for premium content protection
UPDATE storage.buckets SET public = false WHERE id = 'audio';

-- Create separate public bucket for playlist covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('playlist-covers', 'playlist-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop the overly permissive public policy on audio bucket
DROP POLICY IF EXISTS "Public read access for playlist covers" ON storage.objects;

-- Allow public read access for the new playlist-covers bucket
CREATE POLICY "Public read access for playlist covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'playlist-covers');

-- Allow authenticated users to upload to playlist-covers bucket
CREATE POLICY "Authenticated users can upload playlist covers"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'playlist-covers' AND auth.uid() IS NOT NULL);

-- Allow admins to manage playlist covers
CREATE POLICY "Admins can manage playlist covers"
ON storage.objects FOR ALL
USING (bucket_id = 'playlist-covers' AND has_role(auth.uid(), 'admin'::app_role));