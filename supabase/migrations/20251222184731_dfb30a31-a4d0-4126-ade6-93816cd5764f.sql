-- Make the audio bucket public so playlist covers are accessible
UPDATE storage.buckets SET public = true WHERE id = 'audio';

-- Add a policy to allow public read access to playlist covers
CREATE POLICY "Public read access for playlist covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio' AND name LIKE 'playlist-covers/%');