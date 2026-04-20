import { supabase } from './supabase.js'

// Gemini pay-as-you-go pricing (standard tier, prompts ≤200k tokens).
// Rates confirmed against ai.google.dev/gemini-api/docs/pricing on 2026-04-20.
// Re-check before any material pricing conversation — Google has shifted
// these numbers at major-version releases in the past.
export const GEMINI_PRICING = {
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
} as const satisfies Record<string, { inputPerMillion: number; outputPerMillion: number }>

export type GeminiPricedModel = keyof typeof GEMINI_PRICING

/**
 * Compute the cost of a Gemini call in cents, rounded up to the next cent.
 * Never returns a negative number — negative token counts clamp to 0.
 */
export function calcGeminiCostCents(
  model: GeminiPricedModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const { inputPerMillion, outputPerMillion } = GEMINI_PRICING[model]
  const inTokens = Math.max(0, inputTokens)
  const outTokens = Math.max(0, outputTokens)
  const dollars =
    (inTokens / 1_000_000) * inputPerMillion + (outTokens / 1_000_000) * outputPerMillion
  return Math.ceil(dollars * 100)
}

interface TrackUsageParams {
  userId: string
  institutionId: string
  usageType:
    | 'chatbot'
    | 'review_evaluation'
    | 'lab_generation'
    | 'plan_generation'
    | 'embedding_generation'
    | 'material_parsing'
  model: string
  inputTokens: number
  outputTokens: number
  costCents: number
  generationJobId?: string
  labId?: string
}

export async function trackUsage(params: TrackUsageParams): Promise<void> {
  const { error } = await supabase.from('api_usage_log').insert({
    user_id: params.userId,
    institution_id: params.institutionId,
    usage_type: params.usageType,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_cents: params.costCents,
    generation_job_id: params.generationJobId ?? null,
    lab_id: params.labId ?? null,
  })
  if (error) {
    console.error('[cost-tracker] Failed to log usage:', error.message)
    // Don't throw — cost tracking failure shouldn't stop job processing
  }
}
