'use client'

import { useState, useEffect, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModuleCard } from './module-card'
import type { LabJobStatus } from './lab-card'
import { createClient } from '@/lib/supabase/client'
import { updatePlan, approvePlan, getSourceMaterialsForCourse } from '@/lib/actions/generation'
import {
  planDataSchema,
  type PlanData,
  type PlanModule,
} from '@/types/generation'

type GenerationPlanRow = {
  id: string
  course_id: string
  status: 'draft' | 'approved' | 'generating' | 'completed' | 'failed'
  plan_data: unknown
  professor_notes: string | null
  approved_at: string | null
  created_at: string
}

function recomputeTotal(modules: PlanModule[]): number {
  return modules.reduce(
    (sum, m) =>
      sum + m.labs.reduce((labSum, l) => labSum + l.estimated_cost_cents, 0),
    0
  )
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function PlanEditor({ plan }: { plan: GenerationPlanRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Parse the plan_data with safe fallback
  const initialPlanData = useMemo<PlanData>(() => {
    const parsed = planDataSchema.safeParse(plan.plan_data)
    if (parsed.success) return parsed.data
    return { modules: [], total_estimated_cost_cents: 0 }
  }, [plan.plan_data])

  const [planData, setPlanData] = useState<PlanData>(initialPlanData)
  const [professorNotes, setProfessorNotes] = useState(
    plan.professor_notes ?? ''
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [labJobs, setLabJobs] = useState<Record<string, LabJobStatus>>({})
  const [availableSourceMaterials, setAvailableSourceMaterials] = useState<Array<{ id: string; file_name: string; file_type: string }>>([])

  const isReadOnly = plan.status !== 'draft'
  const isGenerating = plan.status === 'generating' || plan.status === 'approved'

  const totalCost = recomputeTotal(planData.modules)
  const totalLabs = planData.modules.reduce((s, m) => s + m.labs.length, 0)
  const totalConcepts = planData.modules.reduce(
    (s, m) => s + m.labs.reduce((ls, l) => ls + l.proposed_concepts.length, 0),
    0
  )

  // Subscribe to generate_lab job updates after approval
  useEffect(() => {
    if (!isGenerating) return

    const supabase = createClient()
    const channel = supabase
      .channel(`generate-lab-jobs-${plan.course_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_jobs',
          filter: `course_id=eq.${plan.course_id}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            job_type: string
            status: string
            progress_percent: number
            current_step: string | null
            error_message: string | null
            input_payload: { lab_id?: string } | null
          }
          if (row.job_type !== 'generate_lab') return
          const labId = row.input_payload?.lab_id
          if (!labId) return

          setLabJobs((prev) => ({
            ...prev,
            [labId]: {
              status: row.status,
              progressPercent: row.progress_percent ?? 0,
              currentStep: row.current_step,
              errorMessage: row.error_message,
            },
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isGenerating, plan.course_id])

  // Fetch available source materials for the course once on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await getSourceMaterialsForCourse(plan.course_id)
      if (!cancelled && res.success) setAvailableSourceMaterials(res.materials)
    })()
    return () => {
      cancelled = true
    }
  }, [plan.course_id])

  function updateModule(idx: number, next: PlanModule) {
    const modules = planData.modules.map((m, i) => (i === idx ? next : m))
    setPlanData({
      modules,
      total_estimated_cost_cents: recomputeTotal(modules),
    })
  }

  function removeModule(idx: number) {
    const modules = planData.modules
      .filter((_, i) => i !== idx)
      .map((m, i) => ({ ...m, position: i }))
    setPlanData({
      modules,
      total_estimated_cost_cents: recomputeTotal(modules),
    })
  }

  function addModule() {
    const newModule: PlanModule = {
      title: `New Module ${planData.modules.length + 1}`,
      position: planData.modules.length,
      labs: [],
    }
    const modules = [...planData.modules, newModule]
    setPlanData({
      modules,
      total_estimated_cost_cents: recomputeTotal(modules),
    })
  }

  function handleSave() {
    setError(null)
    const dataToSave: PlanData = {
      modules: planData.modules,
      total_estimated_cost_cents: totalCost,
    }
    startTransition(async () => {
      const result = await updatePlan(plan.id, dataToSave, professorNotes)
      if (result.success) {
        setSavedAt(new Date())
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function handleApprove() {
    setError(null)
    startTransition(async () => {
      // Save first to ensure latest edits are persisted
      const dataToSave: PlanData = {
        modules: planData.modules,
        total_estimated_cost_cents: totalCost,
      }
      const saveResult = await updatePlan(plan.id, dataToSave, professorNotes)
      if (!saveResult.success) {
        setError(`Failed to save before approval: ${saveResult.error}`)
        setConfirmOpen(false)
        return
      }

      const approveResult = await approvePlan(plan.id)
      if (approveResult.success) {
        setConfirmOpen(false)
        router.refresh()
      } else {
        setError(approveResult.error)
        setConfirmOpen(false)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header / status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Generation Plan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isReadOnly
              ? plan.status === 'completed'
                ? 'All labs generated.'
                : plan.status === 'failed'
                  ? 'Plan generation failed.'
                  : 'Plan approved — generation in progress.'
              : 'Review the AI-proposed plan and edit before approval.'}
          </p>
        </div>
        <Badge
          variant={
            plan.status === 'draft'
              ? 'secondary'
              : plan.status === 'failed'
                ? 'destructive'
                : 'default'
          }
          className="capitalize"
        >
          {plan.status}
        </Badge>
      </div>

      {/* Professor notes */}
      <Card>
        <CardContent className="pt-6">
          <label className="text-sm font-medium block mb-2">
            Professor Notes
            <span className="text-muted-foreground font-normal ml-2">
              (Optional guidance for the lab generator)
            </span>
          </label>
          <Textarea
            value={professorNotes}
            onChange={(e) => setProfessorNotes(e.target.value)}
            disabled={isReadOnly || isPending}
            placeholder="e.g., Focus on practical examples. Use Qiskit code samples where applicable. Avoid heavy math notation in early modules."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Modules */}
      <div className="space-y-3">
        {planData.modules.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No modules in this plan.
              {!isReadOnly && ' Click "Add Module" to start building.'}
            </CardContent>
          </Card>
        ) : (
          planData.modules.map((module, idx) => {
            // Build a map of lab index → job status by matching on lab_id
            // Note: in draft mode, labs don't have IDs yet; in generating mode,
            // jobs reference labs by ID which we don't have here. We pass the
            // empty record so LabCard renders without job badges in draft mode.
            const jobStatusByLabIndex: Record<number, LabJobStatus | undefined> =
              {}
            // labJobs is keyed by lab_id which is created at approval time and
            // not stored in plan_data. After T11, the lab_id↔plan-position
            // mapping requires fetching labs from DB. For now, we just expose
            // any matching jobs by displaying them at the bottom of the page.
            return (
              <ModuleCard
                key={idx}
                module={module}
                moduleIndex={idx}
                onUpdate={(next) => updateModule(idx, next)}
                onRemove={() => removeModule(idx)}
                disabled={isReadOnly || isPending}
                jobStatusByLabIndex={jobStatusByLabIndex}
                availableSourceMaterials={availableSourceMaterials}
              />
            )
          })
        )}

        {!isReadOnly && (
          <Button
            variant="outline"
            onClick={addModule}
            disabled={isPending}
            className="w-full"
          >
            + Add Module
          </Button>
        )}
      </div>

      {/* Generation progress summary (post-approval) */}
      {isGenerating && Object.keys(labJobs).length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <h2 className="font-semibold text-sm">Generation Progress</h2>
            <p className="text-xs text-muted-foreground">
              {Object.values(labJobs).filter((j) => j.status === 'completed').length}{' '}
              of {Object.keys(labJobs).length} labs completed.
            </p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Cost summary + actions */}
      <div className="flex items-center justify-between gap-4 sticky bottom-0 bg-background/80 backdrop-blur py-4 border-t">
        <div className="text-sm space-y-0.5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>{planData.modules.length} modules</span>
            <span>•</span>
            <span>{totalLabs} labs</span>
            <span>•</span>
            <span>{totalConcepts} concepts</span>
          </div>
          <div className="font-semibold">
            Estimated cost:{' '}
            <span className="font-mono">{formatCents(totalCost)}</span>
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-2">
            {savedAt && (
              <span className="text-xs text-muted-foreground">
                Saved {savedAt.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={isPending || totalLabs === 0}
            >
              Approve & Generate
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve and start generation?</DialogTitle>
            <DialogDescription>
              This will create {totalLabs} lab generation job(s) and begin
              generating content. Estimated cost:{' '}
              <span className="font-mono font-semibold">
                {formatCents(totalCost)}
              </span>
              .
              <br />
              <br />
              You won't be able to edit the plan after approval.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isPending}>
              {isPending ? 'Approving...' : 'Approve & Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
