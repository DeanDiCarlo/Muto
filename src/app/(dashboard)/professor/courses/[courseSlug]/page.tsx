import { notFound } from 'next/navigation'
import { requireProfessor } from '@/lib/auth'
import { getCourseBySlug, getCourseOverview } from '@/lib/actions/courses'
import { CourseOverview } from '@/components/professor/course-overview'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'

export default async function ProfessorCourseHomePage({
  params,
}: {
  params: Promise<{ courseSlug: string }>
}) {
  const { courseSlug } = await params
  await requireProfessor(`/professor/courses/${courseSlug}`)

  const course = await getCourseBySlug(courseSlug)
  if (!course) notFound()

  const overview = await getCourseOverview(course.id)
  if (!overview) notFound()

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={courseSlug} value={overview.course.title} />
      <CourseOverview overview={overview} />
    </>
  )
}
