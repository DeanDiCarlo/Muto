'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'

const BLOOMS_LABELS: Record<string, string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
}

interface ReviewQuestionCardProps {
  questionId: string
  questionText: string
  bloomsLevel: string
  initialAnswer?: string | null
  onSubmit: (questionId: string, answerText: string) => Promise<void>
  submitting: boolean
}

export function ReviewQuestionCard({
  questionId,
  questionText,
  bloomsLevel,
  initialAnswer,
  onSubmit,
  submitting,
}: ReviewQuestionCardProps) {
  const [answer, setAnswer] = useState(initialAnswer ?? '')

  const canSubmit = answer.trim().length > 0 && !submitting

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Badge variant="secondary" className="text-xs font-normal">
          {BLOOMS_LABELS[bloomsLevel] ?? bloomsLevel}
        </Badge>
        <p className="text-base font-medium leading-relaxed">{questionText}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`answer-${questionId}`} className="sr-only">
          Your answer
        </Label>
        <Textarea
          id={`answer-${questionId}`}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer here…"
          rows={6}
          disabled={submitting}
          className="resize-none"
        />
      </div>
      <Button
        onClick={() => onSubmit(questionId, answer)}
        disabled={!canSubmit}
        className="w-full sm:w-auto"
      >
        {submitting ? 'Submitting…' : 'Submit Answer'}
      </Button>
    </div>
  )
}
