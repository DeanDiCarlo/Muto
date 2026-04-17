'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  submitReviewResponse,
  completeReview,
  getReviewResults,
} from '@/lib/actions/reviews'
import { ReviewProgressBar } from '@/components/student/review-progress-bar'
import { ReviewQuestionCard } from '@/components/student/review-question-card'
import { ReviewCompletionCard } from '@/components/student/review-completion-card'
import { ReviewResultsCard, type Evaluation } from '@/components/student/review-results-card'

interface Question {
  id: string
  question_text: string
  blooms_level: string
  position: number
  answered_text: string | null
}

interface ReviewRunnerProps {
  sessionId: string
  enrollmentId: string
  instanceId: string
  labId: string
  questions: Question[]
}

type Phase = 'taking' | 'completing' | 'results'

export function ReviewRunner({
  sessionId,
  enrollmentId,
  instanceId,
  labId,
  questions,
}: ReviewRunnerProps) {
  // Resume from first unanswered question
  const firstUnansweredIdx = Math.max(
    0,
    questions.findIndex((q) => !q.answered_text)
  )
  const allAnswered = questions.every((q) => q.answered_text)

  const [phase, setPhase] = useState<Phase>(allAnswered ? 'completing' : 'taking')
  const [currentIndex, setCurrentIndex] = useState(
    allAnswered ? questions.length - 1 : firstUnansweredIdx
  )
  const [submitting, setSubmitting] = useState(false)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [evalLoading, setEvalLoading] = useState(false)
  const completeOnResumeRef = useRef(false)

  // On mount: if all questions were already answered (resumed session), enqueue evaluation
  useEffect(() => {
    if (!allAnswered || completeOnResumeRef.current) return
    completeOnResumeRef.current = true
    completeReview({ sessionId }).then((result) => {
      if (!result.success) {
        toast.error('Failed to queue evaluation. Please try again.')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally mount-only — props don't change

  // Fetch results and update state
  const fetchResults = useCallback(async () => {
    const result = await getReviewResults({ sessionId })
    if (result.success && result.evaluations.length > 0) {
      setEvaluations(result.evaluations)
      setPhase('results')
      setEvalLoading(false)
      return true
    }
    return false
  }, [sessionId])

  // After completing, subscribe to concept_evaluations via Realtime + poll fallback
  useEffect(() => {
    if (phase !== 'completing') return

    setEvalLoading(true)

    const supabase = createClient()
    const channel = supabase
      .channel(`concept_evals:enrollment:${enrollmentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'concept_evaluations',
          filter: `enrollment_id=eq.${enrollmentId}`,
        },
        () => {
          // Fetch full formatted results when any evaluation row arrives
          fetchResults()
        }
      )
      .subscribe()

    // Polling fallback: if no results after 60s, poll every 5s for 60s
    let pollCount = 0
    const pollInterval = setInterval(async () => {
      pollCount++
      const found = await fetchResults()
      if (found || pollCount >= 12) {
        clearInterval(pollInterval)
        if (!found) setEvalLoading(false)
      }
    }, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [phase, enrollmentId, fetchResults])

  async function handleSubmit(questionId: string, answerText: string) {
    setSubmitting(true)

    // Optimistic advance
    const prevIndex = currentIndex
    const isLast = currentIndex >= questions.length - 1

    if (!isLast) {
      setCurrentIndex((i) => i + 1)
    }

    const result = await submitReviewResponse({ sessionId, questionId, answerText })

    if (!result.success) {
      // Revert on error
      setCurrentIndex(prevIndex)
      setSubmitting(false)
      toast.error(result.error ?? 'Failed to submit answer. Please try again.')
      return
    }

    setSubmitting(false)

    if (isLast) {
      // Complete the review
      const completeResult = await completeReview({ sessionId })
      if (!completeResult.success) {
        toast.error('Failed to submit review. Please try again.')
        return
      }
      setPhase('completing')
    }
  }

  if (phase === 'taking') {
    const question = questions[currentIndex]
    return (
      <div className="space-y-8 max-w-2xl mx-auto">
        <ReviewProgressBar current={currentIndex + 1} total={questions.length} />
        <ReviewQuestionCard
          key={question.id}
          questionId={question.id}
          questionText={question.question_text}
          bloomsLevel={question.blooms_level}
          initialAnswer={question.answered_text}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <ReviewCompletionCard instanceId={instanceId} labId={labId} />
      <ReviewResultsCard
        evaluations={evaluations}
        totalQuestions={questions.length}
        isLoading={evalLoading}
      />
    </div>
  )
}
