'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

type MasteryBucket = 'on_track' | 'review_needed'

interface Evaluation {
  id: string
  concept_name: string
  blooms_level: string
  reasoning: string
  mastery_bucket: MasteryBucket
  question_text: string
  answer_text: string
}

interface ReviewResultsCardProps {
  evaluations: Evaluation[]
  totalQuestions: number
  isLoading: boolean
}

const BUCKET_CONFIG: Record<MasteryBucket, { label: string; icon: typeof CheckCircle; className: string }> = {
  on_track: { label: 'On track', icon: CheckCircle, className: 'text-green-600' },
  review_needed: { label: 'Review this concept', icon: AlertCircle, className: 'text-amber-600' },
}

export function ReviewResultsCard({ evaluations, totalQuestions, isLoading }: ReviewResultsCardProps) {
  if (isLoading && evaluations.length === 0) {
    return (
      <div className="flex items-center gap-3 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Evaluating your answers…</span>
      </div>
    )
  }

  if (evaluations.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Feedback</h3>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            More results loading…
          </span>
        )}
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            {evaluations.length} of {totalQuestions} evaluated
          </span>
        )}
      </div>

      <div className="space-y-3">
        {evaluations.map((ev) => {
          const { label, icon: Icon, className } = BUCKET_CONFIG[ev.mastery_bucket]
          return (
            <div key={ev.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-snug">{ev.question_text}</p>
                <div className={`flex items-center gap-1 shrink-0 text-xs font-medium ${className}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
              </div>

              <div className="rounded bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground mb-0.5">Your answer</p>
                <p className="text-sm leading-relaxed">{ev.answer_text}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {ev.concept_name}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{ev.reasoning}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export type { Evaluation }
