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

// Whole-document wrapper used when an LLM processes the full source in one
// call (see worker/processors/parse-materials.ts on Gemini Files API). Kept
// separate from parsedPageSchema so the per-page consumers in the DB-insert
// path don't need to change — callers just iterate `parsed.pages` and reuse
// the same parsedPageSchema/parsedBlockSchema downstream.
export const parsedDocumentSchema = z.object({
  pages: z.array(parsedPageSchema),
})
export type ParsedDocument = z.infer<typeof parsedDocumentSchema>

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

export const evaluateReviewPayloadSchema = z.object({
  session_id: z.string().uuid(),
})
export type EvaluateReviewPayload = z.infer<typeof evaluateReviewPayloadSchema>

// ---------------------------------------------------------------------------
// AI output shapes — generate_lab review questions
// ---------------------------------------------------------------------------

export const generatedReviewQuestionSchema = z.object({
  concept_index: z.number().int().nonnegative(),
  question_text: z.string().min(1),
  blooms_level: bloomsLevelSchema,
  evaluation_rubric: z.string().min(1),
})
export type GeneratedReviewQuestion = z.infer<typeof generatedReviewQuestionSchema>

export const generatedReviewQuestionsSchema = z.object({
  questions: z.array(generatedReviewQuestionSchema).min(1).max(12),
})
export type GeneratedReviewQuestions = z.infer<typeof generatedReviewQuestionsSchema>

// ---------------------------------------------------------------------------
// AI output shapes — evaluate_review concept evaluations
// ---------------------------------------------------------------------------

export const aiConceptEvaluationSchema = z.object({
  review_response_id: z.string().uuid(),
  concept_id: z.string().uuid(),
  blooms_level: bloomsLevelSchema,
  mastery_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
})
export type AiConceptEvaluation = z.infer<typeof aiConceptEvaluationSchema>

export const aiConceptEvaluationsSchema = z.object({
  evaluations: z.array(aiConceptEvaluationSchema).min(1),
})
export type AiConceptEvaluations = z.infer<typeof aiConceptEvaluationsSchema>

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
