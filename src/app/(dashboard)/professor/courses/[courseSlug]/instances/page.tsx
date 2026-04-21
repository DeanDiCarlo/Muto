import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { requireProfessor } from '@/lib/auth'
import { getCourseBySlug } from '@/lib/actions/courses'
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
  params: Promise<{ courseSlug: string }>
}) {
  const { courseSlug } = await params
  await requireProfessor(`/professor/courses/${courseSlug}/instances`)

  const course = await getCourseBySlug(courseSlug)
  if (!course) notFound()

  const instances = await listInstances(course.id)

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={courseSlug} value={course.title} />
      <PageHeader
        title="Instances"
        description="A course instance is one semester's offering."
        actions={
          <InstanceCreateDialog courseId={course.id}>
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
            <InstanceCreateDialog courseId={course.id}>
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
