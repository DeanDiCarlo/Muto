'use server'

// =============================================================================
// Lab Server Actions.
//
// NOTE (dev stub): auth is resolved via `getCurrentUser()` which reads the
// `muto-dev-user` cookie set by the dev login page. Because there's no real
// Supabase Auth JWT in dev, all queries here use the admin client and we
// enforce ownership (`courses.created_by = user.id`) manually. When real SSO
// lands, swap to the server SSR client + RLS.
// =============================================================================

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import type {
  BloomsLevel,
  BloomsStructure,
  LabContent,
} from '@muto/shared/generation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LabGenerationStatus = 'pending' | 'generating' | 'complete' | 'failed'

export type LabListRow = {
  id: string
  title: string
  position: number
  moduleId: string
  moduleTitle: string
  modulePosition: number
  generationStatus: LabGenerationStatus
  conceptCount: number
}

export type LabDetail = {
  lab: {
    id: string
    title: string
    description: string | null
    content: LabContent | null
    bloomsStructure: BloomsStructure | null
    generationStatus: LabGenerationStatus
    generatedAt: string | null
    createdAt: string
    moduleId: string
    moduleTitle: string
    courseId: string
    courseTitle: string
  }
  concepts: Array<{
    id: string
    name: string
    description: string | null
    bloomsLevel: BloomsLevel | null
    position: number
  }>
  sourceMaterials: Array<{
    id: string
    fileName: string
    fileType: string
  }>
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid()

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Returns all labs for a course (grouped via modules), ordered by
 * (module.position ASC, lab.position ASC). Includes a concept count per lab.
 * Returns `[]` if the course is not found or not owned by the current user.
 *
 * Single round-trip query: labs → modules (inner join on course_id) → concepts.
 */
export async function listLabsForCourse(courseId: string): Promise<LabListRow[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const parsedId = uuidSchema.safeParse(courseId)
  if (!parsedId.success) return []

  const admin = createAdminClient()

  // Enforce ownership: bail early if the course isn't owned by this user.
  const { data: course, error: courseErr } = await admin
    .from('courses')
    .select('id')
    .eq('id', parsedId.data)
    .eq('created_by', user.id)
    .maybeSingle()

  if (courseErr || !course) return []

  const { data, error } = await admin
    .from('labs')
    .select(
      `
      id,
      title,
      position,
      generation_status,
      module_id,
      modules!inner ( id, title, position, course_id ),
      concepts ( id )
      `
    )
    .eq('modules.course_id', parsedId.data)

  if (error || !data) return []

  const rows: LabListRow[] = data.map((l) => {
    // `modules!inner` resolves to a single object (not an array) in supabase-js
    // when the FK is 1:1, but the generated type may still be an array. Handle
    // both shapes defensively.
    const moduleRaw = (l as unknown as { modules: unknown }).modules
    const mod = Array.isArray(moduleRaw)
      ? (moduleRaw[0] as { id: string; title: string; position: number } | undefined)
      : (moduleRaw as { id: string; title: string; position: number } | null | undefined)

    const concepts = (l.concepts ?? []) as Array<{ id: string }>

    return {
      id: l.id,
      title: l.title,
      position: l.position,
      moduleId: l.module_id,
      moduleTitle: mod?.title ?? 'Untitled module',
      modulePosition: mod?.position ?? 0,
      generationStatus: l.generation_status as LabGenerationStatus,
      conceptCount: concepts.length,
    }
  })

  rows.sort((a, b) => {
    if (a.modulePosition !== b.modulePosition) return a.modulePosition - b.modulePosition
    if (a.moduleId !== b.moduleId) return a.moduleId.localeCompare(b.moduleId)
    return a.position - b.position
  })

  return rows
}

/**
 * Returns a single lab (+ its concepts and attached source materials) if the
 * current professor owns the parent course. Returns null on any miss.
 */
export async function getLab(labId: string): Promise<LabDetail | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const parsedId = uuidSchema.safeParse(labId)
  if (!parsedId.success) return null

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('labs')
    .select(
      `
      id,
      title,
      description,
      content,
      blooms_structure,
      generation_status,
      generated_at,
      created_at,
      module_id,
      modules!inner (
        id,
        title,
        course_id,
        courses!inner ( id, title, created_by )
      ),
      concepts ( id, name, description, position, status ),
      source_materials ( id, file_name, file_type )
      `
    )
    .eq('id', parsedId.data)
    .maybeSingle()

  if (error || !data) return null

  const moduleRaw = (data as unknown as { modules: unknown }).modules
  const mod = Array.isArray(moduleRaw)
    ? (moduleRaw[0] as
        | { id: string; title: string; course_id: string; courses: unknown }
        | undefined)
    : (moduleRaw as
        | { id: string; title: string; course_id: string; courses: unknown }
        | null
        | undefined)
  if (!mod) return null

  const courseRaw = mod.courses
  const course = Array.isArray(courseRaw)
    ? (courseRaw[0] as { id: string; title: string; created_by: string } | undefined)
    : (courseRaw as { id: string; title: string; created_by: string } | null | undefined)
  if (!course) return null

  // Manual ownership check.
  if (course.created_by !== user.id) return null

  const concepts = (data.concepts ?? []) as Array<{
    id: string
    name: string
    description: string | null
    position: number
    // `status` is a custom enum; some migrations store blooms level here, so
    // read the column defensively and fall back to null.
    status: string | null
  }>

  // Sort concepts by position for deterministic rendering.
  const conceptsSorted = [...concepts].sort((a, b) => a.position - b.position)

  const sourceMaterials = (data.source_materials ?? []) as Array<{
    id: string
    file_name: string
    file_type: string
  }>

  return {
    lab: {
      id: data.id,
      title: data.title,
      description: data.description,
      content: (data.content as LabContent | null) ?? null,
      bloomsStructure: (data.blooms_structure as BloomsStructure | null) ?? null,
      generationStatus: data.generation_status as LabGenerationStatus,
      generatedAt: data.generated_at,
      createdAt: data.created_at,
      moduleId: mod.id,
      moduleTitle: mod.title,
      courseId: course.id,
      courseTitle: course.title,
    },
    concepts: conceptsSorted.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      bloomsLevel: isBloomsLevel(c.status) ? c.status : null,
      position: c.position,
    })),
    sourceMaterials: sourceMaterials.map((s) => ({
      id: s.id,
      fileName: s.file_name,
      fileType: s.file_type,
    })),
  }
}

/**
 * Enqueues a fresh `generate_lab` job for this lab. Re-verifies ownership via
 * the lab's module's course. Returns the newly-created job id on success.
 */
export async function regenerateLab(
  labId: string
): Promise<{ success: true; jobId: string } | { success: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const parsedId = uuidSchema.safeParse(labId)
  if (!parsedId.success) return { success: false, error: 'Invalid lab id' }

  const admin = createAdminClient()

  // Resolve course id + verify ownership in a single query.
  const { data: labRow, error: labErr } = await admin
    .from('labs')
    .select(
      `
      id,
      modules!inner (
        course_id,
        courses!inner ( id, created_by )
      )
      `
    )
    .eq('id', parsedId.data)
    .maybeSingle()

  if (labErr || !labRow) return { success: false, error: 'Lab not found' }

  const moduleRaw = (labRow as unknown as { modules: unknown }).modules
  const mod = Array.isArray(moduleRaw)
    ? (moduleRaw[0] as { course_id: string; courses: unknown } | undefined)
    : (moduleRaw as { course_id: string; courses: unknown } | null | undefined)
  if (!mod) return { success: false, error: 'Lab not found' }

  const courseRaw = mod.courses
  const course = Array.isArray(courseRaw)
    ? (courseRaw[0] as { id: string; created_by: string } | undefined)
    : (courseRaw as { id: string; created_by: string } | null | undefined)
  if (!course) return { success: false, error: 'Lab not found' }

  if (course.created_by !== user.id) {
    return { success: false, error: 'Forbidden' }
  }

  const { data: job, error: jobErr } = await admin
    .from('generation_jobs')
    .insert({
      course_id: course.id,
      created_by: user.id,
      job_type: 'generate_lab',
      status: 'pending',
      priority: 1,
      input_payload: { lab_id: parsedId.data },
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return { success: false, error: jobErr?.message ?? 'Failed to enqueue job' }
  }

  return { success: true, jobId: job.id }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLOOMS_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const

function isBloomsLevel(v: unknown): v is BloomsLevel {
  return typeof v === 'string' && (BLOOMS_LEVELS as readonly string[]).includes(v)
}
