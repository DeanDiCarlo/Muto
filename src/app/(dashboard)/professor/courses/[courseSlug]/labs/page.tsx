import { notFound } from 'next/navigation'
import { Beaker } from 'lucide-react'
import { requireProfessor } from '@/lib/auth'
import { getCourseBySlug } from '@/lib/actions/courses'
import { listLabsForCourse, type LabListRow } from '@/lib/actions/labs'
import { PageHeader } from '@/components/shell/page-header'
import { EmptyState } from '@/components/shell/empty-state'
import { LabListItem } from '@/components/professor/lab-list-item'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'

export default async function ProfessorLabsPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>
}) {
  const { courseSlug } = await params
  await requireProfessor(`/professor/courses/${courseSlug}/labs`)

  const course = await getCourseBySlug(courseSlug)
  if (!course) notFound()

  const labs = await listLabsForCourse(course.id)

  // Group labs by module while preserving sort order (modulePosition, labPosition).
  const grouped: Array<{
    moduleId: string
    moduleTitle: string
    modulePosition: number
    labs: LabListRow[]
  }> = []
  for (const lab of labs) {
    const last = grouped[grouped.length - 1]
    if (last && last.moduleId === lab.moduleId) {
      last.labs.push(lab)
    } else {
      grouped.push({
        moduleId: lab.moduleId,
        moduleTitle: lab.moduleTitle,
        modulePosition: lab.modulePosition,
        labs: [lab],
      })
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <InjectBreadcrumbLabel segmentKey={courseSlug} value={course.title} />
      <PageHeader
        title="Labs"
        description="Generated labs grouped by module."
      />

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Beaker className="size-6" />}
          title="No labs yet"
          description="Labs appear here after your plan is approved and generation completes."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map((mod) => (
            <section key={mod.moduleId} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {mod.moduleTitle}
              </h2>
              <div className="space-y-2">
                {mod.labs.map((lab) => (
                  <LabListItem key={lab.id} courseSlug={courseSlug} lab={lab} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
