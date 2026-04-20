-- ============================================================
-- Migration: 005_source_materials_bucket.sql
--
-- Creates the `source-materials` Storage bucket used by the professor
-- upload flow (src/components/material-upload.tsx).
--
-- ------------------------------------------------------------
-- DEV-ONLY RLS NOTE — remove before production.
-- ------------------------------------------------------------
-- The dev login stub (src/lib/auth.ts) uses a cookie-based session, so
-- there is no Supabase Auth JWT and `auth.uid()` is null. To let the
-- browser client upload at all, the INSERT policy below opens this
-- bucket to the `anon` role. This matches the "admin client everywhere
-- in dev" pattern already used for database reads.
--
-- The worker (worker/processors/parse-materials.ts) and the delete
-- path (src/lib/actions/materials.ts) both use the service-role key,
-- which bypasses these policies anyway — so tightening the INSERT
-- policy later will not break the pipeline.
--
-- WHEN REAL SSO LANDS (tracked in tasks/tech-debt.md):
--   1. Drop `source_materials_dev_insert` below.
--   2. Replace with an authenticated-only policy scoped by ownership,
--      e.g. only allow INSERT when the first path segment is a
--      courseId whose `created_by = auth.uid()`.
--   3. Consider moving the upload through a Server Action + signed
--      URL so the anon key never writes to Storage directly.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'source-materials',
  'source-materials',
  false,
  52428800, -- 50MB, matches the client-side validator
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- DEV-ONLY policy. See header comment for production replacement.
CREATE POLICY source_materials_dev_insert ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'source-materials');
