-- ============================================================
-- Migration: 002_student_rls.sql
-- Adds missing RLS policies for student-facing tables that
-- have RLS enabled but zero policies (= total deny).
--
-- Tables addressed:
--   - enrollments       (no policies in 001)
--   - course_staff      (no policies in 001)
--   - review_sessions   (no policies in 001)
--
-- Other student-facing tables (review_responses, concept_evaluations,
-- chat_sessions, chat_messages, course_instances) already have
-- policies from 001_initial_schema.sql and are not modified here.
-- ============================================================

-- ============================================================
-- enrollments
-- ============================================================
-- Student: read own enrollments
CREATE POLICY enrollments_student_read_own ON enrollments
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Student: insert self into an active course instance (joinCourse flow)
CREATE POLICY enrollments_student_insert_self ON enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM course_instances ci
       WHERE ci.id = enrollments.course_instance_id
         AND ci.is_active = true
    )
  );

-- Professor: read enrollments for any of their course instances
CREATE POLICY enrollments_professor_read ON enrollments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_instances ci
        JOIN courses c ON c.id = ci.course_id
       WHERE ci.id = enrollments.course_instance_id
         AND c.created_by = auth.uid()
    )
  );

-- Professor: delete enrollments from their course instances
CREATE POLICY enrollments_professor_delete ON enrollments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_instances ci
        JOIN courses c ON c.id = ci.course_id
       WHERE ci.id = enrollments.course_instance_id
         AND c.created_by = auth.uid()
    )
  );

-- TA: read enrollments for instances they staff
CREATE POLICY enrollments_ta_read ON enrollments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_staff cs
       WHERE cs.course_instance_id = enrollments.course_instance_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );

-- ============================================================
-- course_staff
-- ============================================================
-- User: read own staff memberships
CREATE POLICY course_staff_self_read ON course_staff
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- Professor (course owner): full CRUD on staff for their instances
CREATE POLICY course_staff_owner_crud ON course_staff
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_instances ci
        JOIN courses c ON c.id = ci.course_id
       WHERE ci.id = course_staff.course_instance_id
         AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM course_instances ci
        JOIN courses c ON c.id = ci.course_id
       WHERE ci.id = course_staff.course_instance_id
         AND c.created_by = auth.uid()
    )
  );

-- ============================================================
-- review_sessions
-- ============================================================
-- Student: CRUD own sessions (start, resume, complete)
CREATE POLICY review_sessions_student_crud ON review_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
       WHERE e.id = review_sessions.enrollment_id
         AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollments e
       WHERE e.id = review_sessions.enrollment_id
         AND e.user_id = auth.uid()
    )
  );

-- Professor: read review sessions for their courses
CREATE POLICY review_sessions_professor_read ON review_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM labs l
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
       WHERE l.id = review_sessions.lab_id
         AND c.created_by = auth.uid()
    )
  );

-- TA: read review sessions for their staffed instances
CREATE POLICY review_sessions_ta_read ON review_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM enrollments e
        JOIN course_staff cs ON cs.course_instance_id = e.course_instance_id
       WHERE e.id = review_sessions.enrollment_id
         AND cs.user_id = auth.uid()
         AND cs.role = 'ta'
    )
  );
