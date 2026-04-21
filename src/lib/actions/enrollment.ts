'use server'

// =============================================================================
// Enrollment Server Actions.
//
// NOTE (dev stub): auth via `getCurrentUser()` + admin client. See instances.ts.
// =============================================================================

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const joinCourseSchema = z.object({
  joinCode: z.string().trim().min(1, 'Join code is required'),
})

// ---------------------------------------------------------------------------
// joinCourse
// ---------------------------------------------------------------------------

export async function joinCourse(joinCode: string) {
  try {
    const parsed = joinCourseSchema.safeParse({ joinCode })
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const user = await getCurrentUser()
    if (!user) {
      return { success: false as const, error: 'Unauthorized' }
    }
    if (user.role !== 'student') {
      return { success: false as const, error: 'Only students can join courses' }
    }

    const admin = createAdminClient()

    // Case-insensitive lookup
    const { data: instance, error: lookupError } = await admin
      .from('course_instances')
      .select('id, course_id, is_active, courses!inner(title)')
      .ilike('join_code', parsed.data.joinCode)
      .single()

    if (lookupError || !instance) {
      return { success: false as const, error: 'Instance not found. Check your join code.' }
    }

    if (!instance.is_active) {
      return { success: false as const, error: 'This course is no longer accepting enrollments.' }
    }

    // Check for existing enrollment (idempotent)
    const { data: existing } = await admin
      .from('enrollments')
      .select('id')
      .eq('course_instance_id', instance.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      // Already enrolled — return success
      const courseTitle = Array.isArray(instance.courses)
        ? instance.courses[0]?.title
        : (instance.courses as { title: string })?.title
      return {
        success: true as const,
        instanceId: instance.id,
        courseTitle: courseTitle ?? 'Course',
        alreadyEnrolled: true,
      }
    }

    // Create enrollment
    const { error: insertError } = await admin
      .from('enrollments')
      .insert({
        course_instance_id: instance.id,
        user_id: user.id,
      })

    if (insertError) {
      return { success: false as const, error: insertError.message }
    }

    const courseTitle = Array.isArray(instance.courses)
      ? instance.courses[0]?.title
      : (instance.courses as { title: string })?.title

    return {
      success: true as const,
      instanceId: instance.id,
      courseTitle: courseTitle ?? 'Course',
      alreadyEnrolled: false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// listMyEnrollments
// ---------------------------------------------------------------------------

export async function listMyEnrollments() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false as const, error: 'Unauthorized' }
    }

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('enrollments')
      .select(
        'id, enrolled_at, course_instance_id, course_instances!inner(id, slug, semester, is_active, course_id, courses!inner(id, title, subject_area))'
      )
      .eq('user_id', user.id)
      .order('enrolled_at', { ascending: false })

    if (error) {
      return { success: false as const, error: error.message }
    }

    type EnrollmentRow = {
      id: string
      enrolled_at: string
      course_instance_id: string
      course_instances: {
        id: string
        slug: string
        semester: string
        is_active: boolean
        course_id: string
        courses: { id: string; title: string; subject_area: string | null }
      }
    }
    const rows = (data ?? []) as unknown as EnrollmentRow[]

    const enrollments = rows.map((r) => ({
      enrollmentId: r.id,
      instanceId: r.course_instances.id,
      instanceSlug: r.course_instances.slug,
      courseId: r.course_instances.course_id,
      courseTitle: r.course_instances.courses.title,
      subjectArea: r.course_instances.courses.subject_area,
      semester: r.course_instances.semester,
      isActive: r.course_instances.is_active,
      enrolledAt: r.enrolled_at,
    }))

    return { success: true as const, enrollments }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// getInstanceBySlug — slug-scoped lookup for student routes (migration 006).
// Scoped to the caller's enrollment; returns null if the current user is not
// enrolled in the matched instance.
// ---------------------------------------------------------------------------

export async function getInstanceBySlug(slug: string) {
  const user = await getCurrentUser()
  if (!user) return null

  const admin = createAdminClient()

  const { data: instance, error } = await admin
    .from('course_instances')
    .select('id, slug, course_id, semester, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !instance) return null

  const { data: enrollment } = await admin
    .from('enrollments')
    .select('id')
    .eq('course_instance_id', instance.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!enrollment) return null

  return instance
}

// ---------------------------------------------------------------------------
// getStudentCourseView
// ---------------------------------------------------------------------------

const getStudentCourseViewSchema = z.string().uuid()

export async function getStudentCourseView(instanceId: string) {
  try {
    const parsed = getStudentCourseViewSchema.safeParse(instanceId)
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid instance ID' }
    }

    const user = await getCurrentUser()
    if (!user) {
      return { success: false as const, error: 'Unauthorized' }
    }

    const admin = createAdminClient()

    // Verify enrollment
    const { data: enrollment, error: enrollErr } = await admin
      .from('enrollments')
      .select('id')
      .eq('course_instance_id', instanceId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (enrollErr || !enrollment) {
      return { success: false as const, error: 'Not enrolled in this course' }
    }

    // Fetch instance + course
    const { data: instance, error: instErr } = await admin
      .from('course_instances')
      .select('id, semester, is_active, courses!inner(id, title, subject_area)')
      .eq('id', instanceId)
      .single()

    if (instErr || !instance) {
      return { success: false as const, error: 'Instance not found' }
    }

    type InstanceRow = typeof instance & {
      courses: { id: string; title: string; subject_area: string | null }
    }
    const inst = instance as unknown as InstanceRow
    const courseId = inst.courses.id

    // Fetch modules + labs
    const { data: modules, error: modErr } = await admin
      .from('modules')
      .select('id, title, position')
      .eq('course_id', courseId)
      .order('position', { ascending: true })

    if (modErr) {
      return { success: false as const, error: modErr.message }
    }

    const { data: labs, error: labErr } = await admin
      .from('labs')
      .select('id, module_id, title, position, generation_status')
      .in('module_id', (modules ?? []).map((m) => m.id))
      .order('position', { ascending: true })

    if (labErr) {
      return { success: false as const, error: labErr.message }
    }

    // Fetch review sessions for this enrollment to determine has_started
    const { data: sessions } = await admin
      .from('review_sessions')
      .select('lab_id')
      .eq('enrollment_id', enrollment.id)

    const startedLabIds = new Set((sessions ?? []).map((s) => s.lab_id))

    // Build nested structure
    const labsByModule = new Map<string, typeof labs>()
    for (const lab of labs ?? []) {
      const arr = labsByModule.get(lab.module_id) ?? []
      arr.push(lab)
      labsByModule.set(lab.module_id, arr)
    }

    const moduleTree = (modules ?? []).map((mod) => ({
      id: mod.id,
      title: mod.title,
      position: mod.position,
      labs: (labsByModule.get(mod.id) ?? []).map((lab) => ({
        id: lab.id,
        title: lab.title,
        position: lab.position,
        generationStatus: lab.generation_status,
        hasStarted: startedLabIds.has(lab.id),
      })),
    }))

    return {
      success: true as const,
      course: {
        id: inst.courses.id,
        title: inst.courses.title,
        subjectArea: inst.courses.subject_area,
      },
      instance: {
        id: inst.id,
        semester: inst.semester,
        isActive: inst.is_active,
      },
      modules: moduleTree,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}
