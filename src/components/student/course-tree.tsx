'use client'

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { LabRow } from './lab-row'

type LabInfo = {
  id: string
  title: string
  position: number
  generationStatus: string
  hasStarted: boolean
}

type ModuleInfo = {
  id: string
  title: string
  position: number
  labs: LabInfo[]
}

export function CourseTree({
  modules,
  instanceId,
}: {
  modules: ModuleInfo[]
  instanceId: string
}) {
  // Default open all modules
  const defaultValue = modules.map((m) => m.id)

  return (
    <Accordion type="multiple" defaultValue={defaultValue} className="space-y-3">
      {modules.map((mod) => (
        <AccordionItem key={mod.id} value={mod.id} className="border rounded-lg px-4">
          <AccordionTrigger className="text-base font-semibold py-3">
            <span className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">
                Module {mod.position + 1}
              </span>
              {mod.title}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 pb-4">
            {mod.labs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No labs in this module yet.
              </p>
            ) : (
              mod.labs.map((lab) => (
                <LabRow key={lab.id} lab={lab} instanceId={instanceId} />
              ))
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
