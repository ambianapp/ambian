-- Ensure audio bucket is private (idempotent)
UPDATE storage.buckets SET public = false WHERE id = 'audio';

-- Clean up any remaining public policy if it exists
DROP POLICY IF EXISTS "Public can read audio" ON storage.objects;