// Domain types and Zod schemas for the Muto generation pipeline.
// All schemas are exported alongside their inferred TypeScript types.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Bloom's Taxonomy
// ---------------------------------------------------------------------------

export const bloomsLevelSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
])
export type BloomsLevel = z.infer<typeof bloomsLevelSchema>

// ---------------------------------------------------------------------------
// Parsed page output from LLM vision parser (parse_materials job)
// ---------------------------------------------------------------------------

export const parsedBlockSchema = z.object({
  block_type: z.enum(['heading', 'paragraph', 'figure', 'table', 'equation', 'list', 'code']),
  content: z.string(),
  heading_level: z.number().int().min(1).max(6).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type ParsedBlock = z.infer<typeof parsedBlockSchema>

export const parsedPageSchema = z.object({
  page_number: z.number().int().positive(),
  blocks: z.array(parsedBlockSchema),
})
export type ParsedPage = z.infer<typeof parsedPageSchema>

// ---------------------------------------------------------------------------
// Generation plan data (matches generation_plans.plan_data JSON shape)
// ---------------------------------------------------------------------------

export const planLabSchema = z.object({
  title: z.string(),
  source_material_ids: z.array(z.string().uuid()),
  proposed_concepts: z.array(z.string()),
  estimated_questions: z.number().int().positive(),
  blooms_levels: z.array(bloomsLevelSchema),
  estimated_cost_cents: z.number().int().nonnegative(),
})
export type PlanLab = z.infer<typeof planLabSchema>

export const planModuleSchema = z.object({
  title: z.string(),
  position: z.number().int().nonnegative(),
  labs: z.array(planLabSchema),
})
export type PlanModule = z.infer<typeof planModuleSchema>

export const planDataSchema = z.object({
  modules: z.array(planModuleSchema),
  total_estimated_cost_cents: z.number().int().nonnegative(),
})
export type PlanData = z.infer<typeof planDataSchema>

// ---------------------------------------------------------------------------
// Job input payloads
// ---------------------------------------------------------------------------

export const parseMaterialsPayloadSchema = z.object({
  source_material_id: z.string().uuid(),
})
export type ParseMaterialsPayload = z.infer<typeof parseMaterialsPayloadSchema>

export const proposePlanPayloadSchema = z.object({
  course_id: z.string().uuid(),
})
export type ProposePlanPayload = z.infer<typeof proposePlanPayloadSchema>

export const generateLabPayloadSchema = z.object({
  lab_id: z.string().uuid(),
  source_material_ids: z.array(z.string().uuid()),
  concept_ids: z.array(z.string().uuid()),
})
export type GenerateLabPayload = z.infer<typeof generateLabPayloadSchema>

// ---------------------------------------------------------------------------
// Lab content JSON shape (labs.content)
// ---------------------------------------------------------------------------

export const labSectionSchema = z.object({
  blooms_level: bloomsLevelSchema,
  heading: z.string(),
  body: z.string(),
})
export type LabSection = z.infer<typeof labSectionSchema>

export const labContentSchema = z.object({
  title: z.string(),
  sections: z.array(labSectionSchema),
})
export type LabContent = z.infer<typeof labContentSchema>

// ---------------------------------------------------------------------------
// Lab blooms_structure JSON shape (labs.blooms_structure)
// ---------------------------------------------------------------------------

export const bloomsStructureSchema = z.record(
  bloomsLevelSchema,
  z.object({
    section_indices: z.array(z.number().int()),
  }),
)
export type BloomsStructure = z.infer<typeof bloomsStructureSchema>
