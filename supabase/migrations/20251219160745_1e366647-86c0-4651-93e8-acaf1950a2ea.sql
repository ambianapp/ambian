-- Fix storage policies to use schema-qualified security definer functions

DROP POLICY IF EXISTS "Admins can upload audio files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update audio files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete audio files" ON storage.objects;
DROP POLICY IF EXISTS "Subscribers can read audio files" ON storage.objects;

CREATE POLICY "Admins can upload audio files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'audio'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update audio files"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'audio'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete audio files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'audio'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Subscribers can read audio files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'audio'
  AND (public.has_active_subscription(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
);
