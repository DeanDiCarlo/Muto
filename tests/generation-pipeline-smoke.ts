// =============================================================================
// Downstream generation-pipeline smoke test (S4-T6).
//
// What this proves: given a clean set of content_blocks (as parse_materials
// WOULD produce), the propose_plan + generate_lab processors can chain all
// the way to a real labs.content JSON that validates against labContentSchema.
//
// What this does NOT prove: that parse_materials works. This test MOCKS the
// parse output by inserting content_blocks directly. That's the whole point —
// it isolates downstream pipeline correctness from the Gemini migration.
// S4-T7 is the end-to-end test that actually uploads a real PDF.
//
// Requirements to run:
//   1. Supabase project reachable via SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//      (or NEXT_PUBLIC_SUPABASE_URL fallback if the Next.js env is all you
//      have locally — this script tolerates both names).
//   2. A worker polling that same Supabase project. Either the Railway worker
//      or `cd worker && npm run dev` locally. The test does NOT spawn a worker.
//   3. ANTHROPIC_API_KEY available to whichever worker is running (propose_plan
//      and generate_lab still use Claude Sonnet 4 as of S4 start).
//   4. Professor Pat seed user exists (run /login → "Seed dev users" button
//      once if this is a fresh Supabase project).
//
// Usage:
//   npx tsx tests/generation-pipeline-smoke.ts
//
// Exit codes:
//   0  — a labs.content row exists and validates against labContentSchema
//   1  — any failure (missing seed user, processor timeout, schema mismatch,
//         DB error). Error details are logged.
//
// Cleanup: the script deletes everything it created in a finally block. If it
// crashes between insert and cleanup, the test course row will be left behind
// identifiable by its title prefix `[SMOKE TEST]`.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planDataSchema, labContentSchema } from '@muto/shared/generation'

// Load root .env.local so this works without `node --env-file`.
loadDotEnvLocal()

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (check .env.local).',
  )
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_TITLE_PREFIX = '[SMOKE TEST]'
const PROPOSE_PLAN_TIMEOUT_MS = 60_000
const GENERATE_LAB_TIMEOUT_MS = 180_000

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

type Cleanup = {
  courseId?: string
  sourceMaterialId?: string
  planId?: string
  moduleIds: string[]
  labIds: string[]
  jobIds: string[]
}

async function main() {
  const cleanup: Cleanup = { moduleIds: [], labIds: [], jobIds: [] }

  try {
    // -- 0. Look up Professor Pat ------------------------------------------
    const pat = await getProfessorPat()
    console.log(`[setup] Using professor: ${pat.email} (${pat.id})`)

    // -- 1. Create a test course -------------------------------------------
    const course = await insertRow('courses', {
      created_by: pat.id,
      institution_id: pat.institution_id,
      title: `${TEST_TITLE_PREFIX} ${new Date().toISOString()}`,
      subject_area: 'quantum_computing',
    })
    cleanup.courseId = course.id as string
    console.log(`[setup] Created course ${cleanup.courseId}`)

    // -- 2. Create a fake source_material ----------------------------------
    const material = await insertRow('source_materials', {
      course_id: cleanup.courseId,
      uploaded_by: pat.id,
      file_name: 'smoke-test-fixture.pdf',
      file_type: 'application/pdf',
      storage_path: `${cleanup.courseId}/smoke-test-fixture.pdf`,
      file_size_bytes: 12345,
    })
    cleanup.sourceMaterialId = material.id as string
    console.log(`[setup] Created source_material ${cleanup.sourceMaterialId}`)

    // -- 3. Mock parse output ----------------------------------------------
    await admin.from('content_blocks').insert(buildMockContentBlocks(cleanup.sourceMaterialId))
    console.log('[setup] Inserted mock content_blocks')

    // -- 4. Enqueue propose_plan job + wait --------------------------------
    const planJob = await insertRow('generation_jobs', {
      course_id: cleanup.courseId,
      created_by: pat.id,
      job_type: 'propose_plan',
      status: 'pending',
      input_payload: { course_id: cleanup.courseId },
    })
    cleanup.jobIds.push(planJob.id as string)
    console.log(`[propose_plan] Enqueued job ${planJob.id}`)

    const planJobResult = await waitForJob(planJob.id as string, PROPOSE_PLAN_TIMEOUT_MS)
    if (planJobResult.status !== 'completed') {
      throw new Error(
        `propose_plan finished with status=${planJobResult.status}, ` +
          `error=${planJobResult.error_message ?? 'none'}`,
      )
    }
    console.log('[propose_plan] Job completed')

    // -- 5. Read back + validate plan --------------------------------------
    const { data: planRow, error: planErr } = await admin
      .from('generation_plans')
      .select('id, plan_data')
      .eq('course_id', cleanup.courseId)
      .single()
    if (planErr || !planRow) {
      throw new Error(`No generation_plans row for course: ${planErr?.message}`)
    }
    cleanup.planId = planRow.id as string
    const planParse = planDataSchema.safeParse(planRow.plan_data)
    if (!planParse.success) {
      throw new Error(
        'plan_data failed planDataSchema validation: ' +
          planParse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      )
    }
    const planData = planParse.data
    console.log(
      `[propose_plan] Plan has ${planData.modules.length} module(s), ` +
        `${planData.modules.reduce((s, m) => s + m.labs.length, 0)} lab(s)`,
    )

    // -- 6. Simulate approval: create modules/labs/concepts, enqueue generate_lab
    const firstModule = planData.modules[0]
    if (!firstModule || !firstModule.labs[0]) {
      throw new Error('Plan has no labs to generate — AI produced an unusable plan')
    }
    const firstLabPlan = firstModule.labs[0]

    const moduleRow = await insertRow('modules', {
      course_id: cleanup.courseId,
      title: firstModule.title,
      position: firstModule.position,
    })
    cleanup.moduleIds.push(moduleRow.id as string)

    const labRow = await insertRow('labs', {
      module_id: moduleRow.id,
      title: firstLabPlan.title,
      position: 0,
      generation_status: 'pending',
    })
    cleanup.labIds.push(labRow.id as string)

    // Attach source_material to the lab (mimics approvePlan)
    await admin
      .from('source_materials')
      .update({ lab_id: labRow.id })
      .eq('id', cleanup.sourceMaterialId)

    // Create concepts (linked to lab_id, status 'proposed')
    const conceptIds: string[] = []
    for (let i = 0; i < firstLabPlan.proposed_concepts.length; i++) {
      const conceptRow = await insertRow('concepts', {
        lab_id: labRow.id,
        name: firstLabPlan.proposed_concepts[i],
        status: 'proposed',
        position: i,
      })
      conceptIds.push(conceptRow.id as string)
    }
    console.log(`[approval] Created module + lab + ${conceptIds.length} concept(s)`)

    // Mark plan approved
    await admin
      .from('generation_plans')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', cleanup.planId)

    // -- 7. Enqueue generate_lab job + wait --------------------------------
    const labJob = await insertRow('generation_jobs', {
      course_id: cleanup.courseId,
      created_by: pat.id,
      job_type: 'generate_lab',
      status: 'pending',
      input_payload: {
        lab_id: labRow.id,
        source_material_ids: [cleanup.sourceMaterialId],
        concept_ids: conceptIds,
      },
    })
    cleanup.jobIds.push(labJob.id as string)
    console.log(`[generate_lab] Enqueued job ${labJob.id}`)

    const labJobResult = await waitForJob(labJob.id as string, GENERATE_LAB_TIMEOUT_MS)
    if (labJobResult.status !== 'completed') {
      throw new Error(
        `generate_lab finished with status=${labJobResult.status}, ` +
          `error=${labJobResult.error_message ?? 'none'}`,
      )
    }
    console.log('[generate_lab] Job completed')

    // -- 8. Read back + validate lab content -------------------------------
    const { data: finalLab, error: labFetchErr } = await admin
      .from('labs')
      .select('id, content, generation_status')
      .eq('id', labRow.id)
      .single()
    if (labFetchErr || !finalLab) {
      throw new Error(`Failed to re-fetch lab row: ${labFetchErr?.message}`)
    }
    if (!finalLab.content) {
      throw new Error('labs.content is null after generate_lab completed')
    }
    const contentParse = labContentSchema.safeParse(finalLab.content)
    if (!contentParse.success) {
      throw new Error(
        'labs.content failed labContentSchema validation: ' +
          contentParse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      )
    }
    console.log(
      `[verify] Lab content validates — ${contentParse.data.sections.length} section(s), ` +
        `title="${contentParse.data.title}"`,
    )

    console.log('\nSMOKE PASS — downstream pipeline is wired correctly.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`\nSMOKE FAIL: ${msg}`)
    process.exitCode = 1
  } finally {
    await cleanupAll(cleanup)
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function getProfessorPat(): Promise<{ id: string; email: string; institution_id: string }> {
  const { data, error } = await admin
    .from('users')
    .select('id, email, institution_id')
    .eq('email', 'prof@dev.muto')
    .single()
  if (error || !data) {
    throw new Error(
      'Professor Pat (prof@dev.muto) not found. Run the "Seed dev users" button on /login first.',
    )
  }
  return data as { id: string; email: string; institution_id: string }
}

async function insertRow(
  table: string,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from(table).insert(values).select('*').single()
  if (error || !data) {
    throw new Error(`insert into ${table} failed: ${error?.message ?? 'no row returned'}`)
  }
  return data
}

function buildMockContentBlocks(sourceMaterialId: string) {
  // A small handful of blocks across 3 pages with varied types. Content is
  // deliberately domain-coherent (quantum-adjacent) so propose_plan's LLM has
  // something real to latch onto.
  const blocks: Array<{
    source_material_id: string
    block_type: 'heading' | 'paragraph' | 'equation' | 'list' | 'figure'
    content: string
    heading_level?: number
    position: number
    page_number: number
  }> = []
  let pos = 0
  const add = (
    block_type: 'heading' | 'paragraph' | 'equation' | 'list' | 'figure',
    content: string,
    page_number: number,
    heading_level?: number,
  ) => {
    blocks.push({ source_material_id: sourceMaterialId, block_type, content, position: pos++, page_number, ...(heading_level ? { heading_level } : {}) })
  }

  // Page 1 — intro
  add('heading', 'Introduction to Bell States', 1, 1)
  add(
    'paragraph',
    'Bell states are the four maximally entangled two-qubit states used as the foundational examples of entanglement in quantum information theory.',
    1,
  )
  add(
    'paragraph',
    'The canonical preparation circuit applies a Hadamard to the first qubit followed by a CNOT with the first qubit as control.',
    1,
  )
  add('equation', '|Φ⁺⟩ = (|00⟩ + |11⟩) / √2', 1)

  // Page 2 — theory
  add('heading', 'Why Bell States Matter', 2, 2)
  add(
    'paragraph',
    'Measurements on Bell states exhibit correlations that cannot be reproduced by any local hidden-variable theory, as formalized by the CHSH inequality.',
    2,
  )
  add('list', '- Quantum teleportation\n- Superdense coding\n- Device-independent cryptography', 2)
  add(
    'paragraph',
    'The CHSH inequality provides a testable bound of 2 for classical correlations, while quantum systems reach 2√2 (Tsirelson bound).',
    2,
  )

  // Page 3 — application
  add('heading', 'Working with Bell State Circuits', 3, 2)
  add(
    'paragraph',
    'To prepare |Φ⁺⟩ from |00⟩, apply H on qubit 0 then CNOT (control=0, target=1). Other Bell states come from adding X or Z gates before measurement.',
    3,
  )
  add('equation', '|Ψ⁻⟩ = (|01⟩ − |10⟩) / √2', 3)
  add(
    'paragraph',
    'Fidelity of Bell state preparation on real hardware is limited by single-qubit and two-qubit gate errors, typically 0.1% and 1% respectively on current superconducting devices.',
    3,
  )
  add('figure', 'Diagram: Bell state preparation circuit — H gate on q0 followed by CNOT to q1', 3)
  add('paragraph', 'This circuit generalizes to GHZ states for three or more qubits.', 3)
  add(
    'paragraph',
    'Practical experiments verify Bell inequality violations to high statistical significance, confirming nonlocal quantum correlations.',
    3,
  )

  return blocks
}

async function waitForJob(
  jobId: string,
  timeoutMs: number,
): Promise<{ status: string; error_message: string | null }> {
  const deadline = Date.now() + timeoutMs
  const pollMs = 2000
  while (Date.now() < deadline) {
    const { data, error } = await admin
      .from('generation_jobs')
      .select('status, error_message, progress_percent, current_step')
      .eq('id', jobId)
      .single()
    if (error || !data) {
      throw new Error(`poll failed for job ${jobId}: ${error?.message}`)
    }
    if (data.status !== 'pending' && data.status !== 'running') {
      return { status: data.status as string, error_message: data.error_message as string | null }
    }
    process.stdout.write(
      `  ↳ ${data.status} ${data.progress_percent ?? 0}% ${data.current_step ?? ''}\n`,
    )
    await sleep(pollMs)
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for job ${jobId} to finish`)
}

async function cleanupAll(c: Cleanup): Promise<void> {
  if (!c.courseId) return
  console.log('\n[cleanup] Deleting test rows...')
  // Order matters — leaf tables first.
  if (c.labIds.length > 0) {
    await admin.from('concepts').delete().in('lab_id', c.labIds)
    await admin.from('labs').delete().in('id', c.labIds)
  }
  if (c.moduleIds.length > 0) {
    await admin.from('modules').delete().in('id', c.moduleIds)
  }
  if (c.sourceMaterialId) {
    await admin.from('content_blocks').delete().eq('source_material_id', c.sourceMaterialId)
    await admin.from('source_materials').delete().eq('id', c.sourceMaterialId)
  }
  if (c.planId) {
    await admin.from('generation_plans').delete().eq('id', c.planId)
  }
  if (c.jobIds.length > 0) {
    await admin.from('generation_jobs').delete().in('id', c.jobIds)
  }
  await admin.from('courses').delete().eq('id', c.courseId)
  console.log('[cleanup] Done.')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function loadDotEnvLocal(): void {
  // Minimal .env loader so this script runs without `--env-file` flags.
  // Doesn't overwrite existing vars — lets the user override via shell.
  try {
    const envPath = join(process.cwd(), '.env.local')
    const raw = readFileSync(envPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      // Silently generate the plain SUPABASE_URL var from the public one if
      // only the latter exists — the worker expects SUPABASE_URL.
      process.env[key] ??= val
    }
    if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    }
  } catch {
    // No .env.local — assume env is set externally (CI, shell export, etc.).
  }
}

// node_modules/@supabase still expects randomUUID to exist in older envs; we
// pull it in here to be safe in case any downstream module reaches for it.
void randomUUID

main()
