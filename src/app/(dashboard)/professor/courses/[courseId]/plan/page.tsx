import Link from 'next/link'
import { getPlan } from '@/lib/actions/generation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlanEditor } from '@/components/plan-review/plan-editor'

type PlanRow = {
  id: string
  course_id: string
  status: 'draft' | 'approved' | 'generating' | 'completed' | 'failed'
  plan_data: unknown
  professor_notes: string | null
  approved_at: string | null
  created_at: string
}

export default async function PlanPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const result = await getPlan(courseId)

  if (!result.success) {
    return (
      <div className="max-w-4xl">
        <p className="text-destructive">Error loading plan: {result.error}</p>
      </div>
    )
  }

  if (!result.plan) {
    return (
      <div className="max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <h1 className="text-xl font-semibold">No plan yet</h1>
            <p className="text-muted-foreground">
              Upload course materials to generate a proposed plan. Once
              materials are parsed, the AI will analyze them and propose
              modules, labs, and concepts here for your review.
            </p>
            <Button asChild>
              <Link href={`/professor/courses/${courseId}/materials`}>
                Upload Materials
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <PlanEditor plan={result.plan as PlanRow} />
    </div>
  )
}
