import Anthropic from '@anthropic-ai/sdk'
import { pdf } from 'pdf-to-img'
import { registerProcessor, updateProgress, type GenerationJob } from '../lib/job-runner.js'
import { supabase } from '../lib/supabase.js'
import { trackUsage } from '../lib/cost-tracker.js'
import { parseMaterialsPayloadSchema, parsedPageSchema, type ParsedPage } from '@muto/shared/generation'

const anthropic = new Anthropic()

// Claude Sonnet pricing: $3/1M input, $15/1M output
function calculateCostCents(inputTokens: number, outputTokens: number): number {
  return Math.ceil(((inputTokens * 3 + outputTokens * 15) / 1_000_000) * 100)
}

function buildParsePrompt(pageNumber: number): string {
  return `You are analyzing page ${pageNumber} of an academic document. Extract all content into structured blocks.

Return a JSON object matching this exact schema:
{
  "page_number": ${pageNumber},
  "blocks": [
    {
      "block_type": "heading" | "paragraph" | "figure" | "table" | "equation" | "list" | "code",
      "content": "the text content",
      "heading_level": 1-6 (only for headings, omit otherwise),
      "metadata": {} (optional — use for figure captions, table column headers, etc.)
    }
  ]
}

Rules:
- Preserve document hierarchy: headings, subheadings, body text
- For figures: block_type = "figure", content = description of what the figure shows, metadata.caption = caption text if visible
- For tables: block_type = "table", content = table data as markdown, metadata.columns = column headers array
- For equations: block_type = "equation", content = LaTeX representation
- For code: block_type = "code", content = the code, metadata.language = programming language if identifiable
- For lists: block_type = "list", content = list items separated by newlines
- Return ONLY valid JSON, no markdown fences or extra text.`
}

function extractJson(text: string): unknown {
  // Try parsing directly first
  try {
    return JSON.parse(text)
  } catch {
    // Strip markdown fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim())
    }
    // Try finding JSON object in the text
    const braceStart = text.indexOf('{')
    const braceEnd = text.lastIndexOf('}')
    if (braceStart !== -1 && braceEnd > braceStart) {
      return JSON.parse(text.slice(braceStart, braceEnd + 1))
    }
    throw new Error('No valid JSON found in response')
  }
}

async function parseMaterials(job: GenerationJob): Promise<Record<string, unknown> | null> {
  // 1. Validate input payload
  const payload = parseMaterialsPayloadSchema.parse(job.input_payload)

  // 2. Fetch source material
  const { data: material, error: matError } = await supabase
    .from('source_materials')
    .select('id, storage_path, course_id')
    .eq('id', payload.source_material_id)
    .single()

  if (matError || !material) {
    throw new Error(`Source material not found: ${payload.source_material_id}`)
  }

  // 3. Fetch course for cost tracking context
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('created_by, institution_id')
    .eq('id', material.course_id)
    .single()

  if (courseError || !course) {
    throw new Error(`Course not found for material: ${material.course_id}`)
  }

  // 4. Download file from Supabase Storage
  await updateProgress(job.id, 0, 'Downloading file from storage')

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('source-materials')
    .download(material.storage_path)

  if (downloadError || !fileData) {
    throw new Error(`Failed to download file: ${downloadError?.message ?? 'No data'}`)
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())

  // 5. Convert PDF to images
  await updateProgress(job.id, 5, 'Converting PDF pages to images')

  const pages: Uint8Array[] = []
  const doc = await pdf(buffer, { scale: 2 })
  for await (const page of doc) {
    pages.push(page)
  }

  if (pages.length === 0) {
    throw new Error('PDF has no pages')
  }

  const totalPages = pages.length
  console.log(`[parse-materials] Processing ${totalPages} pages for material ${material.id}`)

  // 6. Send each page to Claude
  const allParsedPages: ParsedPage[] = []
  let pagesSucceeded = 0

  for (let i = 0; i < totalPages; i++) {
    const pageNumber = i + 1
    const progressPct = Math.round(10 + (i / totalPages) * 80) // 10-90% range
    await updateProgress(job.id, progressPct, `Parsing page ${pageNumber} of ${totalPages}`)

    try {
      const base64Image = Buffer.from(pages[i]).toString('base64')

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: buildParsePrompt(pageNumber),
              },
            ],
          },
        ],
      })

      // Extract text from response
      const textBlock = response.content.find((b) => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        console.warn(`[parse-materials] No text in response for page ${pageNumber}, skipping`)
        continue
      }

      // Parse and validate JSON
      const rawJson = extractJson(textBlock.text)
      const parsed = parsedPageSchema.safeParse(rawJson)

      if (!parsed.success) {
        console.warn(
          `[parse-materials] Validation failed for page ${pageNumber}: ${parsed.error.issues[0].message}`
        )
        continue
      }

      allParsedPages.push(parsed.data)
      pagesSucceeded++

      // Track cost
      const inputTokens = response.usage?.input_tokens ?? 0
      const outputTokens = response.usage?.output_tokens ?? 0
      await trackUsage({
        userId: course.created_by,
        institutionId: course.institution_id,
        usageType: 'material_parsing',
        model: 'claude-sonnet-4-20250514',
        inputTokens,
        outputTokens,
        costCents: calculateCostCents(inputTokens, outputTokens),
        generationJobId: job.id,
      })
    } catch (err) {
      console.error(
        `[parse-materials] Failed to parse page ${pageNumber}:`,
        err instanceof Error ? err.message : err
      )
      // Continue with remaining pages
    }
  }

  if (pagesSucceeded === 0) {
    throw new Error(`All ${totalPages} pages failed to parse`)
  }

  // 7. Assign sequential positions and build content_blocks rows
  await updateProgress(job.id, 92, 'Inserting content blocks into database')

  const contentBlocks: Array<{
    source_material_id: string
    lab_id: null
    block_type: string
    content: string
    heading_level: number | null
    position: number
    page_number: number
    metadata: Record<string, unknown> | null
  }> = []

  let position = 0
  // Sort by page_number to ensure correct ordering
  allParsedPages.sort((a, b) => a.page_number - b.page_number)

  for (const page of allParsedPages) {
    for (const block of page.blocks) {
      contentBlocks.push({
        source_material_id: material.id,
        lab_id: null,
        block_type: block.block_type,
        content: block.content,
        heading_level: block.heading_level ?? null,
        position,
        page_number: page.page_number,
        metadata: block.metadata ? (block.metadata as Record<string, unknown>) : null,
      })
      position++
    }
  }

  // 8. Batch insert content_blocks (Supabase handles up to ~1000 rows per insert)
  const BATCH_SIZE = 500
  let blocksCreated = 0

  for (let i = 0; i < contentBlocks.length; i += BATCH_SIZE) {
    const batch = contentBlocks.slice(i, i + BATCH_SIZE)
    const { error: insertError } = await supabase.from('content_blocks').insert(batch)

    if (insertError) {
      throw new Error(`Failed to insert content_blocks batch: ${insertError.message}`)
    }
    blocksCreated += batch.length
  }

  // 9. Check if all parse_materials jobs for this course are done → auto-create propose_plan
  await updateProgress(job.id, 97, 'Checking if all materials are parsed')

  const { count, error: countError } = await supabase
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', job.course_id)
    .eq('job_type', 'parse_materials')
    .in('status', ['pending', 'running'])
    .neq('id', job.id) // Exclude current job (it's still technically 'running')

  if (!countError && count === 0) {
    console.log(`[parse-materials] All parse jobs done for course ${job.course_id}, creating propose_plan job`)

    await supabase.from('generation_jobs').insert({
      course_id: job.course_id,
      created_by: job.created_by,
      job_type: 'propose_plan',
      status: 'pending',
      input_payload: { course_id: job.course_id },
    })
  }

  await updateProgress(job.id, 100, 'Parsing complete')

  return {
    blocks_created: blocksCreated,
    pages_parsed: pagesSucceeded,
    pages_total: totalPages,
    pages_failed: totalPages - pagesSucceeded,
  }
}

registerProcessor('parse_materials', parseMaterials)

export { parseMaterials }
