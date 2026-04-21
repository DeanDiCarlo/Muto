import Link from 'next/link'
import { ArrowRight, Upload, FileSearch, ClipboardList, Cog, Users, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { CourseOverview } from '@/lib/actions/courses'

/**
 * The Next Step card — one CTA that tells the professor what to do next.
 * Decision tree (priority order, first match wins):
 *   1. materialsCount === 0 → Upload materials
 *   2. parsingJobsInFlight > 0 → Parsing progress (no link)
 *   3. planStatus === null (materials parsed, no plan) → Plan being proposed
 *   4. planStatus === 'draft' → Review & approve plan
 *   5. planStatus === 'generating' → Generating N labs
 *   6. labsCount > 0 && activeInstancesCount === 0 → Create instance
 *   7. Else → Live, show join code
 */
export function NextStepCard({
  courseSlug,
  overview,
}: {
  courseSlug: string
  overview: CourseOverview
}) {
  const base = `/professor/courses/${courseSlug}`
  const step = deriveStep(overview)

  return (
    <Card className="border-primary/40 bg-primary/[0.02]">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-hidden
          >
            {step.icon}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Next step
            </p>
            <h2 className="text-base font-semibold leading-snug">{step.title}</h2>
            {step.description && (
              <p className="text-sm text-muted-foreground">{step.description}</p>
            )}
          </div>
        </div>

        {step.cta && (
          <Button asChild size="sm" className="shrink-0">
            <Link href={`${base}${step.cta.href}`}>
              {step.cta.label}
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

type Step = {
  icon: React.ReactNode
  title: string
  description?: string
  cta?: { label: string; href: string }
}

function deriveStep(o: CourseOverview): Step {
  // 1. No materials
  if (o.materialsCount === 0) {
    return {
      icon: <Upload className="size-5" />,
      title: 'Upload course materials to begin',
      description: 'Drop in a syllabus, textbook, or lecture notes — the pipeline does the rest.',
      cta: { label: 'Upload materials', href: '/materials' },
    }
  }

  // 2. Materials still parsing
  if (o.parsingJobsInFlight > 0) {
    const parsed = Math.max(0, o.materialsCount - o.parsingJobsInFlight)
    return {
      icon: <FileSearch className="size-5 animate-pulse" />,
      title: `Parsing ${parsed} of ${o.materialsCount} materials…`,
      description: 'We extract structure + concepts before proposing a plan.',
    }
  }

  // 3. Materials parsed, no plan yet
  if (o.planStatus === null) {
    return {
      icon: <ClipboardList className="size-5 animate-pulse" />,
      title: 'Plan being proposed…',
      description:
        "Once ready, you'll review modules and labs before any generation runs.",
    }
  }

  // 4. Plan in draft
  if (o.planStatus === 'draft') {
    return {
      icon: <ClipboardList className="size-5" />,
      title: 'Review and approve your generation plan',
      description: 'Edit modules and labs, attach materials, then approve to start generating.',
      cta: { label: 'Open plan', href: '/plan' },
    }
  }

  // 5. Plan generating
  if (o.planStatus === 'generating') {
    const done = o.completedLabsCount
    const total = o.labsCount
    return {
      icon: <Cog className="size-5 animate-spin-slow" />,
      title: `Generating ${total} labs (${done} of ${total} complete)`,
      description: 'This runs in the background — you can leave and come back.',
      cta: { label: 'View labs', href: '/labs' },
    }
  }

  // 6. Labs ready, no active instance
  if (o.labsCount > 0 && o.activeInstancesCount === 0) {
    return {
      icon: <Users className="size-5" />,
      title: 'Create a course instance to share with students',
      description: 'A course instance has its own join code. One per semester.',
      cta: { label: 'New instance', href: '/instances' },
    }
  }

  // 7. Live
  const joinHint = o.topActiveInstance
    ? `Share join code: ${o.topActiveInstance.joinCode}`
    : 'Share your join code with students.'
  return {
    icon: <CheckCircle2 className="size-5 text-emerald-600" />,
    title: 'Course is live.',
    description: joinHint,
    cta: { label: 'Manage instances', href: '/instances' },
  }
}
