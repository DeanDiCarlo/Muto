/**
 * Prompt builders for the propose_plan processor.
 * Constructs system + user messages for Claude to analyze parsed content
 * and propose a course generation plan.
 */

type ContentBlock = {
  content: string
  block_type: string
  page_number: number | null
  position: number
  source_material_id: string
}

/**
 * Build the system prompt that instructs Claude how to analyze academic content
 * and produce a structured course plan.
 */
export function buildProposePlanPrompt(subjectArea: string | null): string {
  const domainContext = subjectArea
    ? `\n\nThe course subject area is "${subjectArea}". Incorporate domain-specific awareness when naming modules, labs, and concepts. Use terminology and organizational patterns appropriate for this field.`
    : ''

  return `You are an expert curriculum designer for an EdTech platform. Your job is to analyze academic content and propose a structured course plan with modules, labs, and concepts.

Analyze the provided academic content and propose a course structure as a JSON object.${domainContext}

## Guidelines

- **Modules**: Each module should represent 1-2 weeks of content. Group related topics together logically.
- **Labs**: Each lab should correspond to 1-2 class sessions. A module can have multiple labs.
- **Concepts**: Propose meaningful, specific concept names — not generic ones like "basics" or "introduction". Concepts should be testable knowledge units (e.g., "Qubit Superposition", "Grover's Algorithm Complexity", "Pauli-X Gate Operations").
- **Review questions**: Suggest 3-8 questions per lab depending on the number of concepts covered.
- **Bloom's taxonomy levels**: For each lab, include the cognitive levels it targets. Choose from: remember, understand, apply, analyze, evaluate, create. Most labs should cover at least 2-3 levels.
- **Cost estimation**: Estimate 45 cents per lab as a rough baseline for generation cost.
- **Source material IDs**: Each lab must reference which source_material_ids its content draws from (use the IDs provided in the content metadata).
- **Ordering**: Modules should have sequential position values starting at 0. Order them from foundational to advanced.

## Output Format

Return ONLY a valid JSON object matching this exact schema — no markdown fences, no extra text:

{
  "modules": [
    {
      "title": "Module Title",
      "position": 0,
      "labs": [
        {
          "title": "Lab Title",
          "source_material_ids": ["uuid-1", "uuid-2"],
          "proposed_concepts": ["Concept A", "Concept B", "Concept C"],
          "estimated_questions": 5,
          "blooms_levels": ["remember", "understand", "apply"],
          "estimated_cost_cents": 45
        }
      ]
    }
  ],
  "total_estimated_cost_cents": 90
}

## Example

For a quantum computing course with two uploaded PDFs:

{
  "modules": [
    {
      "title": "Foundations of Quantum Mechanics",
      "position": 0,
      "labs": [
        {
          "title": "Qubits and Superposition",
          "source_material_ids": ["abc-123"],
          "proposed_concepts": ["Qubit State Representation", "Superposition Principle", "Bloch Sphere Visualization"],
          "estimated_questions": 5,
          "blooms_levels": ["remember", "understand", "apply"],
          "estimated_cost_cents": 45
        },
        {
          "title": "Quantum Entanglement",
          "source_material_ids": ["abc-123"],
          "proposed_concepts": ["Bell States", "EPR Paradox", "Entanglement Swapping"],
          "estimated_questions": 5,
          "blooms_levels": ["understand", "analyze"],
          "estimated_cost_cents": 45
        }
      ]
    },
    {
      "title": "Quantum Gates and Circuits",
      "position": 1,
      "labs": [
        {
          "title": "Single-Qubit Gates",
          "source_material_ids": ["abc-123", "def-456"],
          "proposed_concepts": ["Pauli Gates", "Hadamard Gate", "Phase Gates", "Gate Matrix Representation"],
          "estimated_questions": 6,
          "blooms_levels": ["remember", "understand", "apply"],
          "estimated_cost_cents": 45
        }
      ]
    }
  ],
  "total_estimated_cost_cents": 135
}

Make sure total_estimated_cost_cents equals the sum of all lab estimated_cost_cents values.`
}

/**
 * Build the user message from content blocks, formatted with metadata markers
 * so Claude can trace content back to source materials and pages.
 */
export function buildContentMessage(blocks: ContentBlock[]): string {
  if (blocks.length === 0) {
    return 'No content blocks available.'
  }

  const uniqueSourceIds = [...new Set(blocks.map((b) => b.source_material_id))]

  let message = `The following academic content has been extracted from ${uniqueSourceIds.length} source material(s).\n`
  message += `Source material IDs: ${uniqueSourceIds.join(', ')}\n`
  message += `Total content blocks: ${blocks.length}\n\n`
  message += `---\n\n`

  for (const block of blocks) {
    const pagePart = block.page_number !== null ? `Page ${block.page_number}, ` : ''
    message += `[${pagePart}Position ${block.position}, Type: ${block.block_type}]\n`
    message += `${block.content}\n\n`
  }

  return message
}
