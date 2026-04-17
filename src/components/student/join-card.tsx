'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { joinCourse } from '@/lib/actions/enrollment'

export function JoinCard({
  courseTitle,
  semester,
  joinCode,
}: {
  courseTitle: string
  semester: string
  joinCode: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleJoin() {
    setError(null)
    startTransition(async () => {
      const result = await joinCourse(joinCode)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/student/courses/${result.instanceId}`)
    })
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <h1 className="text-xl font-semibold">{courseTitle}</h1>
        <p className="text-sm text-muted-foreground">{semester}</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          You&apos;re about to join this course. Once enrolled, you&apos;ll have
          access to all labs and knowledge reviews.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        {error && (
          <p className="text-sm text-destructive w-full">{error}</p>
        )}
        <Button
          onClick={handleJoin}
          disabled={isPending}
          className="w-full"
        >
          {isPending ? 'Joining…' : 'Join this class'}
        </Button>
      </CardFooter>
    </Card>
  )
}
