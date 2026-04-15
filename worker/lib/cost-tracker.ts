import { supabase } from './supabase.js'

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
