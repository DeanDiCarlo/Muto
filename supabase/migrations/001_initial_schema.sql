-- =============================================================================
-- Muto — Initial Schema Migration
-- 001_initial_schema.sql
--
-- Creates all enums, tables, indexes, RLS policies, and the
-- student_evaluations_view for Phase 1.
--
-- DEVIATION NOTE:
--   source_materials.lab_id is NULLABLE (NULL until the lab is created from
--   the generation plan). SCHEMA.md shows it as NOT NULL, but materials are
--   uploaded and parsed before labs exist. course_id is added as a NOT NULL
--   FK on source_materials so that RLS can scope access to the owning course
--   without requiring a lab reference.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('professor', 'ta', 'student');

CREATE TYPE block_type AS ENUM (
  'heading', 'paragraph', 'figure', 'table', 'equation', 'list', 'code'
);

CREATE TYPE blooms_level AS ENUM (
  'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'
);

CREATE TYPE concept_status AS ENUM ('proposed', 'approved', 'rejected');

CREATE TYPE question_source AS ENUM ('generated', 'custom');

CREATE TYPE job_type AS ENUM (
  'parse_materials',
  'propose_plan',
  'generate_lab',
  'generate_batch',
  'generate_embeddings',
  'generate_review_questions'
);

CREATE TYPE job_status AS ENUM (
  'pending', 'running', 'completed', 'failed', 'cancelled'
);

CREATE TYPE generation_plan_status AS ENUM (
  'draft', 'approved', 'generating', 'completed'
);

CREATE TYPE lab_generation_status AS ENUM (
  'pending', 'generating', 'complete', 'failed'
);

CREATE TYPE chat_role AS ENUM ('student', 'assistant');

CREATE TYPE report_type AS ENUM ('scheduled', 'on_demand');

CREATE TYPE usage_type AS ENUM (
  'chatbot',
  'review_evaluation',
  'lab_generation',
  'plan_generation',
  'embedding_generation',
  'material_parsing'
);

CREATE TYPE limit_type AS ENUM (
  'per_user_hourly',
  'per_user_daily',
  'per_institution_daily',
  'per_institution_monthly',
  'cost_daily_cents',
  'cost_monthly_cents'
);

CREATE TYPE limit_action AS ENUM ('block', 'alert', 'queue');

CREATE TYPE alert_type AS ENUM ('threshold_warning', 'threshold_exceeded');

CREATE TYPE staff_role AS ENUM ('professor', 'ta');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- institutions ---------------------------------------------------------------
CREATE TABLE institutions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  slug         text        NOT NULL UNIQUE,
  sso_provider text,
  sso_config   jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- users ----------------------------------------------------------------------
-- Mirrors auth.users. Populated via a trigger on auth.users INSERT.
CREATE TABLE users (
  id             uuid        PRIMARY KEY,  -- matches auth.users.id
  institution_id uuid        NOT NULL REFERENCES institutions(id),
  email          text        NOT NULL UNIQUE,
  full_name      text,
  role           user_role   NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_users_auth FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Trigger: auto-insert into public.users when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- institution_id and role must be provided via user_metadata at signup
  INSERT INTO public.users (id, institution_id, email, full_name, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'institution_id')::uuid,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    (NEW.raw_user_meta_data->>'role')::user_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- courses --------------------------------------------------------------------
CREATE TABLE courses (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid        NOT NULL REFERENCES institutions(id),
  created_by     uuid        NOT NULL REFERENCES users(id),
  title          text        NOT NULL,
  description    text,
  subject_area   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- course_instances -----------------------------------------------------------
CREATE TABLE course_instances (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL REFERENCES courses(id),
  semester    text        NOT NULL,
  join_code   text        NOT NULL UNIQUE,
  join_link   text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE course_instances ENABLE ROW LEVEL SECURITY;

-- course_staff ---------------------------------------------------------------
CREATE TABLE course_staff (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_instance_id uuid        NOT NULL REFERENCES course_instances(id),
  user_id            uuid        NOT NULL REFERENCES users(id),
  role               staff_role  NOT NULL,
  can_edit_structure boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_instance_id, user_id)
);

ALTER TABLE course_staff ENABLE ROW LEVEL SECURITY;

-- enrollments ----------------------------------------------------------------
CREATE TABLE enrollments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_instance_id uuid        NOT NULL REFERENCES course_instances(id),
  user_id            uuid        NOT NULL REFERENCES users(id),
  enrolled_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_instance_id, user_id)
);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

-- modules --------------------------------------------------------------------
CREATE TABLE modules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid        NOT NULL REFERENCES courses(id),
  title       text        NOT NULL,
  description text,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

-- labs -----------------------------------------------------------------------
CREATE TABLE labs (
  id                uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id         uuid                  NOT NULL REFERENCES modules(id),
  title             text                  NOT NULL,
  description       text,
  position          integer               NOT NULL DEFAULT 0,
  content           jsonb,
  blooms_structure  jsonb,
  generation_status lab_generation_status NOT NULL DEFAULT 'pending',
  generated_at      timestamptz,
  created_at        timestamptz           NOT NULL DEFAULT now()
);

ALTER TABLE labs ENABLE ROW LEVEL SECURITY;

-- source_materials -----------------------------------------------------------
-- DEVIATION: lab_id is NULLABLE (materials exist before labs are created).
-- course_id is added as NOT NULL to scope RLS without requiring a lab.
CREATE TABLE source_materials (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        uuid        NOT NULL REFERENCES courses(id),
  lab_id           uuid        REFERENCES labs(id),   -- NULLABLE: assigned after lab creation
  uploaded_by      uuid        NOT NULL REFERENCES users(id),
  file_name        text        NOT NULL,
  file_type        text        NOT NULL,
  storage_path     text        NOT NULL,
  file_size_bytes  bigint,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE source_materials ENABLE ROW LEVEL SECURITY;

-- content_blocks -------------------------------------------------------------
CREATE TABLE content_blocks (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_material_id uuid        NOT NULL REFERENCES source_materials(id),
  lab_id             uuid        REFERENCES labs(id),
  block_type         block_type  NOT NULL,
  content            text        NOT NULL,
  heading_level      integer,
  position           integer     NOT NULL DEFAULT 0,
  page_number        integer,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_blocks ENABLE ROW LEVEL SECURITY;

-- content_embeddings ---------------------------------------------------------
CREATE TABLE content_embeddings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_block_id uuid        NOT NULL REFERENCES content_blocks(id),
  lab_id           uuid        REFERENCES labs(id),
  embedding        vector(1536) NOT NULL,
  chunk_text       text        NOT NULL,
  chunk_index      integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

-- concepts -------------------------------------------------------------------
CREATE TABLE concepts (
  id                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id            uuid            NOT NULL REFERENCES labs(id),
  name              text            NOT NULL,
  description       text,
  parent_concept_id uuid            REFERENCES concepts(id),
  status            concept_status  NOT NULL DEFAULT 'proposed',
  position          integer         NOT NULL DEFAULT 0,
  created_at        timestamptz     NOT NULL DEFAULT now()
);

ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;

-- review_questions -----------------------------------------------------------
CREATE TABLE review_questions (
  id                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id            uuid            NOT NULL REFERENCES labs(id),
  concept_id        uuid            NOT NULL REFERENCES concepts(id),
  question_text     text            NOT NULL,
  blooms_level      blooms_level    NOT NULL,
  source            question_source NOT NULL DEFAULT 'generated',
  evaluation_rubric text,
  is_active         boolean         NOT NULL DEFAULT true,
  position          integer         NOT NULL DEFAULT 0,
  created_at        timestamptz     NOT NULL DEFAULT now()
);

ALTER TABLE review_questions ENABLE ROW LEVEL SECURITY;

-- review_sessions ------------------------------------------------------------
CREATE TABLE review_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id        uuid        NOT NULL REFERENCES labs(id),
  enrollment_id uuid        NOT NULL REFERENCES enrollments(id),
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;

-- review_responses -----------------------------------------------------------
CREATE TABLE review_responses (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_session_id  uuid        NOT NULL REFERENCES review_sessions(id),
  review_question_id uuid        NOT NULL REFERENCES review_questions(id),
  answer_text        text        NOT NULL,
  answered_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;

-- concept_evaluations --------------------------------------------------------
CREATE TABLE concept_evaluations (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  review_response_id uuid          NOT NULL REFERENCES review_responses(id),
  concept_id         uuid          NOT NULL REFERENCES concepts(id),
  enrollment_id      uuid          NOT NULL REFERENCES enrollments(id),
  blooms_level       blooms_level  NOT NULL,
  mastery_score      numeric(3,2)  NOT NULL CHECK (mastery_score >= 0 AND mastery_score <= 1),
  confidence         numeric(3,2)  NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning          text,
  evaluated_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE concept_evaluations ENABLE ROW LEVEL SECURITY;

-- insight_deadlines ----------------------------------------------------------
CREATE TABLE insight_deadlines (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_instance_id uuid        NOT NULL REFERENCES course_instances(id),
  label              text        NOT NULL,
  day_of_week        integer     CHECK (day_of_week >= 0 AND day_of_week <= 6),
  time               time        NOT NULL,
  is_recurring       boolean     NOT NULL DEFAULT false,
  specific_date      date,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insight_deadlines ENABLE ROW LEVEL SECURITY;

-- insight_reports ------------------------------------------------------------
CREATE TABLE insight_reports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_instance_id uuid        NOT NULL REFERENCES course_instances(id),
  insight_deadline_id uuid       REFERENCES insight_deadlines(id),
  report_type        report_type NOT NULL,
  content            jsonb       NOT NULL,
  generated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insight_reports ENABLE ROW LEVEL SECURITY;

-- chat_sessions --------------------------------------------------------------
CREATE TABLE chat_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id          uuid        NOT NULL REFERENCES labs(id),
  enrollment_id   uuid        NOT NULL REFERENCES enrollments(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- chat_messages --------------------------------------------------------------
CREATE TABLE chat_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id uuid        NOT NULL REFERENCES chat_sessions(id),
  role            chat_role   NOT NULL,
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- generation_jobs ------------------------------------------------------------
CREATE TABLE generation_jobs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id             uuid        NOT NULL REFERENCES courses(id),
  created_by            uuid        NOT NULL REFERENCES users(id),
  job_type              job_type    NOT NULL,
  status                job_status  NOT NULL DEFAULT 'pending',
  priority              integer     NOT NULL DEFAULT 0,
  input_payload         jsonb,
  output_payload        jsonb,
  progress_percent      integer     NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  current_step          text,
  error_message         text,
  estimated_cost_cents  integer,
  actual_cost_cents     integer,
  started_at            timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- generation_plans -----------------------------------------------------------
CREATE TABLE generation_plans (
  id                uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         uuid                  NOT NULL REFERENCES courses(id),
  generation_job_id uuid                  NOT NULL REFERENCES generation_jobs(id),
  plan_data         jsonb                 NOT NULL,
  status            generation_plan_status NOT NULL DEFAULT 'draft',
  professor_notes   text,
  created_at        timestamptz           NOT NULL DEFAULT now(),
  approved_at       timestamptz
);

ALTER TABLE generation_plans ENABLE ROW LEVEL SECURITY;

-- api_usage_log --------------------------------------------------------------
CREATE TABLE api_usage_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id),
  institution_id    uuid        NOT NULL REFERENCES institutions(id),
  usage_type        usage_type  NOT NULL,
  model             text        NOT NULL,
  input_tokens      integer     NOT NULL DEFAULT 0,
  output_tokens     integer     NOT NULL DEFAULT 0,
  cost_cents        integer     NOT NULL DEFAULT 0,
  generation_job_id uuid        REFERENCES generation_jobs(id),
  lab_id            uuid        REFERENCES labs(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

-- rate_limits ----------------------------------------------------------------
CREATE TABLE rate_limits (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id   uuid         REFERENCES institutions(id),  -- NULL = global default
  usage_type       usage_type   NOT NULL,
  limit_type       limit_type   NOT NULL,
  limit_value      integer      NOT NULL,
  action_on_limit  limit_action NOT NULL DEFAULT 'block',
  is_active        boolean      NOT NULL DEFAULT true,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- cost_alerts ----------------------------------------------------------------
CREATE TABLE cost_alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid        NOT NULL REFERENCES institutions(id),
  rate_limit_id   uuid        NOT NULL REFERENCES rate_limits(id),
  alert_type      alert_type  NOT NULL,
  current_value   integer     NOT NULL,
  limit_value     integer     NOT NULL,
  message         text        NOT NULL,
  acknowledged    boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cost_alerts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- View: student_evaluations_view
-- Exposes concept_evaluations without mastery_score and confidence columns.
-- Students read this view; they see reasoning but not the numeric scores.
-- ---------------------------------------------------------------------------
CREATE VIEW student_evaluations_view AS
  SELECT
    id,
    review_response_id,
    concept_id,
    enrollment_id,
    blooms_level,
    reasoning,
    evaluated_at
  FROM concept_evaluations;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- concept_evaluations
CREATE INDEX idx_concept_evaluations_trajectory
  ON concept_evaluations (enrollment_id, concept_id, evaluated_at);

CREATE INDEX idx_concept_evaluations_class_aggregate
  ON concept_evaluations (concept_id, enrollment_id);

-- content_embeddings
CREATE INDEX idx_content_embeddings_hnsw
  ON content_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_content_embeddings_lab_id
  ON content_embeddings (lab_id);

-- review_questions
CREATE INDEX idx_review_questions_adaptive
  ON review_questions (lab_id, concept_id, blooms_level);

-- review_sessions
CREATE INDEX idx_review_sessions_student_lab
  ON review_sessions (enrollment_id, lab_id);

-- generation_jobs
CREATE INDEX idx_generation_jobs_worker_poll
  ON generation_jobs (status, priority DESC, created_at ASC);

CREATE INDEX idx_generation_jobs_course_status
  ON generation_jobs (course_id, status);

-- api_usage_log
CREATE INDEX idx_api_usage_log_user_rate_limit
  ON api_usage_log (user_id, usage_type, created_at);

CREATE INDEX idx_api_usage_log_institution_cost
  ON api_usage_log (institution_id, usage_type, created_at);

CREATE INDEX idx_api_usage_log_job
  ON api_usage_log (generation_job_id);

-- cost_alerts
CREATE INDEX idx_cost_alerts_unacknowledged
  ON cost_alerts (institution_id, acknowledged, created_at);

-- ---------------------------------------------------------------------------
-- RLS Policies
-- ---------------------------------------------------------------------------

-- Helper: check if current user is a professor who owns the course
-- (used inline in policies below)

-- ============================================================
-- courses
-- ============================================================
-- Professor: CRUD own courses
CREATE POLICY courses_professor_crud ON courses
  FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid()
  )
  WITH CHECK (
    created_by = auth.uid()
  );

-- TA: read courses they are staff on
CREATE POLICY courses_ta_read ON courses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE ci.course_id = courses.id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- ============================================================
-- course_instances
-- ============================================================
CREATE POLICY course_instances_professor_crud ON course_instances
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = course_instances.course_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = course_instances.course_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY course_instances_ta_read ON course_instances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
       WHERE cs.course_instance_id = course_instances.id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY course_instances_student_read ON course_instances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
       WHERE e.course_instance_id = course_instances.id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- modules
-- ============================================================
CREATE POLICY modules_professor_crud ON modules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = modules.course_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = modules.course_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY modules_ta_read ON modules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE ci.course_id = modules.course_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY modules_student_read ON modules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
        JOIN course_instances ci ON ci.id = e.course_instance_id
       WHERE ci.course_id = modules.course_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- labs
-- ============================================================
CREATE POLICY labs_professor_crud ON labs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM modules m
        JOIN courses c ON c.id = m.course_id
       WHERE m.id = labs.module_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM modules m
        JOIN courses c ON c.id = m.course_id
       WHERE m.id = labs.module_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY labs_ta_read ON labs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM modules m
        JOIN course_staff cs ON TRUE
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE m.id = labs.module_id
         AND ci.course_id = m.course_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY labs_student_read ON labs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM modules m
        JOIN course_instances ci ON ci.course_id = m.course_id
        JOIN enrollments e ON e.course_instance_id = ci.id
       WHERE m.id = labs.module_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- source_materials  (scoped via course_id — the deviation)
-- ============================================================
CREATE POLICY source_materials_professor_crud ON source_materials
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = source_materials.course_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = source_materials.course_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY source_materials_ta_read ON source_materials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE ci.course_id = source_materials.course_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- ============================================================
-- concepts
-- ============================================================
CREATE POLICY concepts_professor_all ON concepts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
       WHERE l.id = concepts.lab_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
       WHERE l.id = concepts.lab_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY concepts_ta_read ON concepts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN course_staff cs ON TRUE
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE l.id = concepts.lab_id
         AND ci.course_id = m.course_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY concepts_student_read_approved ON concepts
  FOR SELECT
  TO authenticated
  USING (
    concepts.status = 'approved'
    AND EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN course_instances ci ON ci.course_id = m.course_id
        JOIN enrollments e ON e.course_instance_id = ci.id
       WHERE l.id = concepts.lab_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- review_questions
-- ============================================================
CREATE POLICY review_questions_professor_crud ON review_questions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
       WHERE l.id = review_questions.lab_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
       WHERE l.id = review_questions.lab_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY review_questions_ta_read ON review_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN course_staff cs ON TRUE
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE l.id = review_questions.lab_id
         AND ci.course_id = m.course_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY review_questions_student_read_active ON review_questions
  FOR SELECT
  TO authenticated
  USING (
    review_questions.is_active = true
    AND EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN course_instances ci ON ci.course_id = m.course_id
        JOIN enrollments e ON e.course_instance_id = ci.id
       WHERE l.id = review_questions.lab_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- review_responses
-- ============================================================
CREATE POLICY review_responses_professor_read ON review_responses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM review_sessions rs
        JOIN labs l ON l.id = rs.lab_id
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
       WHERE rs.id = review_responses.review_session_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY review_responses_ta_read ON review_responses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM review_sessions rs
        JOIN enrollments e ON e.id = rs.enrollment_id
        JOIN course_staff cs ON cs.course_instance_id = e.course_instance_id
       WHERE rs.id = review_responses.review_session_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY review_responses_student_crud ON review_responses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM review_sessions rs
        JOIN enrollments e ON e.id = rs.enrollment_id
       WHERE rs.id = review_responses.review_session_id
         AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM review_sessions rs
        JOIN enrollments e ON e.id = rs.enrollment_id
       WHERE rs.id = review_responses.review_session_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- concept_evaluations
-- ============================================================
CREATE POLICY concept_evaluations_professor_read ON concept_evaluations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
        JOIN course_instances ci ON ci.id = e.course_instance_id
        JOIN courses c ON c.id = ci.course_id
       WHERE e.id = concept_evaluations.enrollment_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY concept_evaluations_ta_read ON concept_evaluations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
        JOIN course_staff cs ON cs.course_instance_id = e.course_instance_id
       WHERE e.id = concept_evaluations.enrollment_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- Students may only read their own rows via the student_evaluations_view.
-- Direct table access for students is intentionally omitted; the view enforces
-- column exclusion. This policy exists so the view (SECURITY INVOKER) works.
CREATE POLICY concept_evaluations_student_read_own ON concept_evaluations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
       WHERE e.id = concept_evaluations.enrollment_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- insight_deadlines
-- ============================================================
CREATE POLICY insight_deadlines_professor_crud ON insight_deadlines
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_instances ci
        JOIN courses c ON c.id = ci.course_id
       WHERE ci.id = insight_deadlines.course_instance_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM course_instances ci
        JOIN courses c ON c.id = ci.course_id
       WHERE ci.id = insight_deadlines.course_instance_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY insight_deadlines_ta_read ON insight_deadlines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
       WHERE cs.course_instance_id = insight_deadlines.course_instance_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- ============================================================
-- insight_reports
-- ============================================================
CREATE POLICY insight_reports_professor_read ON insight_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_instances ci
        JOIN courses c ON c.id = ci.course_id
       WHERE ci.id = insight_reports.course_instance_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY insight_reports_ta_read ON insight_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
       WHERE cs.course_instance_id = insight_reports.course_instance_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- ============================================================
-- chat_sessions
-- ============================================================
CREATE POLICY chat_sessions_professor_read ON chat_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
        JOIN course_instances ci ON ci.id = e.course_instance_id
        JOIN courses c ON c.id = ci.course_id
       WHERE e.id = chat_sessions.enrollment_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY chat_sessions_ta_read ON chat_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
        JOIN course_staff cs ON cs.course_instance_id = e.course_instance_id
       WHERE e.id = chat_sessions.enrollment_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY chat_sessions_student_crud ON chat_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
       WHERE e.id = chat_sessions.enrollment_id
         AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollments e
       WHERE e.id = chat_sessions.enrollment_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- chat_messages
-- ============================================================
CREATE POLICY chat_messages_professor_read ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs_sess
        JOIN enrollments e ON e.id = cs_sess.enrollment_id
        JOIN course_instances ci ON ci.id = e.course_instance_id
        JOIN courses c ON c.id = ci.course_id
       WHERE cs_sess.id = chat_messages.chat_session_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY chat_messages_ta_read ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs_sess
        JOIN enrollments e ON e.id = cs_sess.enrollment_id
        JOIN course_staff cs ON cs.course_instance_id = e.course_instance_id
       WHERE cs_sess.id = chat_messages.chat_session_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

CREATE POLICY chat_messages_student_crud ON chat_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions cs_sess
        JOIN enrollments e ON e.id = cs_sess.enrollment_id
       WHERE cs_sess.id = chat_messages.chat_session_id
         AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions cs_sess
        JOIN enrollments e ON e.id = cs_sess.enrollment_id
       WHERE cs_sess.id = chat_messages.chat_session_id
         AND e.user_id = auth.uid()
    )
  );

-- ============================================================
-- generation_jobs
-- ============================================================
CREATE POLICY generation_jobs_professor_crud ON generation_jobs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = generation_jobs.course_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = generation_jobs.course_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY generation_jobs_ta_read ON generation_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE ci.course_id = generation_jobs.course_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- ============================================================
-- generation_plans
-- ============================================================
CREATE POLICY generation_plans_professor_crud ON generation_plans
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = generation_plans.course_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
       WHERE c.id = generation_plans.course_id
         AND c.created_by = auth.uid()
    )
  );

CREATE POLICY generation_plans_ta_read ON generation_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
        JOIN course_instances ci ON ci.id = cs.course_instance_id
       WHERE ci.course_id = generation_plans.course_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- ============================================================
-- api_usage_log
-- ============================================================
CREATE POLICY api_usage_log_professor_read ON api_usage_log
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = auth.uid()
         AND u.role = 'professor'
    )
  );

CREATE POLICY api_usage_log_student_read ON api_usage_log
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = auth.uid()
         AND u.role = 'student'
    )
  );

-- ============================================================
-- rate_limits
-- ============================================================
CREATE POLICY rate_limits_professor_ta_read ON rate_limits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = auth.uid()
         AND u.role IN ('professor', 'ta')
    )
  );

CREATE POLICY rate_limits_student_read_own_type ON rate_limits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
       WHERE u.id = auth.uid()
         AND u.role = 'student'
    )
    AND usage_type IN ('chatbot', 'review_evaluation')
  );

-- ============================================================
-- cost_alerts  (admin only — no RLS policies for regular roles)
-- ============================================================
-- No policies created. Only service-role key (server-side) accesses this table.
