'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { planDataSchema, type PlanData } from '@/types/generation'

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return { supabase, user }
}

async function assertCourseAccess(courseId: string, userId: string) {
  const supabase = await createClient()

  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('created_by', userId)
    .single()

  if (course) return

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
// getPlan
// ---------------------------------------------------------------------------

const getPlanSchema = z.object({ courseId: z.string().uuid() })

export async function getPlan(courseId: string) {
  try {
    const parsed = getPlanSchema.safeParse({ courseId })
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid course ID' }
    }

    const { user, supabase } = await getAuthUser()
    await assertCourseAccess(courseId, user.id)

    const { data: plan, error } = await supabase
      .from('generation_plans')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found — that's fine, plan just doesn't exist yet
      return { success: false as const, error: error.message }
    }

    return { success: true as const, plan: plan ?? null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// updatePlan
// ---------------------------------------------------------------------------

const updatePlanInputSchema = z.object({
  planId: z.string().uuid(),
  planData: planDataSchema,
  professorNotes: z.string().optional(),
})

export async function updatePlan(
  planId: string,
  planData: PlanData,
  professorNotes?: string
) {
  try {
    const parsed = updatePlanInputSchema.safeParse({ planId, planData, professorNotes })
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const { user } = await getAuthUser()
    const admin = createAdminClient()

    // Fetch plan to verify ownership and status
    const { data: plan, error: fetchError } = await admin
      .from('generation_plans')
      .select('id, course_id, status')
      .eq('id', planId)
      .single()

    if (fetchError || !plan) {
      return { success: false as const, error: 'Plan not found' }
    }

    await assertCourseAccess(plan.course_id, user.id)

    if (plan.status !== 'draft') {
      return { success: false as const, error: 'Plan can only be edited in draft status' }
    }

    const updateData: Record<string, unknown> = { plan_data: parsed.data.planData }
    if (professorNotes !== undefined) {
      updateData.professor_notes = professorNotes
    }

    const { error: updateError } = await admin
      .from('generation_plans')
      .update(updateData)
      .eq('id', planId)

    if (updateError) {
      return { success: false as const, error: updateError.message }
    }

    return { success: true as const }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// approvePlan
// ---------------------------------------------------------------------------

const approvePlanSchema = z.object({ planId: z.string().uuid() })

export async function approvePlan(planId: string) {
  try {
    const parsed = approvePlanSchema.safeParse({ planId })
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid plan ID' }
    }

    const { user } = await getAuthUser()
    const admin = createAdminClient()

    // Fetch the full plan
    const { data: plan, error: fetchError } = await admin
      .from('generation_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (fetchError || !plan) {
      return { success: false as const, error: 'Plan not found' }
    }

    await assertCourseAccess(plan.course_id, user.id)

    if (plan.status !== 'draft') {
      return { success: false as const, error: 'Plan can only be approved from draft status' }
    }

    // Validate plan_data
    const planDataResult = planDataSchema.safeParse(plan.plan_data)
    if (!planDataResult.success) {
      return { success: false as const, error: 'Invalid plan data: ' + planDataResult.error.issues[0].message }
    }
    const data = planDataResult.data

    // Set status to approved
    const { error: approveError } = await admin
      .from('generation_plans')
      .update({ status: 'approved' as const, approved_at: new Date().toISOString() })
      .eq('id', planId)

    if (approveError) {
      return { success: false as const, error: approveError.message }
    }

    let modulesCreated = 0
    let labsCreated = 0
    let conceptsCreated = 0
    let jobsCreated = 0

    try {
      for (const planModule of data.modules) {
        // Create module
        const { data: moduleRow, error: modError } = await admin
          .from('modules')
          .insert({
            course_id: plan.course_id,
            title: planModule.title,
            position: planModule.position,
          })
          .select('id')
          .single()

        if (modError || !moduleRow) {
          throw new Error(`Failed to create module "${planModule.title}": ${modError?.message}`)
        }
        modulesCreated++

        for (let labIndex = 0; labIndex < planModule.labs.length; labIndex++) {
          const planLab = planModule.labs[labIndex]

          // Create lab
          const { data: labRow, error: labError } = await admin
            .from('labs')
            .insert({
              module_id: moduleRow.id,
              title: planLab.title,
              position: labIndex,
              generation_status: 'pending' as const,
            })
            .select('id')
            .single()

          if (labError || !labRow) {
            throw new Error(`Failed to create lab "${planLab.title}": ${labError?.message}`)
          }
          labsCreated++

          // Link source materials to this lab
          if (planLab.source_material_ids.length > 0) {
            await admin
              .from('source_materials')
              .update({ lab_id: labRow.id })
              .in('id', planLab.source_material_ids)
          }

          // Create concepts
          const conceptIds: string[] = []
          for (let conceptIndex = 0; conceptIndex < planLab.proposed_concepts.length; conceptIndex++) {
            const conceptName = planLab.proposed_concepts[conceptIndex]
            const { data: conceptRow, error: conceptError } = await admin
              .from('concepts')
              .insert({
                lab_id: labRow.id,
                name: conceptName,
                status: 'proposed' as const,
                position: conceptIndex,
              })
              .select('id')
              .single()

            if (conceptError || !conceptRow) {
              throw new Error(`Failed to create concept "${conceptName}": ${conceptError?.message}`)
            }
            conceptIds.push(conceptRow.id)
            conceptsCreated++
          }

          // Create generate_lab job
          const { error: jobError } = await admin
            .from('generation_jobs')
            .insert({
              course_id: plan.course_id,
              created_by: user.id,
              job_type: 'generate_lab' as const,
              status: 'pending' as const,
              input_payload: {
                lab_id: labRow.id,
                source_material_ids: planLab.source_material_ids,
                concept_ids: conceptIds,
              },
              estimated_cost_cents: planLab.estimated_cost_cents,
            })

          if (jobError) {
            throw new Error(`Failed to create job for lab "${planLab.title}": ${jobError.message}`)
          }
          jobsCreated++
        }
      }

      // Set plan status to generating
      await admin
        .from('generation_plans')
        .update({ status: 'generating' as const })
        .eq('id', planId)

      return {
        success: true as const,
        modulesCreated,
        labsCreated,
        conceptsCreated,
        jobsCreated,
      }
    } catch (innerErr) {
      // Rollback: set plan back to draft
      console.error('[approvePlan] Rolling back — setting plan back to draft:', innerErr)
      await admin
        .from('generation_plans')
        .update({ status: 'draft' as const, approved_at: null })
        .eq('id', planId)

      const message = innerErr instanceof Error ? innerErr.message : 'Unknown error during approval'
      return { success: false as const, error: message }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// cancelPlan
// ---------------------------------------------------------------------------

const cancelPlanSchema = z.object({ planId: z.string().uuid() })

export async function cancelPlan(planId: string) {
  try {
    const parsed = cancelPlanSchema.safeParse({ planId })
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid plan ID' }
    }

    const { user } = await getAuthUser()
    const admin = createAdminClient()

    const { data: plan, error: fetchError } = await admin
      .from('generation_plans')
      .select('id, course_id, status')
      .eq('id', planId)
      .single()

    if (fetchError || !plan) {
      return { success: false as const, error: 'Plan not found' }
    }

    await assertCourseAccess(plan.course_id, user.id)

    if (plan.status !== 'draft') {
      return { success: false as const, error: 'Only draft plans can be cancelled' }
    }

    const { error: deleteError } = await admin
      .from('generation_plans')
      .delete()
      .eq('id', planId)

    if (deleteError) {
      return { success: false as const, error: deleteError.message }
    }

    return { success: true as const }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// getSourceMaterialsForCourse
// ---------------------------------------------------------------------------

const getSourceMaterialsForCourseSchema = z.object({ courseId: z.string().uuid() })

export async function getSourceMaterialsForCourse(courseId: string) {
  try {
    const parsed = getSourceMaterialsForCourseSchema.safeParse({ courseId })
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid course ID' }
    }

    const { user, supabase } = await getAuthUser()
    await assertCourseAccess(courseId, user.id)

    const { data, error } = await supabase
      .from('source_materials')
      .select('id, file_name, file_type')
      .eq('course_id', courseId)
      .order('created_at', { ascending: true })

    if (error) {
      return { success: false as const, error: error.message }
    }

    return { success: true as const, materials: data ?? [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}
