'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const startOrResumeReviewSchema = z.object({
  instanceId: z.string().uuid(),
  labId: z.string().uuid(),
})

const submitReviewResponseSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  answerText: z.string().min(1, 'Answer cannot be empty'),
})

const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// startOrResumeReview
// ---------------------------------------------------------------------------

export async function startOrResumeReview(input: { instanceId: string; labId: string }) {
  try {
    const parsed = startOrResumeReviewSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const user = await getCurrentUser()
    if (!user) return { success: false as const, error: 'Unauthorized' }

    const admin = createAdminClient()
    const { instanceId, labId } = parsed.data

    // Verify enrollment
    const { data: enrollment, error: enrollErr } = await admin
      .from('enrollments')
      .select('id')
      .eq('course_instance_id', instanceId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (enrollErr || !enrollment) {
      return { success: false as const, error: 'Not enrolled in this course' }
    }

    // Verify labId belongs to this course instance (prevents IDOR across courses)
    const { data: instance, error: instanceErr } = await admin
      .from('course_instances')
      .select('course_id')
      .eq('id', instanceId)
      .single()

    if (instanceErr || !instance) {
      return { success: false as const, error: 'Course instance not found' }
    }

    const { data: labRow, error: labErr } = await admin
      .from('labs')
      .select('id, modules!inner(course_id)')
      .eq('id', labId)
      .single()

    if (labErr || !labRow) {
      return { success: false as const, error: 'Lab not found' }
    }

    type LabWithModule = typeof labRow & { modules: { course_id: string } }
    const lab = labRow as unknown as LabWithModule

    if (lab.modules.course_id !== instance.course_id) {
      return { success: false as const, error: 'Lab does not belong to this course' }
    }

    // Find or create session
    const { data: existing } = await admin
      .from('review_sessions')
      .select('id')
      .eq('enrollment_id', enrollment.id)
      .eq('lab_id', labId)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let sessionId: string

    if (existing) {
      sessionId = existing.id
    } else {
      const { data: newSession, error: insertErr } = await admin
        .from('review_sessions')
        .insert({ lab_id: labId, enrollment_id: enrollment.id })
        .select('id')
        .single()

      if (insertErr || !newSession) {
        return { success: false as const, error: insertErr?.message ?? 'Failed to create session' }
      }
      sessionId = newSession.id
    }

    // Fetch all active questions for this lab ordered by position
    const { data: questions, error: qErr } = await admin
      .from('review_questions')
      .select('id, question_text, blooms_level, position')
      .eq('lab_id', labId)
      .eq('is_active', true)
      .order('position', { ascending: true })

    if (qErr) {
      return { success: false as const, error: qErr.message }
    }

    // Fetch any existing responses for this session (for resume)
    const { data: responses } = await admin
      .from('review_responses')
      .select('review_question_id, answer_text')
      .eq('review_session_id', sessionId)

    const answeredMap = new Map(
      (responses ?? []).map((r) => [r.review_question_id, r.answer_text])
    )

    return {
      success: true as const,
      sessionId,
      enrollmentId: enrollment.id,
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        question_text: q.question_text,
        blooms_level: q.blooms_level,
        position: q.position,
        answered_text: answeredMap.get(q.id) ?? null,
      })),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// submitReviewResponse
// ---------------------------------------------------------------------------

export async function submitReviewResponse(input: {
  sessionId: string
  questionId: string
  answerText: string
}) {
  try {
    const parsed = submitReviewResponseSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const user = await getCurrentUser()
    if (!user) return { success: false as const, error: 'Unauthorized' }

    const admin = createAdminClient()
    const { sessionId, questionId, answerText } = parsed.data

    // Verify session belongs to current user
    const { data: session, error: sessErr } = await admin
      .from('review_sessions')
      .select('id, lab_id, enrollment_id, enrollments!inner(user_id)')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) {
      return { success: false as const, error: 'Session not found' }
    }

    type SessionRow = typeof session & {
      enrollments: { user_id: string }
    }
    const sess = session as unknown as SessionRow
    if (sess.enrollments.user_id !== user.id) {
      return { success: false as const, error: 'Unauthorized' }
    }

    // Verify question belongs to this session's lab and is active
    const { data: q, error: qCheckErr } = await admin
      .from('review_questions')
      .select('id')
      .eq('id', questionId)
      .eq('lab_id', sess.lab_id)
      .eq('is_active', true)
      .maybeSingle()

    if (qCheckErr || !q) {
      return { success: false as const, error: 'Question not found' }
    }

    // Atomic upsert — requires UNIQUE(review_session_id, review_question_id) from migration 004
    const { error: upsertErr } = await admin
      .from('review_responses')
      .upsert(
        { review_session_id: sessionId, review_question_id: questionId, answer_text: answerText },
        { onConflict: 'review_session_id,review_question_id' }
      )

    if (upsertErr) {
      return { success: false as const, error: upsertErr.message }
    }

    // Determine next question id
    const { data: allQuestions } = await admin
      .from('review_questions')
      .select('id, position')
      .eq('lab_id', sess.lab_id)
      .eq('is_active', true)
      .order('position', { ascending: true })

    const questions = allQuestions ?? []
    const currentIdx = questions.findIndex((q) => q.id === questionId)
    const nextQuestion = currentIdx >= 0 ? questions[currentIdx + 1] : null

    return {
      success: true as const,
      nextQuestionId: nextQuestion?.id ?? null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// completeReview
// ---------------------------------------------------------------------------

export async function completeReview(input: { sessionId: string }) {
  try {
    const parsed = sessionIdSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const user = await getCurrentUser()
    if (!user) return { success: false as const, error: 'Unauthorized' }

    const admin = createAdminClient()
    const { sessionId } = parsed.data

    // Verify ownership + fetch lab chain for course_id
    const { data: session, error: sessErr } = await admin
      .from('review_sessions')
      .select(
        'id, lab_id, enrollment_id, enrollments!inner(user_id), labs!inner(module_id, modules!inner(course_id))'
      )
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) {
      return { success: false as const, error: 'Session not found' }
    }

    type SessionFull = typeof session & {
      enrollments: { user_id: string }
      labs: { module_id: string; modules: { course_id: string } }
    }
    const sess = session as unknown as SessionFull

    if (sess.enrollments.user_id !== user.id) {
      return { success: false as const, error: 'Unauthorized' }
    }

    // Mark session complete — only if not already completed (idempotency guard)
    const { data: updated, error: updateErr } = await admin
      .from('review_sessions')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('completed_at', null)
      .select('id')
      .maybeSingle()

    if (updateErr) {
      return { success: false as const, error: updateErr.message }
    }
    if (!updated) {
      // Already completed — no-op, avoid duplicate job
      return { success: true as const }
    }

    // Enqueue evaluate_review job
    // NOTE: requires `evaluate_review` in the job_type enum (migration 003)
    const { error: enqueueErr } = await admin.from('generation_jobs').insert({
      course_id: sess.labs.modules.course_id,
      created_by: user.id,
      job_type: 'evaluate_review',
      status: 'pending',
      input_payload: { session_id: sessionId },
    })

    if (enqueueErr) {
      // Roll back so the student can retry
      await admin
        .from('review_sessions')
        .update({ completed_at: null })
        .eq('id', sessionId)
      return { success: false as const, error: 'Failed to queue evaluation. Please try again.' }
    }

    return { success: true as const }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// getReviewResults
// ---------------------------------------------------------------------------

export async function getReviewResults(input: { sessionId: string }) {
  try {
    const parsed = sessionIdSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const user = await getCurrentUser()
    if (!user) return { success: false as const, error: 'Unauthorized' }

    const admin = createAdminClient()
    const { sessionId } = parsed.data

    // Verify session ownership
    const { data: session, error: sessErr } = await admin
      .from('review_sessions')
      .select('id, enrollment_id, enrollments!inner(user_id)')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) {
      return { success: false as const, error: 'Session not found' }
    }

    type SessionOwner = typeof session & { enrollments: { user_id: string } }
    const sess = session as unknown as SessionOwner
    if (sess.enrollments.user_id !== user.id) {
      return { success: false as const, error: 'Unauthorized' }
    }

    // Fetch evaluations joined with responses, questions, and concepts
    const { data: evals, error: evalErr } = await admin
      .from('concept_evaluations')
      .select(
        `
        id,
        blooms_level,
        mastery_score,
        reasoning,
        concepts!inner(name),
        review_responses!inner(
          answer_text,
          review_questions!inner(question_text)
        )
      `
      )
      .eq('enrollment_id', sess.enrollment_id)
      .eq('review_responses.review_session_id', sessionId)

    if (evalErr) {
      return { success: false as const, error: evalErr.message }
    }

    type EvalRow = {
      id: string
      blooms_level: string
      mastery_score: number
      reasoning: string
      concepts: { name: string }
      review_responses: {
        answer_text: string
        review_questions: { question_text: string }
      }
    }

    const rows = (evals ?? []) as unknown as EvalRow[]

    // Privacy: strip mastery_score and confidence — derive mastery_bucket server-side
    const evaluations = rows.map((e) => ({
      id: e.id,
      concept_name: e.concepts.name,
      blooms_level: e.blooms_level,
      reasoning: e.reasoning,
      mastery_bucket: (e.mastery_score >= 0.6 ? 'on_track' : 'review_needed') as
        | 'on_track'
        | 'review_needed',
      question_text: e.review_responses.review_questions.question_text,
      answer_text: e.review_responses.answer_text,
    }))

    return { success: true as const, evaluations }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}
