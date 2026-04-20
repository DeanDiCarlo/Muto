'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const uploadMaterialSchema = z.object({
  courseId: z.string().uuid(),
  fileName: z.string().min(1),
  fileType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
  ]),
  storagePath: z.string().min(1),
  fileSizeBytes: z.number().positive().max(52_428_800), // 50MB
})

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getAuthUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  const supabase = await createClient()
  return { supabase, user }
}

async function assertCourseAccess(courseId: string, userId: string) {
  const supabase = await createClient()

  // Check if user is course owner
  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('created_by', userId)
    .single()

  if (course) return

  // Check if user is staff with can_edit_structure on any instance of this course
  const { data: instances } = await supabase
    .from('course_instances')
    .select('id')
    .eq('course_id', courseId)

  if (instances && instances.length > 0) {
    const instanceIds = instances.map((i) => i.id)
    const { data: staff } = await supabase
      .from('course_staff')
      .select('id')
      .in('course_instance_id', instanceIds)
      .eq('user_id', userId)
      .eq('can_edit_structure', true)
      .limit(1)

    if (staff && staff.length > 0) return
  }

  throw new Error('Forbidden: not course owner or authorized staff')
}

// ---------------------------------------------------------------------------
// uploadMaterial
// ---------------------------------------------------------------------------

export async function uploadMaterial(formData: FormData) {
  try {
    const { user } = await getAuthUser()

    const raw = {
      courseId: formData.get('courseId') as string,
      fileName: formData.get('fileName') as string,
      fileType: formData.get('fileType') as string,
      storagePath: formData.get('storagePath') as string,
      fileSizeBytes: Number(formData.get('fileSizeBytes')),
    }

    const parsed = uploadMaterialSchema.safeParse(raw)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }
    const { courseId, fileName, fileType, storagePath, fileSizeBytes } = parsed.data

    await assertCourseAccess(courseId, user.id)

    const admin = createAdminClient()

    // Insert source_materials row
    const { data: material, error: matError } = await admin
      .from('source_materials')
      .insert({
        course_id: courseId,
        lab_id: null,
        uploaded_by: user.id,
        file_name: fileName,
        file_type: fileType,
        storage_path: storagePath,
        file_size_bytes: fileSizeBytes,
      })
      .select()
      .single()

    if (matError || !material) {
      return { success: false as const, error: matError?.message ?? 'Failed to create material record' }
    }

    // Insert parse_materials job
    const { data: job, error: jobError } = await admin
      .from('generation_jobs')
      .insert({
        course_id: courseId,
        created_by: user.id,
        job_type: 'parse_materials' as const,
        status: 'pending' as const,
        input_payload: { source_material_id: material.id },
      })
      .select('id')
      .single()

    if (jobError || !job) {
      return { success: false as const, error: jobError?.message ?? 'Failed to create parse job' }
    }

    return { success: true as const, material, jobId: job.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// getMaterials
// ---------------------------------------------------------------------------

const getMaterialsSchema = z.object({
  courseId: z.string().uuid(),
})

export async function getMaterials(courseId: string) {
  try {
    const parsed = getMaterialsSchema.safeParse({ courseId })
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid course ID' }
    }

    const { user, supabase } = await getAuthUser()
    await assertCourseAccess(courseId, user.id)

    // Fetch materials
    const { data: materials, error: matError } = await supabase
      .from('source_materials')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })

    if (matError) {
      return { success: false as const, error: matError.message }
    }

    if (!materials || materials.length === 0) {
      return { success: true as const, materials: [] }
    }

    // Fetch parse jobs for these materials
    const materialIds = materials.map((m) => m.id)
    const { data: jobs } = await supabase
      .from('generation_jobs')
      .select('id, status, progress_percent, current_step, error_message, input_payload')
      .eq('job_type', 'parse_materials')
      .eq('course_id', courseId)

    // Build a map: source_material_id → job info
    const jobMap = new Map<string, typeof jobs extends (infer T)[] | null ? T : never>()
    if (jobs) {
      for (const job of jobs) {
        const payload = job.input_payload as { source_material_id?: string } | null
        if (payload?.source_material_id) {
          jobMap.set(payload.source_material_id, job)
        }
      }
    }

    const materialsWithStatus = materials.map((m) => {
      const job = jobMap.get(m.id)
      return {
        ...m,
        parseJob: job
          ? {
              id: job.id,
              status: job.status,
              progressPercent: job.progress_percent,
              currentStep: job.current_step,
              errorMessage: job.error_message,
            }
          : null,
      }
    })

    return { success: true as const, materials: materialsWithStatus }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// deleteMaterial
// ---------------------------------------------------------------------------

const deleteMaterialSchema = z.object({
  materialId: z.string().uuid(),
})

export async function deleteMaterial(materialId: string) {
  try {
    const parsed = deleteMaterialSchema.safeParse({ materialId })
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid material ID' }
    }

    const { user } = await getAuthUser()
    const admin = createAdminClient()

    // Fetch the material to get course_id and storage_path
    const { data: material, error: fetchError } = await admin
      .from('source_materials')
      .select('*')
      .eq('id', materialId)
      .single()

    if (fetchError || !material) {
      return { success: false as const, error: 'Material not found' }
    }

    await assertCourseAccess(material.course_id, user.id)

    // Cancel any pending/running parse jobs for this material
    const { data: jobs } = await admin
      .from('generation_jobs')
      .select('id, input_payload')
      .eq('job_type', 'parse_materials')
      .eq('course_id', material.course_id)
      .in('status', ['pending', 'running'])

    if (jobs) {
      for (const job of jobs) {
        const payload = job.input_payload as { source_material_id?: string } | null
        if (payload?.source_material_id === materialId) {
          await admin
            .from('generation_jobs')
            .update({ status: 'cancelled' as const, completed_at: new Date().toISOString() })
            .eq('id', job.id)
        }
      }
    }

    // Delete content_blocks for this material
    await admin.from('content_blocks').delete().eq('source_material_id', materialId)

    // Delete file from Supabase Storage
    await admin.storage.from('source-materials').remove([material.storage_path])

    // Delete the source_materials row
    const { error: deleteError } = await admin
      .from('source_materials')
      .delete()
      .eq('id', materialId)

    if (deleteError) {
      return { success: false as const, error: deleteError.message }
    }

    return { success: true as const }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}
