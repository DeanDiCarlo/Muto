import { notFound } from 'next/navigation'
import { getMaterials } from '@/lib/actions/materials'
import { getCourseBySlug, getCourseOverview } from '@/lib/actions/courses'
import { MaterialUpload } from '@/components/material-upload'
import { MaterialList } from '@/components/material-list'
import { PageHeader } from '@/components/shell/page-header'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>
}) {
  const { courseSlug } = await params

  const course = await getCourseBySlug(courseSlug)
  if (!course) notFound()

  const [result, overview] = await Promise.all([
    getMaterials(course.id),
    getCourseOverview(course.id),
  ])

  const allParsed =
    result.success &&
    result.materials.length > 0 &&
    result.materials.every((m) => m.parseJob?.status === 'completed')

  return (
    <div className="max-w-4xl space-y-6">
      <InjectBreadcrumbLabel segmentKey={courseSlug} value={overview?.course.title} />
      <PageHeader
        title="Course Materials"
        description="Uploads used by the generation pipeline."
      />

      <MaterialUpload courseId={course.id} />

      {result.success ? (
        <MaterialList
          courseId={course.id}
          courseSlug={courseSlug}
          initialMaterials={result.materials}
          planStatus={overview?.planStatus ?? null}
          allParsed={allParsed}
        />
      ) : (
        <p className="text-destructive">Error loading materials: {result.error}</p>
      )}
    </div>
  )
}
