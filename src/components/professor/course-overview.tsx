'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { FileText, ClipboardList, Beaker, Users, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { updateCourse, type CourseOverview, type PlanStatus } from '@/lib/actions/courses'
import { NextStepCard } from './next-step-card'

/**
 * Course home composition: editable header, Next Step card, pipeline grid.
 * Client component because the title editor manages inline edit state.
 */
export function CourseOverview({ overview }: { overview: CourseOverview }) {
  const base = `/professor/courses/${overview.course.slug}`

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <CourseHeader overview={overview} />

      <NextStepCard courseSlug={overview.course.slug} overview={overview} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PipelineTile
          href={`${base}/materials`}
          icon={<FileText className="size-4" />}
          label="Materials"
          primary={`${overview.materialsCount}`}
          secondary={
            overview.parsingJobsInFlight > 0
              ? `${overview.parsingJobsInFlight} parsing`
              : overview.materialsCount === 0
              ? 'None yet'
              : 'All parsed'
          }
        />
        <PipelineTile
          href={`${base}/plan`}
          icon={<ClipboardList className="size-4" />}
          label="Plan"
          primary={planStatusLabel(overview.planStatus)}
          secondary={
            overview.planStatus === 'draft'
              ? 'Awaiting your approval'
              : overview.planStatus === 'generating'
              ? `${overview.completedLabsCount} / ${overview.labsCount} labs done`
              : overview.planStatus === 'completed'
              ? 'Generated'
              : overview.planStatus === 'approved'
              ? 'Approved — queued'
              : 'Not started'
          }
        />
        <PipelineTile
          href={`${base}/labs`}
          icon={<Beaker className="size-4" />}
          label="Labs"
          primary={`${overview.labsCount}`}
          secondary={
            overview.failedLabsCount > 0
              ? `${overview.failedLabsCount} failed`
              : overview.generatingLabsCount > 0
              ? `${overview.generatingLabsCount} generating`
              : overview.completedLabsCount > 0
              ? `${overview.completedLabsCount} complete`
              : 'None yet'
          }
        />
        <PipelineTile
          href={`${base}/instances`}
          icon={<Users className="size-4" />}
          label="Students"
          primary={`${overview.enrolledStudentCount}`}
          secondary={
            overview.activeInstancesCount > 0
              ? `${overview.activeInstancesCount} active instance${overview.activeInstancesCount === 1 ? '' : 's'}`
              : overview.instancesCount > 0
              ? 'No active instances'
              : 'No instances yet'
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline-editable course title
// ---------------------------------------------------------------------------

function CourseHeader({ overview }: { overview: CourseOverview }) {
  const { course } = overview
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(course.title)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync local input when server revalidation delivers a new course.title
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTitle(course.title) }, [course.title])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function commit() {
    const trimmed = title.trim()
    if (!trimmed || trimmed === course.title) {
      setTitle(course.title)
      setEditing(false)
      return
    }
    startTransition(async () => {
      const res = await updateCourse({ id: course.id, title: trimmed })
      if (res.success) {
        toast.success('Course renamed')
        setEditing(false)
      } else {
        toast.error(res.error)
        setTitle(course.title)
        setEditing(false)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        {editing ? (
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                setTitle(course.title)
                setEditing(false)
              }
            }}
            disabled={pending}
            className="h-10 text-2xl font-bold tracking-tight"
            aria-label="Course title"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group flex items-center gap-2 text-left"
            aria-label="Rename course"
          >
            <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
            <Pencil
              className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {course.subjectArea && (
          <Badge variant="outline" className="font-normal">
            {course.subjectArea}
          </Badge>
        )}
        {course.description && (
          <p className="text-sm text-muted-foreground">{course.description}</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pipeline tile
// ---------------------------------------------------------------------------

function PipelineTile({
  href,
  icon,
  label,
  primary,
  secondary,
}: {
  href: string
  icon: React.ReactNode
  label: string
  primary: string
  secondary: string
}) {
  return (
    <Link href={href} className="group block focus:outline-none">
      <Card className="h-full transition-colors group-hover:bg-foreground/[0.02] group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="flex h-full flex-col gap-1 p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {icon}
            {label}
          </div>
          <div className="mt-1 text-2xl font-semibold leading-tight">{primary}</div>
          <div className="text-xs text-muted-foreground">{secondary}</div>
        </CardContent>
      </Card>
    </Link>
  )
}

function planStatusLabel(s: PlanStatus | null): string {
  if (!s) return '—'
  if (s === 'draft') return 'Draft'
  if (s === 'approved') return 'Approved'
  if (s === 'generating') return 'Generating'
  return 'Completed'
}
