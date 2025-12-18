-- Make the audio bucket private
UPDATE storage.buckets SET public = false WHERE id = 'audio';

-- Drop the public read policy
DROP POLICY IF EXISTS "Public can read audio" ON storage.objects;

-- Create a policy that requires authentication and active subscription
CREATE POLICY "Subscribers can read audio" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'audio' 
  AND (has_active_subscription(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
);