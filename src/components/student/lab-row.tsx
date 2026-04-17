import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { ChevronRight } from 'lucide-react'

export function LabRow({
  lab,
  instanceId,
}: {
  lab: {
    id: string
    title: string
    generationStatus: string
    hasStarted: boolean
  }
  instanceId: string
}) {
  const isReady = lab.generationStatus === 'complete'

  return (
    <Link
      href={isReady ? `/student/courses/${instanceId}/labs/${lab.id}` : '#'}
      aria-disabled={!isReady}
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
        isReady
          ? 'hover:bg-muted/50 cursor-pointer'
          : 'opacity-50 pointer-events-none'
      }`}
    >
      <span className="font-medium truncate">{lab.title}</span>
      <div className="flex items-center gap-2 shrink-0">
        {lab.hasStarted && (
          <Badge variant="secondary" className="text-xs">
            Started
          </Badge>
        )}
        {!isReady && (
          <Badge variant="outline" className="text-xs">
            {lab.generationStatus === 'generating' ? 'Generating…' : 'Pending'}
          </Badge>
        )}
        {isReady && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
    </Link>
  )
}
