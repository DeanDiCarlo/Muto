'use server'

// =============================================================================
// Course Instance Server Actions.
//
// NOTE (dev stub): auth is resolved via `getCurrentUser()` which reads the
// `muto-dev-user` cookie set by the dev login page. Because there's no real
// Supabase Auth JWT in dev, all queries here use the admin client and we
// enforce course ownership (`courses.created_by === user.id`) manually. When
// real SSO lands, swap to the server SSR client + RLS.
// =============================================================================

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createInstanceSchema = z.object({
  courseId: z.string().uuid(),
  semester: z.string().trim().min(1, 'Semester is required').max(100),
})

const toggleInstanceSchema = z.string().uuid()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstanceCardData = {
  id: string
  semester: string
  joinCode: string
  joinLink: string
  isActive: boolean
  createdAt: string
  enrolledStudentCount: number
}

export type CreateInstanceResult =
  | { success: true; instance: InstanceCardData }
  | { success: false; error: string }

export type ToggleInstanceResult =
  | { success: true; isActive: boolean }
  | { success: false; error: string }

// ---------------------------------------------------------------------------
// Join code generation
// ---------------------------------------------------------------------------

/**
 * Base32-ish alphabet chosen to avoid confusing characters.
 * Excludes: 0 (zero), O, 1 (one), l (ell). 32 characters total.
 */
const JOIN_CODE_ALPHABET = 'ABCDEFGHIJKMNPQRSTUVWXYZ23456789'
const JOIN_CODE_LENGTH = 8

function generateJoinCode(): string {
  const bytes = new Uint8Array(JOIN_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    // Alphabet length is 32, so mod 32 = low 5 bits. Uniform over [0, 32).
    out += JOIN_CODE_ALPHABET[bytes[i] % 32]
  }
  return out
}

function buildJoinLink(code: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://trymuto.com'
  // Strip a trailing slash for consistency.
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  return `${trimmed}/join/${code}`
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Verifies the current user owns the course. Returns the user on success,
 * or an error string on failure.
 */
async function requireCourseOwner(
  courseId: string
): Promise<{ userId: string } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('courses')
    .select('id, created_by')
    .eq('id', courseId)
    .single()

  if (error || !data) return { error: 'Course not found' }
  if (data.created_by !== user.id) return { error: 'Forbidden' }

  return { userId: user.id }
}

/**
 * Creates a new course instance (one semester's offering) for a course the
 * current professor owns. Also inserts a `course_staff` row marking the
 * creator as the instance's professor with edit rights.
 *
 * A unique 8-char base32 join code is generated; on collision we retry up to
 * 5 times before giving up.
 */
export async function createInstance(
  input: z.input<typeof createInstanceSchema>
): Promise<CreateInstanceResult> {
  const parsed = createInstanceSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    }
  }

  const ownership = await requireCourseOwner(parsed.data.courseId)
  if ('error' in ownership) {
    return { success: false, error: ownership.error }
  }

  const admin = createAdminClient()

  const maxAttempts = 5
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateJoinCode()
    const link = buildJoinLink(code)

    const { data, error } = await admin
      .from('course_instances')
      .insert({
        course_id: parsed.data.courseId,
        semester: parsed.data.semester,
        join_code: code,
        join_link: link,
        is_active: true,
      })
      .select('id, semester, join_code, join_link, is_active, created_at')
      .single()

    if (error) {
      // Postgres unique_violation = 23505. Retry with a new code.
      if (error.code === '23505') {
        continue
      }
      return { success: false, error: error.message }
    }
    if (!data) {
      return { success: false, error: 'Failed to create instance' }
    }

    // Insert course_staff row for the creator.
    const { error: staffError } = await admin.from('course_staff').insert({
      course_instance_id: data.id,
      user_id: ownership.userId,
      role: 'professor',
      can_edit_structure: true,
    })
    if (staffError) {
      return { success: false, error: staffError.message }
    }

    return {
      success: true,
      instance: {
        id: data.id,
        semester: data.semester,
        joinCode: data.join_code,
        joinLink: data.join_link ?? link,
        isActive: data.is_active,
        createdAt: data.created_at,
        enrolledStudentCount: 0,
      },
    }
  }

  return {
    success: false,
    error: 'Could not generate a unique join code. Please try again.',
  }
}

/**
 * Returns all instances for a course the current professor owns, newest first.
 * Embeds enrollments to compute a student count per instance without N+1.
 */
export async function listInstances(
  courseId: string
): Promise<InstanceCardData[]> {
  const parsedId = z.string().uuid().safeParse(courseId)
  if (!parsedId.success) return []

  const ownership = await requireCourseOwner(parsedId.data)
  if ('error' in ownership) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('course_instances')
    .select(
      'id, semester, join_code, join_link, is_active, created_at, enrollments(id)'
    )
    .eq('course_id', parsedId.data)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((row) => {
    const enrollments = (row.enrollments ?? []) as Array<{ id: string }>
    return {
      id: row.id,
      semester: row.semester,
      joinCode: row.join_code,
      joinLink: row.join_link ?? buildJoinLink(row.join_code),
      isActive: row.is_active,
      createdAt: row.created_at,
      enrolledStudentCount: enrollments.length,
    }
  })
}

/**
 * Flips `is_active` on an instance, provided the current professor owns the
 * parent course.
 */
export async function toggleInstanceActive(
  instanceId: string
): Promise<ToggleInstanceResult> {
  const parsed = toggleInstanceSchema.safeParse(instanceId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid instance id' }
  }

  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const admin = createAdminClient()

  // Look up the instance + parent course ownership in one round-trip.
  const { data: instance, error: fetchError } = await admin
    .from('course_instances')
    .select('id, is_active, course_id, courses!inner(created_by)')
    .eq('id', parsed.data)
    .single()

  if (fetchError || !instance) {
    return { success: false, error: 'Instance not found' }
  }

  const course = instance.courses as unknown as { created_by: string } | null
  if (!course || course.created_by !== user.id) {
    return { success: false, error: 'Forbidden' }
  }

  const nextValue = !instance.is_active
  const { error: updateError } = await admin
    .from('course_instances')
    .update({ is_active: nextValue })
    .eq('id', parsed.data)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true, isActive: nextValue }
}
