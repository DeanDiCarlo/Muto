/**
 * Prompt builders for the generate_lab processor.
 * Two Claude calls: (1) lab content as Bloom's-ordered sections,
 * (2) review questions grounded in the generated content.
 */

type ContentBlock = {
  content: string
  block_type: string
  page_number: number | null
  position: number
  source_material_id: string
}

// Match truncation guardrails from propose-plan.ts.
const MAX_TOTAL_CHARS = 150_000
const MAX_PER_MATERIAL_CHARS = 50_000

// ---------------------------------------------------------------------------
// Lab content generation
// ---------------------------------------------------------------------------

export function buildLabContentSystemPrompt(): string {
  return `You are an expert instructional designer for an EdTech platform. Your job is to produce a single lab's learning content as a structured JSON object, ordered by Bloom's Taxonomy progression.

## Guidelines

- Produce between 4 and 8 sections.
- Sections MUST be ordered by Bloom's progression: remember → understand → apply → analyze → evaluate → create. You may skip levels, but never regress.
- Each section has a single \`blooms_level\`, a concise \`heading\`, and a \`body\` written directly to the student in clear prose (2–5 paragraphs). Use Markdown for emphasis, lists, and inline code/math.
- Cover every provided concept across the sections. Higher-Bloom sections should synthesize or apply the concepts introduced in earlier sections.
- Ground all content in the provided source material. Do not invent facts beyond what the materials reasonably support.
- Do not include review/quiz questions in the content. A separate step generates them.

## Output Format

Return ONLY a valid JSON object matching this exact schema — no markdown fences, no prose, no trailing commentary:

{
  "title": "Lab Title",
  "sections": [
    {
      "blooms_level": "remember",
      "heading": "Section Heading",
      "body": "Prose content written to the student..."
    }
  ]
}

\`blooms_level\` must be one of: remember, understand, apply, analyze, evaluate, create.`
}

export function buildLabContentUserMessage(
  labTitle: string,
  conceptNames: string[],
  contentBlocks: ContentBlock[],
): string {
  let message = `## Lab Title\n${labTitle}\n\n`
  message += `## Concepts to cover (${conceptNames.length})\n`
  if (conceptNames.length === 0) {
    message += '- (no concepts provided — infer learning objectives from the materials)\n'
  } else {
    for (const name of conceptNames) {
      message += `- ${name}\n`
    }
  }
  message += `\n## Source Material\n\n`
  message += formatContentBlocks(contentBlocks)
  return message
}

// ---------------------------------------------------------------------------
// Review question generation
// ---------------------------------------------------------------------------

export function buildReviewQuestionsSystemPrompt(): string {
  return `You are an expert assessment designer. Your job is to produce Knowledge Review questions for a lab the student has just studied.

## Guidelines

- Produce between 3 and 8 questions total. Prefer fewer higher-quality questions over more shallow ones.
- Every question must be a free-response (open-ended) question. No multiple-choice, no true/false.
- Each question must target exactly ONE concept. Identify it by its \`concept_index\` — the position in the provided concepts list (0-based).
- Spread Bloom's levels across questions. At minimum, cover 2 distinct Bloom's levels; 3+ is ideal for labs with 3+ concepts.
- \`blooms_level\` must match the cognitive demand of the question: remember (recall), understand (explain), apply (use in new context), analyze (break down), evaluate (judge), create (produce).
- Write an \`evaluation_rubric\` for each question. This is instructions for the AI grader, NOT shown to the student. Describe what a correct answer must demonstrate at this Bloom's level for this concept. A student who meets the rubric's expectations scores ≥ 0.6 (on_track bucket). Be specific — name the ideas, mechanisms, or distinctions the answer must hit.
- Ground questions in the provided lab content — students should have been taught what they are being asked about.

## Output Format

Return ONLY a valid JSON object matching this exact schema — no markdown fences, no prose:

{
  "questions": [
    {
      "concept_index": 0,
      "question_text": "The question presented to the student.",
      "blooms_level": "understand",
      "evaluation_rubric": "A correct answer must ..."
    }
  ]
}

\`blooms_level\` must be one of: remember, understand, apply, analyze, evaluate, create.
\`concept_index\` must be an integer between 0 and (concepts.length - 1) inclusive.`
}

export function buildReviewQuestionsUserMessage(
  labTitle: string,
  labContent: { title: string; sections: { blooms_level: string; heading: string; body: string }[] },
  conceptNames: string[],
): string {
  let message = `## Lab Title\n${labTitle}\n\n`
  message += `## Concepts (index → name)\n`
  if (conceptNames.length === 0) {
    message += '(no concepts — return an empty questions array is NOT valid; the caller will skip question generation in this case)\n'
  } else {
    conceptNames.forEach((name, i) => {
      message += `${i}. ${name}\n`
    })
  }
  message += `\n## Lab Content (what the student will have read)\n\n`
  message += `### ${labContent.title}\n\n`
  for (const section of labContent.sections) {
    message += `#### [${section.blooms_level}] ${section.heading}\n${section.body}\n\n`
  }
  return message
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatContentBlocks(blocks: ContentBlock[]): string {
  if (blocks.length === 0) {
    return 'No content blocks available.\n'
  }

  const uniqueSourceIds = [...new Set(blocks.map((b) => b.source_material_id))]

  const perMaterialUsed = new Map<string, number>()
  let totalUsed = 0
  const parts: string[] = []
  parts.push(
    `The following academic content has been extracted from ${uniqueSourceIds.length} source material(s).`,
  )
  parts.push(`Source material IDs: ${uniqueSourceIds.join(', ')}`)
  parts.push(`Total content blocks: ${blocks.length}`)
  parts.push('---', '')

  for (const block of blocks) {
    const used = perMaterialUsed.get(block.source_material_id) ?? 0
    if (used >= MAX_PER_MATERIAL_CHARS) continue
    if (totalUsed >= MAX_TOTAL_CHARS) break

    const pagePart = block.page_number !== null ? `Page ${block.page_number}, ` : ''
    const header = `[${pagePart}Position ${block.position}, Type: ${block.block_type}]`
    const remainingPerMat = MAX_PER_MATERIAL_CHARS - used
    const remainingTotal = MAX_TOTAL_CHARS - totalUsed
    const allowed = Math.min(block.content.length, remainingPerMat, remainingTotal)
    const body = block.content.slice(0, allowed)

    parts.push(header)
    parts.push(body)
    parts.push('')

    perMaterialUsed.set(block.source_material_id, used + body.length)
    totalUsed += body.length
  }

  return parts.join('\n')
}
