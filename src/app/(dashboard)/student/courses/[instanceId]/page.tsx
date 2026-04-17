import { notFound } from 'next/navigation'
import { requireStudent } from '@/lib/auth'
import { getStudentCourseView } from '@/lib/actions/enrollment'
import { PageHeader } from '@/components/shell/page-header'
import { EmptyState } from '@/components/shell/empty-state'
import { CourseTree } from '@/components/student/course-tree'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'
import { Badge } from '@/components/ui/badge'
import { Layers } from 'lucide-react'

export default async function StudentCourseHomePage({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const { instanceId } = await params
  await requireStudent(`/student/courses/${instanceId}`)

  const result = await getStudentCourseView(instanceId)
  if (!result.success) notFound()

  const { course, instance, modules } = result

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={instanceId} value={course.title} />

      <PageHeader
        title={course.title}
        description={instance.semester}
        actions={
          course.subjectArea ? (
            <Badge variant="secondary">
              {course.subjectArea.replace(/_/g, ' ')}
            </Badge>
          ) : undefined
        }
      />

      {modules.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-10 w-10" />}
          title="No modules yet"
          description="Your professor hasn't added any modules to this course yet. Check back soon!"
        />
      ) : (
        <CourseTree modules={modules} instanceId={instanceId} />
      )}
    </>
  )
}
