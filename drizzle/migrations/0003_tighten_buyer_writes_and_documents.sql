DROP POLICY IF EXISTS "Authenticated users can submit selections" ON public.buyer_selections;
CREATE POLICY "Buyers can submit their own selections" ON public.buyer_selections
  FOR INSERT TO authenticated
  WITH CHECK (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role can insert activity logs" ON public.user_activity_logs;
CREATE POLICY "Admins can insert activity logs" ON public.user_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
CREATE POLICY "Buyers can upload their own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'buyer-documents' AND (storage.foldername(name))[1] = (select auth.uid()::text));

DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
CREATE POLICY "Buyers can view their own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'buyer-documents' AND owner_id = (select auth.uid()::text));

CREATE POLICY "Buyers can delete their own documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'buyer-documents' AND owner_id = (select auth.uid()::text));