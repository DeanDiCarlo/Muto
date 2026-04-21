-- =============================================================================
-- Muto — Professor-defined display slugs
-- 007_display_slugs.sql
--
-- Adds a two-slug system for courses and course_instances:
--   - display_slug: professor-defined, human-readable, used in all frontend URLs.
--     Unique per institution so two professors at the same university can't
--     collide (mirrors how real course codes work: "S26-section-ac" is
--     institution-scoped, not global).
--   - slug (existing): UUID-suffixed internal identifier, stays in DB for
--     stability and collision-proof uniqueness. No longer used in URLs.
--
-- For course_instances, institution_id is denormalized from the parent course
-- so we can enforce the (institution_id, display_slug) unique index without a
-- trigger or subquery.
--
-- Backfill: display_slug = slug (the UUID-suffixed value). Existing routes keep
-- working because getCourseBySlug/getInstanceBySlug now query display_slug, and
-- the backfill makes display_slug == the slug that was already in URLs.
--
-- DENORM RISK (institution_id on course_instances):
--   institution_id is backfilled from courses.institution_id at creation time.
--   If a course ever moves institutions (not a product feature), a trigger would
--   be needed to keep this in sync. Declared WITHOUT ON UPDATE CASCADE for the
--   same reason as labs.course_id in migration 006.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. courses.display_slug
-- ---------------------------------------------------------------------------

ALTER TABLE courses ADD COLUMN display_slug text;

UPDATE courses SET display_slug = slug;

ALTER TABLE courses ALTER COLUMN display_slug SET NOT NULL;

-- Unique per institution (institution_id already exists on courses).
CREATE UNIQUE INDEX courses_display_slug_institution_idx
  ON courses(institution_id, display_slug);

-- ---------------------------------------------------------------------------
-- 2. course_instances.institution_id (denorm) + display_slug
-- ---------------------------------------------------------------------------

ALTER TABLE course_instances ADD COLUMN institution_id uuid REFERENCES institutions(id);

UPDATE course_instances ci
  SET institution_id = c.institution_id
  FROM courses c
  WHERE c.id = ci.course_id;

ALTER TABLE course_instances ALTER COLUMN institution_id SET NOT NULL;

ALTER TABLE course_instances ADD COLUMN display_slug text;

UPDATE course_instances SET display_slug = slug;

ALTER TABLE course_instances ALTER COLUMN display_slug SET NOT NULL;

-- Unique per institution.
CREATE UNIQUE INDEX course_instances_display_slug_institution_idx
  ON course_instances(institution_id, display_slug);
