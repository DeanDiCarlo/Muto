import { notFound } from 'next/navigation'
import { requireStudent } from '@/lib/auth'
import { getInstanceBySlug, getStudentCourseView } from '@/lib/actions/enrollment'
import { PageHeader } from '@/components/shell/page-header'
import { EmptyState } from '@/components/shell/empty-state'
import { CourseTree } from '@/components/student/course-tree'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'
import { Badge } from '@/components/ui/badge'
import { Layers } from 'lucide-react'

export default async function StudentCourseHomePage({
  params,
}: {
  params: Promise<{ instanceSlug: string }>
}) {
  const { instanceSlug } = await params
  await requireStudent(`/student/courses/${instanceSlug}`)

  const instance = await getInstanceBySlug(instanceSlug)
  if (!instance) notFound()

  const result = await getStudentCourseView(instance.id)
  if (!result.success) notFound()

  const { course, modules } = result

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={instanceSlug} value={course.title} />

      <PageHeader
        title={course.title}
        description={result.instance.semester}
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
        <CourseTree modules={modules} instanceSlug={instanceSlug} />
      )}
    </>
  )
}
