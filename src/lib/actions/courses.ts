'use server'

// =============================================================================
// Course Server Actions.
//
// NOTE (dev stub): auth is resolved via `getCurrentUser()` which reads the
// `muto-dev-user` cookie set by the dev login page. Because there's no real
// Supabase Auth JWT in dev, all queries here use the admin client and we
// enforce `created_by = user.id` manually. When real SSO lands, swap to the
// server SSR client + RLS.
// =============================================================================

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { slugify, ensureUniqueSlug } from '@/lib/utils/slug'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createCourseSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  subjectArea: z.string().trim().max(100).optional().or(z.literal('')),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  displaySlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must use lowercase letters, numbers, and hyphens')
    .min(2)
    .max(80)
    .optional()
    .or(z.literal('')),
})

const updateCourseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CourseCardData = {
  id: string
  slug: string
  title: string
  description: string | null
  subjectArea: string | null
  createdAt: string
  moduleCount: number
  labCount: number
  activeInstanceCount: number
  enrolledStudentCount: number
}

export type PlanStatus = 'draft' | 'approved' | 'generating' | 'completed'

export type CourseOverview = {
  course: {
    id: string
    slug: string
    title: string
    description: string | null
    subjectArea: string | null
    createdAt: string
  }
  materialsCount: number
  parsingJobsInFlight: number
  planStatus: PlanStatus | null
  planId: string | null
  labsCount: number
  generatingLabsCount: number
  completedLabsCount: number
  failedLabsCount: number
  instancesCount: number
  activeInstancesCount: number
  /** Top-most active instance; populated when there's at least one active instance. */
  topActiveInstance: { id: string; semester: string; joinCode: string } | null
  enrolledStudentCount: number
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Creates a course owned by the current professor. Redirects to the new
 * course's home page on success. Call from a client form; the `redirect()`
 * throw propagates through the Server Action response.
 */
export async function createCourse(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }
  if (user.role === 'student') return { error: 'Only professors can create courses' }

  const parsed = createCourseSchema.safeParse({
    title: formData.get('title'),
    subjectArea: formData.get('subjectArea'),
    description: formData.get('description'),
    displaySlug: formData.get('displaySlug'),
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Invalid input' }
  }

  const admin = createAdminClient()

  // Resolve display_slug: use professor-provided value or derive from title.
  // ensureUniqueSlug appends -2, -3, … on collision so auto-derived slugs
  // never fail; provided slugs fail fast with a user-facing error.
  let displaySlug: string
  const providedSlug = parsed.data.displaySlug || ''
  if (providedSlug) {
    displaySlug = providedSlug
  } else {
    displaySlug = await ensureUniqueSlug(
      slugify(parsed.data.title) || 'course',
      async (candidate) => {
        const { data } = await admin
          .from('courses')
          .select('id')
          .eq('institution_id', user.institutionId)
          .eq('display_slug', candidate)
          .maybeSingle()
        return data !== null
      }
    )
  }

  // Id-suffix matches the migration-006 backfill pattern; no collision retry
  // needed because the suffix is derived from the row's own uuid.
  const { data: inserted, error: insertErr } = await admin
    .from('courses')
    .insert({
      institution_id: user.institutionId,
      created_by: user.id,
      title: parsed.data.title,
      slug: 'pending',
      display_slug: displaySlug,
      subject_area: parsed.data.subjectArea || null,
      description: parsed.data.description || null,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    if (insertErr?.code === '23505' && insertErr.message.includes('display_slug')) {
      return { error: 'That course slug is already in use at your institution. Choose a different one.' }
    }
    return { error: insertErr?.message ?? 'Failed to create course' }
  }

  const slug = `${slugify(parsed.data.title) || 'course'}-${inserted.id.slice(0, 6)}`
  const { error: slugErr } = await admin
    .from('courses')
    .update({ slug })
    .eq('id', inserted.id)

  if (slugErr) {
    return { error: slugErr.message }
  }

  redirect(`/professor/courses/${displaySlug}`)
}

/**
 * Returns all courses owned by the current professor with aggregate stats.
 * Single round-trip query; counts derived from embedded rows (no N+1).
 */
export async function listCoursesForProfessor(): Promise<CourseCardData[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('courses')
    .select(
      `
      id,
      display_slug,
      title,
      description,
      subject_area,
      created_at,
      modules ( id, labs ( id ) ),
      course_instances ( id, is_active, enrollments ( id ) )
      `
    )
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((c) => {
    const modules = (c.modules ?? []) as Array<{ id: string; labs: Array<{ id: string }> | null }>
    const instances = (c.course_instances ?? []) as Array<{
      id: string
      is_active: boolean
      enrollments: Array<{ id: string }> | null
    }>

    const moduleCount = modules.length
    const labCount = modules.reduce((sum, m) => sum + (m.labs?.length ?? 0), 0)
    const activeInstanceCount = instances.filter((i) => i.is_active).length
    const enrolledStudentCount = instances.reduce(
      (sum, i) => sum + (i.enrollments?.length ?? 0),
      0
    )

    return {
      id: c.id,
      slug: c.display_slug,
      title: c.title,
      description: c.description,
      subjectArea: c.subject_area,
      createdAt: c.created_at,
      moduleCount,
      labCount,
      activeInstanceCount,
      enrolledStudentCount,
    }
  })
}

/**
 * Returns a course + aggregate state needed by the Course Home / Next Step card.
 * Two parallel queries: the course (+ embedded materials/plans/modules/labs/instances)
 * and an in-flight parse-job count. All derivations happen in JS.
 */
export async function getCourseOverview(courseId: string): Promise<CourseOverview | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const parsedId = z.string().uuid().safeParse(courseId)
  if (!parsedId.success) return null

  const admin = createAdminClient()

  const [courseRes, parseJobsRes] = await Promise.all([
    admin
      .from('courses')
      .select(
        `
        id, slug, display_slug, title, description, subject_area, created_at,
        source_materials ( id ),
        generation_plans ( id, status, created_at ),
        modules ( id, labs ( id, generation_status ) ),
        course_instances ( id, is_active, join_code, semester, created_at, enrollments ( id ) )
        `
      )
      .eq('id', parsedId.data)
      .eq('created_by', user.id)
      .single(),
    admin
      .from('generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', parsedId.data)
      .eq('job_type', 'parse_materials')
      .in('status', ['pending', 'running']),
  ])

  if (courseRes.error || !courseRes.data) return null
  const c = courseRes.data

  const materials = (c.source_materials ?? []) as Array<{ id: string }>
  const plans = (c.generation_plans ?? []) as Array<{
    id: string
    status: PlanStatus
    created_at: string
  }>
  const modules = (c.modules ?? []) as Array<{
    id: string
    labs: Array<{ id: string; generation_status: 'pending' | 'generating' | 'complete' | 'failed' }> | null
  }>
  const instances = (c.course_instances ?? []) as Array<{
    id: string
    is_active: boolean
    join_code: string
    semester: string
    created_at: string
    enrollments: Array<{ id: string }> | null
  }>

  const labs = modules.flatMap((m) => m.labs ?? [])
  const latestPlan =
    plans.length === 0
      ? null
      : [...plans].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

  const activeInstances = instances
    .filter((i) => i.is_active)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return {
    course: {
      id: c.id,
      slug: (c as unknown as { display_slug: string }).display_slug,
      title: c.title,
      description: c.description,
      subjectArea: c.subject_area,
      createdAt: c.created_at,
    },
    materialsCount: materials.length,
    parsingJobsInFlight: parseJobsRes.count ?? 0,
    planStatus: latestPlan?.status ?? null,
    planId: latestPlan?.id ?? null,
    labsCount: labs.length,
    generatingLabsCount: labs.filter((l) => l.generation_status === 'generating').length,
    completedLabsCount: labs.filter((l) => l.generation_status === 'complete').length,
    failedLabsCount: labs.filter((l) => l.generation_status === 'failed').length,
    instancesCount: instances.length,
    activeInstancesCount: activeInstances.length,
    topActiveInstance:
      activeInstances[0]
        ? {
            id: activeInstances[0].id,
            semester: activeInstances[0].semester,
            joinCode: activeInstances[0].join_code,
          }
        : null,
    enrolledStudentCount: instances.reduce(
      (sum, i) => sum + (i.enrollments?.length ?? 0),
      0
    ),
  }
}

/**
 * Rename a course. Called from the course home's inline title editor.
 * Returns shape-compatible with `useActionState` + sonner toasts.
 */
export async function updateCourse(input: {
  id: string
  title: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const parsed = updateCourseSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('courses')
    .update({ title: parsed.data.title })
    .eq('id', parsed.data.id)
    .eq('created_by', user.id)
    .select('id')
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Course not found' }
  }

  return { success: true }
}

/**
 * Returns a single course if the current professor owns it.
 * Returns null if not found or access denied.
 */
export async function getCourse(courseId: string) {
  const user = await getCurrentUser()
  if (!user) return null

  const parsedId = z.string().uuid().safeParse(courseId)
  if (!parsedId.success) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('courses')
    .select('id, title, slug, display_slug, description, subject_area, institution_id, created_by, created_at')
    .eq('id', parsedId.data)
    .eq('created_by', user.id)
    .single()

  if (error || !data) return null
  return data
}

/**
 * Display-slug-scoped counterpart to `getCourse`. Looks up by display_slug
 * (the professor-defined URL slug) rather than the internal UUID-suffixed slug.
 * Scoped to (institution_id, created_by) via the current user.
 */
export async function getCourseBySlug(slug: string) {
  const user = await getCurrentUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('courses')
    .select('id, title, slug, display_slug, description, subject_area, institution_id, created_by, created_at')
    .eq('institution_id', user.institutionId)
    .eq('created_by', user.id)
    .eq('display_slug', slug)
    .single()

  if (error || !data) return null
  return data
}
