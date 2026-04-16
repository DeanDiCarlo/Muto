import { notFound } from 'next/navigation'
import { requireProfessor } from '@/lib/auth'
import { getCourseOverview } from '@/lib/actions/courses'
import { CourseOverview } from '@/components/professor/course-overview'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'

export default async function ProfessorCourseHomePage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  await requireProfessor(`/professor/courses/${courseId}`)

  const overview = await getCourseOverview(courseId)
  if (!overview) notFound()

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={courseId} value={overview.course.title} />
      <CourseOverview overview={overview} />
    </>
  )
}
