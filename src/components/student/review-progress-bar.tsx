'use client'

import { Progress } from '@/components/ui/progress'

interface ReviewProgressBarProps {
  current: number // 1-based
  total: number
}

export function ReviewProgressBar({ current, total }: ReviewProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Question {current} of {total}</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-2" />
    </div>
  )
}
