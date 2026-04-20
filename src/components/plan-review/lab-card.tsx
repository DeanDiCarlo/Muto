'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ConceptTag } from './concept-tag'
import { SourcePicker } from './source-picker'
import { cn } from '@/lib/utils'
import type { PlanLab, BloomsLevel } from '@muto/shared/generation'

const ALL_BLOOMS: BloomsLevel[] = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
]

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export type LabJobStatus = {
  status: string
  progressPercent: number
  currentStep: string | null
  errorMessage: string | null
}

export function LabCard({
  lab,
  labIndex,
  onUpdate,
  onRemove,
  disabled = false,
  jobStatus = null,
  availableSourceMaterials = [],
}: {
  lab: PlanLab
  labIndex: number
  onUpdate: (next: PlanLab) => void
  onRemove: () => void
  disabled?: boolean
  jobStatus?: LabJobStatus | null
  availableSourceMaterials?: Array<{ id: string; file_name: string; file_type: string }>
}) {
  const [newConcept, setNewConcept] = useState('')

  function toggleBloom(level: BloomsLevel) {
    const has = lab.blooms_levels.includes(level)
    const next = has
      ? lab.blooms_levels.filter((b) => b !== level)
      : [...lab.blooms_levels, level]
    onUpdate({ ...lab, blooms_levels: next })
  }

  function addConcept() {
    const trimmed = newConcept.trim()
    if (!trimmed) return
    onUpdate({ ...lab, proposed_concepts: [...lab.proposed_concepts, trimmed] })
    setNewConcept('')
  }

  function renameConcept(idx: number, newName: string) {
    const next = lab.proposed_concepts.map((c, i) => (i === idx ? newName : c))
    onUpdate({ ...lab, proposed_concepts: next })
  }

  function removeConcept(idx: number) {
    const next = lab.proposed_concepts.filter((_, i) => i !== idx)
    onUpdate({ ...lab, proposed_concepts: next })
  }

  return (
    <Card className="border-l-4 border-l-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            Lab {labIndex + 1}
          </span>
          <Input
            value={lab.title}
            onChange={(e) => onUpdate({ ...lab, title: e.target.value })}
            disabled={disabled}
            className="font-medium"
            placeholder="Lab title"
          />
          {!disabled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              Remove
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Concepts */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Concepts ({lab.proposed_concepts.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lab.proposed_concepts.map((concept, idx) => (
              <ConceptTag
                key={`${idx}-${concept}`}
                name={concept}
                onRename={(newName) => renameConcept(idx, newName)}
                onRemove={() => removeConcept(idx)}
                disabled={disabled}
              />
            ))}
            {lab.proposed_concepts.length === 0 && (
              <span className="text-xs text-muted-foreground italic">
                No concepts yet
              </span>
            )}
          </div>
          {!disabled && (
            <div className="flex gap-1 mt-2">
              <Input
                value={newConcept}
                onChange={(e) => setNewConcept(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addConcept()
                  }
                }}
                placeholder="Add concept..."
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addConcept}
                disabled={!newConcept.trim()}
                className="h-8"
              >
                Add
              </Button>
            </div>
          )}
        </div>

        {/* Bloom's levels */}
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Bloom&apos;s Levels
          </span>
          <div className="flex flex-wrap gap-1">
            {ALL_BLOOMS.map((level) => {
              const active = lab.blooms_levels.includes(level)
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => !disabled && toggleBloom(level)}
                  disabled={disabled}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded border transition-colors capitalize',
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50',
                    disabled && 'cursor-not-allowed opacity-60'
                  )}
                >
                  {level}
                </button>
              )
            })}
          </div>
        </div>

        {/* Source materials */}
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">
            Sources ({lab.source_material_ids.length})
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {lab.source_material_ids.map((id) => {
              const mat = availableSourceMaterials.find((m) => m.id === id)
              const label = mat?.file_name ?? id.slice(0, 8) + '…'
              return (
                <Badge key={id} variant="secondary" className="font-normal gap-1 max-w-[240px]">
                  <span className="truncate">{label}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onUpdate({ ...lab, source_material_ids: lab.source_material_ids.filter((x) => x !== id) })}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Detach ${label}`}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </Badge>
              )
            })}
            {!disabled && (
              <SourcePicker
                availableMaterials={availableSourceMaterials}
                selectedIds={lab.source_material_ids}
                onChange={(next) => onUpdate({ ...lab, source_material_ids: next })}
              />
            )}
            {lab.source_material_ids.length === 0 && disabled && (
              <span className="text-xs text-muted-foreground italic">No sources attached</span>
            )}
          </div>
        </div>

        {/* Footer: questions count + cost */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-3">
            <span>{lab.estimated_questions} questions</span>
          </div>
          <Badge variant="outline" className="font-mono">
            {formatCents(lab.estimated_cost_cents)}
          </Badge>
        </div>

        {/* Job status (post-approval) */}
        {jobStatus && (
          <div className="pt-2 border-t space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium capitalize">
                {jobStatus.status === 'running'
                  ? 'Generating...'
                  : jobStatus.status === 'completed'
                    ? 'Generated'
                    : jobStatus.status === 'failed'
                      ? 'Failed'
                      : jobStatus.status}
              </span>
              {jobStatus.status === 'running' && (
                <span className="text-muted-foreground">
                  {jobStatus.progressPercent}%
                </span>
              )}
            </div>
            {jobStatus.status === 'running' && (
              <Progress value={jobStatus.progressPercent} className="h-1.5" />
            )}
            {jobStatus.currentStep && jobStatus.status === 'running' && (
              <p className="text-xs text-muted-foreground">
                {jobStatus.currentStep}
              </p>
            )}
            {jobStatus.status === 'failed' && jobStatus.errorMessage && (
              <p className="text-xs text-destructive">{jobStatus.errorMessage}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
