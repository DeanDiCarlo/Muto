'use server'

// =============================================================================
// Student-side lab server actions.
//
// NOTE (dev stub): auth via `getCurrentUser()` + admin client. See enrollment.ts.
// =============================================================================

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { labContentSchema, type LabContent, type BloomsStructure } from '@muto/shared/generation'

// ---------------------------------------------------------------------------
// getLabForStudent
// ---------------------------------------------------------------------------

const getLabForStudentSchema = z.object({
  instanceId: z.string().uuid(),
  labId: z.string().uuid(),
})

export type StudentLabView = {
  id: string
  title: string
  content: LabContent
  blooms_structure: BloomsStructure | null
  generation_status: string
}

export async function getLabForStudent(input: {
  instanceId: string
  labId: string
}) {
  const parsed = getLabForStudentSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false as const, error: 'Invalid ID' }
  }

  const { instanceId, labId } = parsed.data

  const user = await getCurrentUser()
  if (!user) {
    return { success: false as const, error: 'Unauthorized' }
  }

  const admin = createAdminClient()

  // Verify enrollment in the course instance.
  const { data: enrollment, error: enrollErr } = await admin
    .from('enrollments')
    .select('id')
    .eq('course_instance_id', instanceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (enrollErr || !enrollment) {
    return { success: false as const, error: 'Not enrolled in this course' }
  }

  // Look up the instance's course id.
  const { data: instance, error: instErr } = await admin
    .from('course_instances')
    .select('course_id, courses!inner(id, title)')
    .eq('id', instanceId)
    .single()

  if (instErr || !instance) {
    return { success: false as const, error: 'Instance not found' }
  }

  type InstanceRow = { course_id: string; courses: { id: string; title: string } }
  const inst = instance as unknown as InstanceRow

  // Fetch the lab along with its module, and confirm the module's course
  // matches the enrollment's course.
  const { data: lab, error: labErr } = await admin
    .from('labs')
    .select(
      'id, title, content, blooms_structure, generation_status, modules!inner(id, title, course_id)'
    )
    .eq('id', labId)
    .single()

  if (labErr || !lab) {
    return { success: false as const, error: 'Lab not found' }
  }

  type LabRow = {
    id: string
    title: string
    content: unknown
    blooms_structure: unknown
    generation_status: string
    modules: { id: string; title: string; course_id: string }
  }
  const labRow = lab as unknown as LabRow

  if (labRow.modules.course_id !== inst.course_id) {
    return { success: false as const, error: 'Lab does not belong to this course' }
  }

  if (labRow.generation_status !== 'complete') {
    return { success: false as const, error: 'Lab is not ready yet' }
  }

  const contentParsed = labContentSchema.safeParse(labRow.content)
  if (!contentParsed.success) {
    return { success: false as const, error: 'Lab content malformed' }
  }

  return {
    success: true as const,
    lab: {
      id: labRow.id,
      title: labRow.title,
      content: contentParsed.data,
      blooms_structure: (labRow.blooms_structure ?? null) as BloomsStructure | null,
      generation_status: labRow.generation_status,
    } satisfies StudentLabView,
    moduleTitle: labRow.modules.title,
    courseTitle: inst.courses.title,
  }
}
