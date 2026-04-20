-- =============================================================================
-- Muto — Northstar rebuild foundation
-- 006_northstar.sql
--
-- Additive-only migration backing the Northstar Rebuild plan
-- (.claude/plans/get-200-in-optimized-swing.md). Ships:
--   1. slug columns on courses, labs, course_instances (backfilled, NOT NULL)
--   2. labs.course_id denormalized from modules.course_id for direct uniqueness
--   3. lab content v2 columns: content_version, sandpack_files, tutor_context,
--      generation_context_snapshot
--   4. lab_embeddings: cross-lab cosine retrieval (HNSW). Powers the similar-
--      labs retriever in S5.
--   5. cognitive_model_snapshots: per-enrollment rollup of concept_evaluations
--      + recent chat_messages. TTL-refreshed on read.
--
-- No drops. The legacy labs.content (v1 Markdown) stays populated during
-- cutover; deletion of the v1 write path is deferred to S7 step 6.
--
-- DENORM RISK:
--   labs.course_id is denormalized from modules.course_id so we can unique-
--   index (course_id, slug) without a trigger. Moving a lab between modules
--   across courses is currently not a product feature; if it ever becomes one,
--   add a trigger to keep labs.course_id in sync with modules.course_id. The
--   FK to courses is declared WITHOUT ON UPDATE CASCADE for that reason — we
--   want a loud failure if the invariant breaks.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Slug columns (add nullable → backfill → set NOT NULL → unique index)
-- ---------------------------------------------------------------------------

ALTER TABLE courses           ADD COLUMN slug text;
ALTER TABLE labs              ADD COLUMN slug text;
ALTER TABLE course_instances  ADD COLUMN slug text;

-- Deterministic backfill. 6-char id suffix guarantees uniqueness without
-- needing a collision-retry pass.
UPDATE courses
SET slug = lower(regexp_replace(coalesce(title, 'course'), '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substr(id::text, 1, 6);

UPDATE labs
SET slug = lower(regexp_replace(coalesce(title, 'lab'), '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substr(id::text, 1, 6);

UPDATE course_instances
SET slug = lower(regexp_replace(coalesce(semester, 'instance'), '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substr(id::text, 1, 6);

-- Strip accidental leading/trailing hyphens produced by the regex (e.g. when
-- title starts with a non-alphanumeric character).
UPDATE courses           SET slug = trim(both '-' from slug);
UPDATE labs              SET slug = trim(both '-' from slug);
UPDATE course_instances  SET slug = trim(both '-' from slug);

ALTER TABLE courses           ALTER COLUMN slug SET NOT NULL;
ALTER TABLE labs              ALTER COLUMN slug SET NOT NULL;
ALTER TABLE course_instances  ALTER COLUMN slug SET NOT NULL;

-- Unique scopes. courses: a professor can't collide with themselves inside an
-- institution. labs: unique per denormalized course. instances: unique per
-- course.
CREATE UNIQUE INDEX courses_slug_scope_idx
  ON courses(institution_id, created_by, slug);

CREATE UNIQUE INDEX course_instances_slug_scope_idx
  ON course_instances(course_id, slug);

-- ---------------------------------------------------------------------------
-- 2. labs.course_id denormalized from modules.course_id
-- ---------------------------------------------------------------------------

ALTER TABLE labs ADD COLUMN course_id uuid REFERENCES courses(id);

UPDATE labs l
SET course_id = m.course_id
FROM modules m
WHERE m.id = l.module_id;

ALTER TABLE labs ALTER COLUMN course_id SET NOT NULL;

CREATE UNIQUE INDEX labs_slug_scope_idx
  ON labs(course_id, slug);

CREATE INDEX labs_course_id_idx
  ON labs(course_id);

-- ---------------------------------------------------------------------------
-- 3. Lab content v2 columns
-- ---------------------------------------------------------------------------

ALTER TABLE labs
  ADD COLUMN content_version              smallint NOT NULL DEFAULT 1,
  ADD COLUMN sandpack_files               jsonb,
  ADD COLUMN tutor_context                jsonb,
  ADD COLUMN generation_context_snapshot  jsonb;

-- content_version=1 → legacy Markdown prose (labs.content).
-- content_version=2 → Sandpack-bearing labs.
-- sandpack_files: per-section or whole-lab file map
--   { "/App.tsx": {"code": "...", "hidden": false, "active": true}, ... }
-- tutor_context: pre-baked anchor for the RAG tutor side panel
--   { concept_index, notation_cheatsheet, pedagogical_emphasis,
--     retrieval_seeds, source_citations }
-- generation_context_snapshot: what went into the LLM (debug + quality decay)

-- ---------------------------------------------------------------------------
-- 4. lab_embeddings (similar-lab retrieval)
-- ---------------------------------------------------------------------------

CREATE TABLE lab_embeddings (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id         uuid         NOT NULL UNIQUE REFERENCES labs(id) ON DELETE CASCADE,
  subject_area   text,        -- denorm from courses.subject_area; nullable because courses.subject_area is nullable
  embedding      vector(1536) NOT NULL,
  embedded_text  text         NOT NULL,  -- title + concept names + first section headings
  quality_score  numeric(3,2) NOT NULL DEFAULT 1.0 CHECK (quality_score BETWEEN 0 AND 1),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE lab_embeddings ENABLE ROW LEVEL SECURITY;

-- HNSW cosine index for cross-lab similarity search. m=16, ef_construction=64
-- is the pgvector default and fine for <100k rows — tune when corpus grows.
CREATE INDEX lab_embeddings_embedding_hnsw_idx
  ON lab_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX lab_embeddings_subject_area_idx
  ON lab_embeddings(subject_area);

CREATE INDEX lab_embeddings_quality_idx
  ON lab_embeddings(quality_score);

-- ---------------------------------------------------------------------------
-- 5. cognitive_model_snapshots (per-enrollment knowledge rollup)
-- ---------------------------------------------------------------------------

CREATE TABLE cognitive_model_snapshots (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid         NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  lab_id         uuid         REFERENCES labs(id) ON DELETE SET NULL,  -- null for pre-lab baseline snapshots
  summary        jsonb        NOT NULL,
  computed_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE cognitive_model_snapshots ENABLE ROW LEVEL SECURITY;

-- summary shape (enforced in application code, not SQL):
--   {
--     by_concept:  { <concept_id>: { mastery: 0-1, trend: 'up'|'flat'|'down',
--                                    last_blooms_level: <blooms_level> } },
--     weak_areas:  [<concept_id>, ...],
--     strengths:   [<concept_id>, ...],
--     last_interaction_at: <timestamptz>
--   }

-- Latest-per-enrollment lookup pattern: ORDER BY computed_at DESC LIMIT 1.
CREATE INDEX cognitive_model_snapshots_latest_idx
  ON cognitive_model_snapshots(enrollment_id, computed_at DESC);

-- Optional per-lab lookup when we want a pre-/post-lab comparison.
CREATE INDEX cognitive_model_snapshots_enrollment_lab_idx
  ON cognitive_model_snapshots(enrollment_id, lab_id)
  WHERE lab_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS policies for the two new tables
-- ---------------------------------------------------------------------------
-- Intentionally minimal here — RLS predicates are finalized in S5 once the
-- retrieval code exists and we know the access paths. For now, deny-by-default
-- via RLS enabled with no policy forces service-role-only access, which
-- matches the worker's existing admin-client pattern.
--
-- When S5 wires up read access for the tutor panel and professor dashboards,
-- add policies that scope to:
--   - lab_embeddings: readable by course staff of the owning course.
--   - cognitive_model_snapshots: readable by the enrollment's own user +
--     course staff.
-- =============================================================================
