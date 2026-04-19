import Anthropic from '@anthropic-ai/sdk'
import { registerProcessor, updateProgress, type GenerationJob } from '../lib/job-runner.js'
import { supabase } from '../lib/supabase.js'
import { trackUsage } from '../lib/cost-tracker.js'
import {
  generateLabPayloadSchema,
  labContentSchema,
  generatedReviewQuestionsSchema,
  type LabContent,
  type BloomsStructure,
  type BloomsLevel,
} from '../../src/types/generation.js'
import {
  buildLabContentSystemPrompt,
  buildLabContentUserMessage,
  buildReviewQuestionsSystemPrompt,
  buildReviewQuestionsUserMessage,
} from '../lib/prompts/generate-lab.js'

const anthropic = new Anthropic()
const MODEL = 'claude-sonnet-4-20250514'

// Claude Sonnet pricing: $3/1M input, $15/1M output
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

function buildBloomsStructure(content: LabContent): BloomsStructure {
  const structure: Partial<BloomsStructure> = {}
  content.sections.forEach((section, i) => {
    const level = section.blooms_level
    const existing = structure[level] ?? { section_indices: [] }
    existing.section_indices.push(i)
    structure[level] = existing
  })
  return structure as BloomsStructure
}

async function generateLab(job: GenerationJob): Promise<Record<string, unknown> | null> {
  const payload = generateLabPayloadSchema.parse(job.input_payload)

  // --- Fetch lab + course context ---
  const { data: lab, error: labError } = await supabase
    .from('labs')
    .select('id, title, module_id, modules!inner(course_id)')
    .eq('id', payload.lab_id)
    .single()

  if (labError || !lab) {
    throw new Error(`Lab not found: ${payload.lab_id}`)
  }

  type LabRow = { id: string; title: string; module_id: string; modules: { course_id: string } }
  const labRow = lab as unknown as LabRow
  const courseId = labRow.modules.course_id

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, created_by, institution_id')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    throw new Error(`Course not found for lab ${payload.lab_id}`)
  }

  // Mark generating. If anything below fails we flip to 'failed' before rethrowing.
  await supabase
    .from('labs')
    .update({ generation_status: 'generating' })
    .eq('id', payload.lab_id)

  try {
    await updateProgress(job.id, 10, 'Generating lab content')

    // --- Fetch concepts + content blocks ---
    const { data: concepts, error: conceptsError } = await supabase
      .from('concepts')
      .select('id, name, position')
      .in('id', payload.concept_ids.length > 0 ? payload.concept_ids : ['00000000-0000-0000-0000-000000000000'])
      .order('position')

    if (conceptsError) {
      throw new Error(`Failed to fetch concepts: ${conceptsError.message}`)
    }

    // Preserve caller's concept_ids order so concept_index from AI maps correctly.
    const conceptById = new Map((concepts ?? []).map((c) => [c.id, c]))
    const orderedConcepts = payload.concept_ids
      .map((id) => conceptById.get(id))
      .filter((c): c is { id: string; name: string; position: number } => !!c)
    const conceptNames = orderedConcepts.map((c) => c.name)

    const { data: blocks, error: blocksError } = await supabase
      .from('content_blocks')
      .select('content, block_type, page_number, position, source_material_id')
      .in('source_material_id', payload.source_material_ids)
      .order('source_material_id')
      .order('position')

    if (blocksError) {
      throw new Error(`Failed to fetch content blocks: ${blocksError.message}`)
    }
    if (!blocks || blocks.length === 0) {
      throw new Error('No parsed content blocks for this lab — run parse_materials first')
    }

    type Block = {
      content: string
      block_type: string
      page_number: number | null
      position: number
      source_material_id: string
    }
    const contentBlocks = blocks as Block[]

    // --- Claude call #1: lab content ---
    const contentResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: buildLabContentSystemPrompt(),
      messages: [
        { role: 'user', content: buildLabContentUserMessage(labRow.title, conceptNames, contentBlocks) },
      ],
    })

    const contentText = contentResponse.content.find((b) => b.type === 'text')
    if (!contentText || contentText.type !== 'text') {
      throw new Error('No text content in lab-content Claude response')
    }

    const contentParsed = labContentSchema.safeParse(extractJson(contentText.text))
    if (!contentParsed.success) {
      const issues = contentParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      throw new Error(`Lab content validation failed: ${issues}`)
    }
    const labContent = contentParsed.data
    const bloomsStructure = buildBloomsStructure(labContent)

    const contentInputTokens = contentResponse.usage?.input_tokens ?? 0
    const contentOutputTokens = contentResponse.usage?.output_tokens ?? 0

    await updateProgress(job.id, 55, 'Generating review questions')

    // --- Claude call #2: review questions (skip if no concepts) ---
    const questionRows: Array<{
      lab_id: string
      concept_id: string
      question_text: string
      blooms_level: BloomsLevel
      source: 'generated'
      evaluation_rubric: string
      is_active: boolean
      position: number
    }> = []
    const approvedConceptIds = new Set<string>()
    let questionsInputTokens = 0
    let questionsOutputTokens = 0

    if (orderedConcepts.length > 0) {
      const questionsResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: buildReviewQuestionsSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: buildReviewQuestionsUserMessage(labRow.title, labContent, conceptNames),
          },
        ],
      })

      const qText = questionsResponse.content.find((b) => b.type === 'text')
      if (!qText || qText.type !== 'text') {
        throw new Error('No text content in review-questions Claude response')
      }

      const qParsed = generatedReviewQuestionsSchema.safeParse(extractJson(qText.text))
      if (!qParsed.success) {
        const issues = qParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        throw new Error(`Review questions validation failed: ${issues}`)
      }

      questionsInputTokens = questionsResponse.usage?.input_tokens ?? 0
      questionsOutputTokens = questionsResponse.usage?.output_tokens ?? 0

      qParsed.data.questions.forEach((q, i) => {
        if (q.concept_index < 0 || q.concept_index >= orderedConcepts.length) {
          console.warn(
            `[generate-lab] Skipping question ${i} with out-of-range concept_index ${q.concept_index}`
          )
          return
        }
        const concept = orderedConcepts[q.concept_index]
        approvedConceptIds.add(concept.id)
        questionRows.push({
          lab_id: payload.lab_id,
          concept_id: concept.id,
          question_text: q.question_text,
          blooms_level: q.blooms_level,
          source: 'generated',
          evaluation_rubric: q.evaluation_rubric,
          is_active: true,
          position: questionRows.length,
        })
      })
    }

    await updateProgress(job.id, 80, 'Saving review questions')

    // --- Write lab content + status ---
    const { error: writeLabError } = await supabase
      .from('labs')
      .update({
        content: labContent,
        blooms_structure: bloomsStructure,
        generation_status: 'complete',
        generated_at: new Date().toISOString(),
      })
      .eq('id', payload.lab_id)

    if (writeLabError) {
      throw new Error(`Failed to write lab content: ${writeLabError.message}`)
    }

    // --- Insert review_questions ---
    if (questionRows.length > 0) {
      const { error: qInsertError } = await supabase.from('review_questions').insert(questionRows)
      if (qInsertError) {
        throw new Error(`Failed to insert review questions: ${qInsertError.message}`)
      }
    }

    // --- Approve used concepts ---
    if (approvedConceptIds.size > 0) {
      const { error: approveError } = await supabase
        .from('concepts')
        .update({ status: 'approved' })
        .in('id', Array.from(approvedConceptIds))
      if (approveError) {
        console.warn(`[generate-lab] Failed to approve concepts: ${approveError.message}`)
      }
    }

    await updateProgress(job.id, 95, 'Finalizing plan state')

    // --- Plan coordination: flip to completed if every lab in course is done ---
    let planCompleted = false
    const { data: modulesRows } = await supabase
      .from('modules')
      .select('id')
      .eq('course_id', courseId)

    const moduleIds = (modulesRows ?? []).map((m) => m.id)

    if (moduleIds.length > 0) {
      const { data: siblingLabs } = await supabase
        .from('labs')
        .select('id, generation_status')
        .in('module_id', moduleIds)

      const allComplete =
        (siblingLabs ?? []).length > 0 &&
        (siblingLabs ?? []).every((l) => l.generation_status === 'complete')

      if (allComplete) {
        const { data: plans } = await supabase
          .from('generation_plans')
          .select('id')
          .eq('course_id', courseId)
          .eq('status', 'generating')
          .limit(1)

        const planId = plans?.[0]?.id
        if (planId) {
          // Race-safe: only flips if still 'generating'; no-op for the loser.
          const { data: flipped } = await supabase
            .from('generation_plans')
            .update({ status: 'completed' })
            .eq('id', planId)
            .eq('status', 'generating')
            .select('id')
          planCompleted = !!flipped && flipped.length > 0
        }
      }
    }

    // --- Cost tracking ---
    await trackUsage({
      userId: course.created_by,
      institutionId: course.institution_id,
      usageType: 'lab_generation',
      model: MODEL,
      inputTokens: contentInputTokens,
      outputTokens: contentOutputTokens,
      costCents: calculateCostCents(contentInputTokens, contentOutputTokens),
      generationJobId: job.id,
      labId: payload.lab_id,
    })

    if (orderedConcepts.length > 0) {
      await trackUsage({
        userId: course.created_by,
        institutionId: course.institution_id,
        usageType: 'lab_generation',
        model: MODEL,
        inputTokens: questionsInputTokens,
        outputTokens: questionsOutputTokens,
        costCents: calculateCostCents(questionsInputTokens, questionsOutputTokens),
        generationJobId: job.id,
        labId: payload.lab_id,
      })
    }

    await updateProgress(job.id, 100, 'Lab generation complete')

    return {
      lab_id: payload.lab_id,
      sections_count: labContent.sections.length,
      questions_count: questionRows.length,
      concepts_approved: approvedConceptIds.size,
      plan_completed: planCompleted,
    }
  } catch (err) {
    await supabase
      .from('labs')
      .update({ generation_status: 'failed' })
      .eq('id', payload.lab_id)
    throw err
  }
}

registerProcessor('generate_lab', generateLab)

export { generateLab }
