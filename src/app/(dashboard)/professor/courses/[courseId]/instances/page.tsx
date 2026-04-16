import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { requireProfessor } from '@/lib/auth'
import { getCourse } from '@/lib/actions/courses'
import { listInstances } from '@/lib/actions/instances'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'
import { PageHeader } from '@/components/shell/page-header'
import { EmptyState } from '@/components/shell/empty-state'
import { Button } from '@/components/ui/button'
import { InstanceCreateDialog } from '@/components/professor/instance-create-dialog'
import { InstanceCard } from '@/components/professor/instance-card'

export default async function CourseInstancesPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  await requireProfessor(`/professor/courses/${courseId}/instances`)

  const [course, instances] = await Promise.all([
    getCourse(courseId),
    listInstances(courseId),
  ])

  if (!course) notFound()

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={courseId} value={course.title} />
      <PageHeader
        title="Instances"
        description="A course instance is one semester's offering."
        actions={
          <InstanceCreateDialog courseId={courseId}>
            <Button>New instance</Button>
          </InstanceCreateDialog>
        }
      />

      {instances.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No instances yet"
          description="Create one to get a join code your students can use."
          action={
            <InstanceCreateDialog courseId={courseId}>
              <Button>New instance</Button>
            </InstanceCreateDialog>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instances.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} />
          ))}
        </div>
      )}
    </>
  )
}
