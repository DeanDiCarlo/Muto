'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'

interface ReviewCompletionCardProps {
  instanceId: string
  labId: string
}

export function ReviewCompletionCard({ instanceId, labId }: ReviewCompletionCardProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <CheckCircle className="h-14 w-14 text-primary" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Review submitted!</h2>
        <p className="text-muted-foreground max-w-sm">
          Your answers are being evaluated. Qualitative feedback will appear below as it becomes
          ready.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href={`/student/courses/${instanceId}/labs/${labId}`}>Back to Lab</Link>
      </Button>
    </div>
  )
}
