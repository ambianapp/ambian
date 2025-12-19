-- Create storage policies for the audio bucket

-- Allow admins to upload files to audio bucket
CREATE POLICY "Admins can upload audio files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'audio' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to update files in audio bucket
CREATE POLICY "Admins can update audio files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'audio' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to delete files from audio bucket
CREATE POLICY "Admins can delete audio files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'audio' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow authenticated users with active subscription to read audio files
CREATE POLICY "Subscribers can read audio files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'audio' 
  AND (has_active_subscription(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
);