import { getMaterials } from '@/lib/actions/materials'
import { MaterialUpload } from '@/components/material-upload'
import { MaterialList } from '@/components/material-list'

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params

  const result = await getMaterials(courseId)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Course Materials</h1>
        <p className="text-muted-foreground mt-1">
          Upload PDFs, documents, or images to generate interactive labs.
        </p>
      </div>

      <MaterialUpload courseId={courseId} />

      {result.success ? (
        <MaterialList courseId={courseId} initialMaterials={result.materials} />
      ) : (
        <p className="text-destructive">Error loading materials: {result.error}</p>
      )}
    </div>
  )
}
