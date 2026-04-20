import { supabase } from './supabase.js'

// Inline types matching the generation_jobs table schema
export type JobType =
  | 'parse_materials'
  | 'propose_plan'
  | 'generate_lab'
  | 'generate_batch'
  | 'generate_embeddings'
  | 'generate_review_questions'
  | 'evaluate_review'

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface GenerationJob {
  id: string
  course_id: string
  created_by: string
  job_type: JobType
  status: JobStatus
  priority: number
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown> | null
  progress_percent: number
  current_step: string | null
  error_message: string | null
  estimated_cost_cents: number | null
  actual_cost_cents: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

// Processor function signature: receives the full job row, returns output_payload or null
export type ProcessorFn = (job: GenerationJob) => Promise<Record<string, unknown> | null>

// Registry of job processors keyed by job_type
const processors = new Map<string, ProcessorFn>()

// Hard ceiling on how long any single job may run before it's considered
// stuck. Real jobs finish in seconds-to-minutes; this exists only to bound
// crash-and-hang failure modes so the queue can't be blocked indefinitely.
const JOB_TIMEOUT_MINUTES = 120

/**
 * Register a processor for a given job_type.
 * Call this from each processor module (parse-materials.ts, generate-lab.ts, etc.)
 * before the poll loop starts.
 */
export function registerProcessor(jobType: JobType, fn: ProcessorFn): void {
  processors.set(jobType, fn)
  console.log(`[job-runner] Registered processor for job_type: ${jobType}`)
}

/**
 * Attempt to claim and process one pending job.
 * Returns true if a job was found and processed (successfully or not),
 * false if the queue was empty.
 */
export async function processNextJob(): Promise<boolean> {
  // Step 1: Find the highest-priority pending job
  const { data: jobs, error: fetchError } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)

  if (fetchError) {
    console.error('[job-runner] Failed to fetch pending jobs:', fetchError.message)
    return false
  }

  if (!jobs || jobs.length === 0) {
    return false // Queue is empty
  }

  const job = jobs[0] as GenerationJob

  // Step 2: Atomically claim the job — only succeeds if it's still 'pending'
  // This prevents double-claim when multiple workers are running
  const { data: claimedRows, error: claimError } = await supabase
    .from('generation_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'pending') // Guard: another worker may have claimed it already
    .select('id')

  if (claimError) {
    console.error('[job-runner] Failed to claim job:', claimError.message)
    return false
  }

  if (!claimedRows || claimedRows.length === 0) {
    // Another worker claimed it between our fetch and update — skip silently
    console.log(`[job-runner] Job ${job.id} was claimed by another worker, skipping.`)
    return false
  }

  console.log(`[job-runner] Claimed job ${job.id} (type: ${job.job_type})`)

  // Step 3: Route to the registered processor
  const processor = processors.get(job.job_type)

  if (!processor) {
    const errorMsg = `No processor registered for job_type: ${job.job_type}`
    console.error(`[job-runner] ${errorMsg}`)
    await markFailed(job.id, errorMsg)
    return true
  }

  // Step 4: Execute the processor under a wall-clock deadline.
  // Note: Promise.race doesn't actually cancel the in-flight work — an orphaned
  // fetch to an LLM provider may continue in the background until it returns or
  // the process exits. What this guarantees is that the DB row gets marked
  // failed and the queue unblocks so subsequent jobs can be picked up.
  try {
    const outputPayload = await Promise.race([
      processor(job),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Job exceeded ${JOB_TIMEOUT_MINUTES}-minute runtime limit`)),
          JOB_TIMEOUT_MINUTES * 60 * 1000
        )
      ),
    ])
    await markCompleted(job.id, outputPayload)
    console.log(`[job-runner] Job ${job.id} completed successfully.`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[job-runner] Job ${job.id} failed:`, errorMsg)
    await markFailed(job.id, errorMsg)
  }

  return true
}

/**
 * One-shot cleanup pass: any job stuck in `running` longer than the runtime
 * ceiling is marked `failed` so the queue can move on. Call this once at
 * worker boot — it catches zombies left behind by crashes (OOM, SIGKILL,
 * deploy mid-job, etc.) where the process died before it could mark its own
 * row failed.
 *
 * Safe to run concurrently with live workers: we only touch rows whose
 * `started_at` is older than the cutoff, and live jobs will have a much
 * more recent `started_at`.
 */
export async function sweepStuckJobs(
  maxRuntimeMinutes: number = JOB_TIMEOUT_MINUTES
): Promise<void> {
  const cutoff = new Date(Date.now() - maxRuntimeMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('generation_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: `Job exceeded ${maxRuntimeMinutes}-minute runtime limit (swept on worker boot)`,
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id')

  if (error) {
    console.error('[job-runner] sweepStuckJobs failed:', error.message)
    return
  }

  const count = data?.length ?? 0
  if (count > 0) {
    console.log(`[job-runner] Swept ${count} stuck running job${count === 1 ? '' : 's'}.`)
  } else {
    console.log('[job-runner] No stuck jobs found.')
  }
}

// --- Internal helpers ---

async function markCompleted(
  jobId: string,
  outputPayload: Record<string, unknown> | null
): Promise<void> {
  const { error } = await supabase
    .from('generation_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output_payload: outputPayload,
    })
    .eq('id', jobId)

  if (error) {
    console.error(`[job-runner] Failed to mark job ${jobId} completed:`, error.message)
  }
}

async function markFailed(jobId: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from('generation_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', jobId)

  if (error) {
    console.error(`[job-runner] Failed to mark job ${jobId} failed:`, error.message)
  }
}

/**
 * Helper for processors to update progress during long-running jobs.
 * Call this between steps to give real-time feedback via Supabase Realtime.
 */
export async function updateProgress(
  jobId: string,
  progressPercent: number,
  currentStep: string
): Promise<void> {
  const { error } = await supabase
    .from('generation_jobs')
    .update({
      progress_percent: progressPercent,
      current_step: currentStep,
    })
    .eq('id', jobId)

  if (error) {
    console.error(`[job-runner] Failed to update progress for job ${jobId}:`, error.message)
  }
}
