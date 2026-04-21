'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createCourse } from '@/lib/actions/courses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function CourseCreateForm() {
  const [state, formAction, isPending] = useActionState(createCourse, undefined)
  const [slugDraft, setSlugDraft] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  useEffect(() => {
    if (state?.error) toast.error(state.error)
  }, [state])

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugEdited) {
      setSlugDraft(slugify(e.target.value))
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true)
    setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

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
          onChange={handleTitleChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="displaySlug">Course URL slug</Label>
        <Input
          id="displaySlug"
          name="displaySlug"
          maxLength={80}
          placeholder="intro-quantum-computing"
          value={slugDraft}
          onChange={handleSlugChange}
          disabled={isPending}
        />
        {slugDraft && (
          <p className="text-xs text-muted-foreground">
            URL: /professor/courses/<span className="font-medium text-foreground">{slugDraft}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers, and hyphens only. Unique within your institution.
        </p>
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
