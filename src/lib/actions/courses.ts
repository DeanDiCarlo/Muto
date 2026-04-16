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

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createCourseSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  subjectArea: z.string().trim().max(100).optional().or(z.literal('')),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CourseCardData = {
  id: string
  title: string
  description: string | null
  subjectArea: string | null
  createdAt: string
  moduleCount: number
  labCount: number
  activeInstanceCount: number
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
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Invalid input' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('courses')
    .insert({
      institution_id: user.institutionId,
      created_by: user.id,
      title: parsed.data.title,
      subject_area: parsed.data.subjectArea || null,
      description: parsed.data.description || null,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: error?.message ?? 'Failed to create course' }
  }

  redirect(`/professor/courses/${data.id}`)
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
    .select('id, title, description, subject_area, institution_id, created_by, created_at')
    .eq('id', parsedId.data)
    .eq('created_by', user.id)
    .single()

  if (error || !data) return null
  return data
}
