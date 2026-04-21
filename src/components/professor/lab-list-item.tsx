import Link from 'next/link'
import { ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LabListRow } from '@/lib/actions/labs'

/**
 * Row in the professor's lab list. Links to the lab detail page.
 * Plain server component — no interactivity needed.
 */
export function LabListItem({
  courseSlug,
  lab,
}: {
  courseSlug: string
  lab: LabListRow
}) {
  return (
    <Link
      href={`/professor/courses/${courseSlug}/labs/${lab.slug}`}
      className="group block focus:outline-none"
    >
      <Card
        size="sm"
        className="transition-colors group-hover:bg-foreground/[0.02] group-focus-visible:ring-2 group-focus-visible:ring-ring"
      >
        <CardContent className="flex items-center gap-3 p-3">
          <Badge variant="outline" className="font-mono tabular-nums">
            {lab.position + 1}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{lab.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {lab.conceptCount} concept{lab.conceptCount === 1 ? '' : 's'}
            </div>
          </div>
          <LabStatusBadge status={lab.generationStatus} />
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </CardContent>
      </Card>
    </Link>
  )
}

export function LabStatusBadge({
  status,
}: {
  status: 'pending' | 'generating' | 'complete' | 'failed'
}) {
  if (status === 'pending') {
    return <Badge variant="secondary">Pending</Badge>
  }
  if (status === 'generating') {
    return (
      <Badge variant="default">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Generating
      </Badge>
    )
  }
  if (status === 'complete') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        Complete
      </Badge>
    )
  }
  return <Badge variant="destructive">Failed</Badge>
}
