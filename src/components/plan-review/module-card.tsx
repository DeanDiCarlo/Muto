'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { LabCard, type LabJobStatus } from './lab-card'
import type { PlanModule, PlanLab } from '@/types/generation'

const DEFAULT_NEW_LAB: Omit<PlanLab, 'title'> = {
  source_material_ids: [],
  proposed_concepts: [],
  estimated_questions: 5,
  blooms_levels: ['remember', 'understand'],
  estimated_cost_cents: 45,
}

export function ModuleCard({
  module,
  moduleIndex,
  onUpdate,
  onRemove,
  disabled = false,
  jobStatusByLabIndex = {},
  availableSourceMaterials = [],
}: {
  module: PlanModule
  moduleIndex: number
  onUpdate: (next: PlanModule) => void
  onRemove: () => void
  disabled?: boolean
  jobStatusByLabIndex?: Record<number, LabJobStatus | undefined>
  availableSourceMaterials?: Array<{ id: string; file_name: string; file_type: string }>
}) {
  function updateLab(labIdx: number, next: PlanLab) {
    const labs = module.labs.map((l, i) => (i === labIdx ? next : l))
    onUpdate({ ...module, labs })
  }

  function removeLab(labIdx: number) {
    onUpdate({ ...module, labs: module.labs.filter((_, i) => i !== labIdx) })
  }

  function addLab() {
    const newLab: PlanLab = {
      title: `New Lab ${module.labs.length + 1}`,
      ...DEFAULT_NEW_LAB,
    }
    onUpdate({ ...module, labs: [...module.labs, newLab] })
  }

  const moduleCost = module.labs.reduce(
    (sum, l) => sum + l.estimated_cost_cents,
    0
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            Module {moduleIndex + 1}
          </span>
          <Input
            value={module.title}
            onChange={(e) => onUpdate({ ...module, title: e.target.value })}
            disabled={disabled}
            className="font-semibold text-base"
            placeholder="Module title"
          />
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            ${(moduleCost / 100).toFixed(2)}
          </span>
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
      <CardContent className="pt-0">
        <Accordion type="single" collapsible defaultValue="labs">
          <AccordionItem value="labs" className="border-b-0">
            <AccordionTrigger className="text-sm py-2">
              {module.labs.length} {module.labs.length === 1 ? 'lab' : 'labs'}
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              {module.labs.map((lab, labIdx) => (
                <LabCard
                  key={labIdx}
                  lab={lab}
                  labIndex={labIdx}
                  onUpdate={(next) => updateLab(labIdx, next)}
                  onRemove={() => removeLab(labIdx)}
                  disabled={disabled}
                  jobStatus={jobStatusByLabIndex[labIdx] ?? null}
                  availableSourceMaterials={availableSourceMaterials}
                />
              ))}
              {module.labs.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-4">
                  No labs in this module yet.
                </p>
              )}
              {!disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLab}
                  className="w-full"
                >
                  + Add Lab
                </Button>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
