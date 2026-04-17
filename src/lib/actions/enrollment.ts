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
