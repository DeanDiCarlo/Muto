import { getMaterials } from '@/lib/actions/materials'
import { getCourseOverview } from '@/lib/actions/courses'
import { MaterialUpload } from '@/components/material-upload'
import { MaterialList } from '@/components/material-list'
import { PageHeader } from '@/components/shell/page-header'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params

  const [result, overview] = await Promise.all([
    getMaterials(courseId),
    getCourseOverview(courseId),
  ])

  const allParsed =
    result.success &&
    result.materials.length > 0 &&
    result.materials.every((m) => m.parseJob?.status === 'completed')

  return (
    <div className="max-w-4xl space-y-6">
      <InjectBreadcrumbLabel segmentKey={courseId} value={overview?.course.title} />
      <PageHeader
        title="Course Materials"
        description="Uploads used by the generation pipeline."
      />

      <MaterialUpload courseId={courseId} />

      {result.success ? (
        <MaterialList
          courseId={courseId}
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
