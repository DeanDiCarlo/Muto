'use client'

import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { createCourse } from '@/lib/actions/courses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function CourseCreateForm() {
  const [state, formAction, isPending] = useActionState(createCourse, undefined)

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Course title</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={200}
          placeholder="Introduction to Quantum Computing"
          autoFocus
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="subjectArea">Subject area</Label>
        <Input
          id="subjectArea"
          name="subjectArea"
          maxLength={100}
          placeholder="quantum_computing"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          A short tag that guides the generation pipeline. Optional.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          maxLength={1000}
          placeholder="What this course covers and who it's for."
          disabled={isPending}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create course'}
        </Button>
      </div>
    </form>
  )
}
