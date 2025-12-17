-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload audio files
CREATE POLICY "Admins can upload audio" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audio' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to update audio files
CREATE POLICY "Admins can update audio" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'audio' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete audio files
CREATE POLICY "Admins can delete audio" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'audio' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow public read access to audio files (for subscribers to play)
CREATE POLICY "Public can read audio" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'audio');