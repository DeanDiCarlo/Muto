import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireStudent } from '@/lib/auth'
import { getInstanceBySlug } from '@/lib/actions/enrollment'
import { startOrResumeReview } from '@/lib/actions/reviews'
import { createAdminClient } from '@/lib/supabase/admin'
import { ReviewRunner } from '@/components/student/review-runner'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

interface ReviewPageProps {
  params: Promise<{ instanceSlug: string; labSlug: string }>
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  await requireStudent()
  const { instanceSlug, labSlug } = await params

  const instance = await getInstanceBySlug(instanceSlug)
  if (!instance) notFound()

  const admin = createAdminClient()
  const { data: lab } = await admin
    .from('labs')
    .select('id')
    .eq('course_id', instance.course_id)
    .eq('slug', labSlug)
    .maybeSingle()

  if (!lab) notFound()

  const result = await startOrResumeReview({ instanceId: instance.id, labId: lab.id })

  if (!result.success) {
    if (result.error === 'Unauthorized' || result.error === 'Not enrolled in this course') {
      redirect('/student/courses')
    }
    notFound()
  }

  if (result.questions.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/student/courses/${instanceSlug}/labs/${labSlug}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Lab
          </Link>
        </Button>
        <p className="text-muted-foreground text-sm">
          No review questions are available for this lab yet.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/student/courses/${instanceSlug}/labs/${labSlug}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Lab
          </Link>
        </Button>
        <h1 className="mt-3 text-xl font-semibold">Knowledge Review</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Answer each question in your own words.
        </p>
      </div>

      <ReviewRunner
        sessionId={result.sessionId}
        enrollmentId={result.enrollmentId}
        instanceSlug={instanceSlug}
        labSlug={labSlug}
        questions={result.questions}
      />
    </div>
  )
}
