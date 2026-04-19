import Anthropic from '@anthropic-ai/sdk'
import { registerProcessor, updateProgress, type GenerationJob } from '../lib/job-runner.js'
import { supabase } from '../lib/supabase.js'
import { trackUsage } from '../lib/cost-tracker.js'
import {
  evaluateReviewPayloadSchema,
  aiConceptEvaluationsSchema,
} from '../../src/types/generation.js'
import {
  buildEvaluateReviewSystemPrompt,
  buildEvaluateReviewUserMessage,
} from '../lib/prompts/evaluate-review.js'

const anthropic = new Anthropic()
const MODEL = 'claude-sonnet-4-20250514'

function calculateCostCents(inputTokens: number, outputTokens: number): number {
  return Math.ceil(((inputTokens * 3 + outputTokens * 15) / 1_000_000) * 100)
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim())
    }
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error('No valid JSON found in response')
  }
}

async function evaluateReview(job: GenerationJob): Promise<Record<string, unknown> | null> {
  const payload = evaluateReviewPayloadSchema.parse(job.input_payload)

  // --- Fetch session + course chain ---
  const { data: session, error: sessError } = await supabase
    .from('review_sessions')
    .select('id, lab_id, enrollment_id, labs!inner(module_id, modules!inner(course_id))')
    .eq('id', payload.session_id)
    .single()

  if (sessError || !session) {
    throw new Error(`Review session not found: ${payload.session_id}`)
  }

  type SessionRow = {
    id: string
    lab_id: string
    enrollment_id: string
    labs: { module_id: string; modules: { course_id: string } }
  }
  const sess = session as unknown as SessionRow
  const courseId = sess.labs.modules.course_id

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, created_by, institution_id')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    throw new Error(`Course not found for session ${payload.session_id}`)
  }

  await updateProgress(job.id, 15, 'Loading responses')

  // --- Fetch responses with joined question + concept ---
  const { data: responses, error: respError } = await supabase
    .from('review_responses')
    .select(
      `
      id,
      answer_text,
      review_questions!inner(
        id,
        question_text,
        blooms_level,
        evaluation_rubric,
        concept_id,
        concepts!inner(id, name)
      )
    `
    )
    .eq('review_session_id', payload.session_id)

  if (respError) {
    throw new Error(`Failed to fetch review responses: ${respError.message}`)
  }

  type ResponseRow = {
    id: string
    answer_text: string
    review_questions: {
      id: string
      question_text: string
      blooms_level: string
      evaluation_rubric: string
      concept_id: string
      concepts: { id: string; name: string }
    }
  }
  const rows = (responses ?? []) as unknown as ResponseRow[]

  if (rows.length === 0) {
    await updateProgress(job.id, 100, 'Evaluation complete (empty session)')
    return {
      session_id: payload.session_id,
      evaluations_created: 0,
      reason: 'empty_session',
    }
  }

  await updateProgress(job.id, 30, 'Evaluating answers')

  // --- Claude call ---
  const inputs = rows.map((r) => ({
    review_response_id: r.id,
    concept_id: r.review_questions.concept_id,
    concept_name: r.review_questions.concepts.name,
    blooms_level: r.review_questions.blooms_level,
    evaluation_rubric: r.review_questions.evaluation_rubric,
    question_text: r.review_questions.question_text,
    answer_text: r.answer_text,
  }))

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildEvaluateReviewSystemPrompt(),
    messages: [{ role: 'user', content: buildEvaluateReviewUserMessage(inputs) }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in evaluate-review Claude response')
  }

  const parsed = aiConceptEvaluationsSchema.safeParse(extractJson(textBlock.text))
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Evaluations validation failed: ${issues}`)
  }

  const evaluations = parsed.data.evaluations

  if (evaluations.length !== rows.length) {
    throw new Error(
      `Evaluation count mismatch: expected ${rows.length}, got ${evaluations.length}`
    )
  }

  // Build lookup: response_id → expected concept_id for mismatch check.
  const expectedByResponseId = new Map(
    rows.map((r) => [r.id, r.review_questions.concept_id])
  )

  for (const ev of evaluations) {
    const expectedConcept = expectedByResponseId.get(ev.review_response_id)
    if (!expectedConcept) {
      throw new Error(
        `AI returned evaluation for unknown review_response_id ${ev.review_response_id}`
      )
    }
    if (ev.concept_id !== expectedConcept) {
      throw new Error(
        `AI remapped concept for response ${ev.review_response_id}: expected ${expectedConcept}, got ${ev.concept_id}`
      )
    }
  }

  await updateProgress(job.id, 80, 'Saving evaluations')

  // Idempotency: a retry would double-insert. Re-evaluation is safe to overwrite.
  const responseIds = rows.map((r) => r.id)
  const { error: deleteError } = await supabase
    .from('concept_evaluations')
    .delete()
    .in('review_response_id', responseIds)

  if (deleteError) {
    throw new Error(`Failed to clear prior evaluations: ${deleteError.message}`)
  }

  const now = new Date().toISOString()
  const insertRows = evaluations.map((ev) => ({
    review_response_id: ev.review_response_id,
    concept_id: ev.concept_id,
    enrollment_id: sess.enrollment_id,
    blooms_level: ev.blooms_level,
    mastery_score: ev.mastery_score,
    confidence: ev.confidence,
    reasoning: ev.reasoning,
    evaluated_at: now,
  }))

  const { error: insertError } = await supabase.from('concept_evaluations').insert(insertRows)
  if (insertError) {
    throw new Error(`Failed to insert concept evaluations: ${insertError.message}`)
  }

  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  await trackUsage({
    userId: course.created_by,
    institutionId: course.institution_id,
    usageType: 'review_evaluation',
    model: MODEL,
    inputTokens,
    outputTokens,
    costCents: calculateCostCents(inputTokens, outputTokens),
    generationJobId: job.id,
    labId: sess.lab_id,
  })

  await updateProgress(job.id, 100, 'Evaluation complete')

  return {
    session_id: payload.session_id,
    evaluations_created: insertRows.length,
  }
}

registerProcessor('evaluate_review', evaluateReview)

export { evaluateReview }
