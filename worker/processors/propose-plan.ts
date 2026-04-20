import Anthropic from '@anthropic-ai/sdk'
import { registerProcessor, updateProgress, type GenerationJob } from '../lib/job-runner.js'
import { supabase } from '../lib/supabase.js'
import { trackUsage } from '../lib/cost-tracker.js'
import { proposePlanPayloadSchema, planDataSchema } from '@muto/shared/generation'
import { buildProposePlanPrompt, buildContentMessage } from '../lib/prompts/propose-plan.js'

const anthropic = new Anthropic()

// Claude Sonnet pricing: $3/1M input, $15/1M output
function calculateCostCents(inputTokens: number, outputTokens: number): number {
  return Math.ceil(((inputTokens * 3 + outputTokens * 15) / 1_000_000) * 100)
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // Strip markdown fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim())
    }
    // Try finding JSON object in the text
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error('No valid JSON found in response')
  }
}

const MAX_CONTENT_CHARS = 150_000
const MAX_PER_MATERIAL_CHARS = 50_000

async function proposePlan(job: GenerationJob): Promise<Record<string, unknown> | null> {
  // 1. Validate input payload
  const payload = proposePlanPayloadSchema.parse(job.input_payload)

  // 2. Fetch course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, subject_area, created_by, institution_id')
    .eq('id', payload.course_id)
    .single()

  if (courseError || !course) {
    throw new Error(`Course not found: ${payload.course_id}`)
  }

  await updateProgress(job.id, 10, 'Fetching parsed content')

  // 3. Fetch all source_materials for this course
  const { data: materials, error: matError } = await supabase
    .from('source_materials')
    .select('id')
    .eq('course_id', payload.course_id)

  if (matError || !materials || materials.length === 0) {
    throw new Error('No source materials found for this course')
  }

  const materialIds = materials.map((m) => m.id)

  // 4. Fetch all content_blocks for these materials
  const { data: blocks, error: blocksError } = await supabase
    .from('content_blocks')
    .select('content, block_type, page_number, position, source_material_id')
    .in('source_material_id', materialIds)
    .order('source_material_id')
    .order('position')

  if (blocksError || !blocks || blocks.length === 0) {
    throw new Error('No content blocks found — materials may not have been parsed yet')
  }

  await updateProgress(job.id, 20, 'Building prompt from content')

  // 5. Handle context window limits — truncate if needed
  let contentBlocks = blocks as Array<{
    content: string
    block_type: string
    page_number: number | null
    position: number
    source_material_id: string
  }>

  const totalChars = contentBlocks.reduce((sum, b) => sum + b.content.length, 0)

  if (totalChars > MAX_CONTENT_CHARS) {
    console.log(
      `[propose-plan] Content exceeds ${MAX_CONTENT_CHARS} chars (${totalChars}), truncating per-material`
    )

    // Group by source_material_id and truncate each
    const byMaterial = new Map<string, typeof contentBlocks>()
    for (const block of contentBlocks) {
      const existing = byMaterial.get(block.source_material_id) ?? []
      existing.push(block)
      byMaterial.set(block.source_material_id, existing)
    }

    const truncated: typeof contentBlocks = []
    for (const [materialId, materialBlocks] of byMaterial) {
      let charCount = 0
      let truncatedCount = 0

      for (const block of materialBlocks) {
        if (charCount + block.content.length <= MAX_PER_MATERIAL_CHARS) {
          truncated.push(block)
          charCount += block.content.length
        } else {
          truncatedCount++
        }
      }

      if (truncatedCount > 0) {
        // Add a synthetic block noting truncation
        truncated.push({
          content: `[Content truncated — this material has ${truncatedCount} more blocks not shown]`,
          block_type: 'paragraph',
          page_number: null,
          position: 999999,
          source_material_id: materialId,
        })
      }
    }

    contentBlocks = truncated
  }

  // 6. Build prompt
  const systemPrompt = buildProposePlanPrompt(course.subject_area)
  const contentMessage = buildContentMessage(contentBlocks)

  await updateProgress(job.id, 30, 'Generating course plan with AI')

  // 7. Call Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: contentMessage }],
  })

  // 8. Extract and validate response
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response')
  }

  const rawJson = extractJson(textBlock.text)
  const parsed = planDataSchema.safeParse(rawJson)

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Plan validation failed: ${issues}`)
  }

  const planData = parsed.data

  await updateProgress(job.id, 80, 'Saving generation plan')

  // 9. Recalculate total cost to ensure consistency
  const totalCost = planData.modules.reduce(
    (sum, mod) => sum + mod.labs.reduce((labSum, lab) => labSum + lab.estimated_cost_cents, 0),
    0
  )
  planData.total_estimated_cost_cents = totalCost

  // 10. Insert generation_plans row
  const { data: plan, error: planError } = await supabase
    .from('generation_plans')
    .insert({
      course_id: payload.course_id,
      generation_job_id: job.id,
      plan_data: planData,
      status: 'draft',
    })
    .select('id')
    .single()

  if (planError || !plan) {
    throw new Error(`Failed to create generation plan: ${planError?.message}`)
  }

  // 11. Track cost
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  await trackUsage({
    userId: course.created_by,
    institutionId: course.institution_id,
    usageType: 'plan_generation',
    model: 'claude-sonnet-4-20250514',
    inputTokens,
    outputTokens,
    costCents: calculateCostCents(inputTokens, outputTokens),
    generationJobId: job.id,
  })

  await updateProgress(job.id, 100, 'Plan proposal complete')

  // 12. Return summary
  const modulesCount = planData.modules.length
  const labsCount = planData.modules.reduce((sum, m) => sum + m.labs.length, 0)
  const conceptsCount = planData.modules.reduce(
    (sum, m) => sum + m.labs.reduce((lsum, l) => lsum + l.proposed_concepts.length, 0),
    0
  )

  return {
    plan_id: plan.id,
    modules_count: modulesCount,
    labs_count: labsCount,
    concepts_count: conceptsCount,
    total_estimated_cost_cents: totalCost,
  }
}

registerProcessor('propose_plan', proposePlan)

export { proposePlan }
