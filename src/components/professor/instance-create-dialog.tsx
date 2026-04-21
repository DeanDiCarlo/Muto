'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createInstance } from '@/lib/actions/instances'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Dialog wrapper that opens a "New instance" form. The caller supplies the
 * trigger button via `children`, so this component is reusable from a page
 * header or an empty state without duplicating button styles.
 */
export function InstanceCreateDialog({
  courseId,
  children,
}: {
  courseId: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [semester, setSemester] = useState('')
  const [slugDraft, setSlugDraft] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSemesterChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setSemester(value)
    if (!slugEdited) {
      setSlugDraft(slugify(value))
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugEdited(true)
    setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmedSemester = semester.trim()
    if (!trimmedSemester) {
      toast.error('Semester is required')
      return
    }
    if (!slugDraft || slugDraft.length < 2) {
      toast.error('Section slug must be at least 2 characters')
      return
    }

    startTransition(async () => {
      const result = await createInstance({
        courseId,
        semester: trimmedSemester,
        displaySlug: slugDraft,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Instance for ${result.instance.semester} created`)
      setSemester('')
      setSlugDraft('')
      setSlugEdited(false)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New course instance</DialogTitle>
          <DialogDescription>
            A join code will be generated for students to enroll.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="semester">Semester</Label>
            <Input
              id="semester"
              name="semester"
              placeholder="Spring 2026"
              value={semester}
              onChange={handleSemesterChange}
              required
              maxLength={100}
              autoFocus
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instanceSlug">Section slug</Label>
            <Input
              id="instanceSlug"
              name="instanceSlug"
              placeholder="e.g. s26-section-ac"
              value={slugDraft}
              onChange={handleSlugChange}
              required
              maxLength={80}
              disabled={isPending}
            />
            {slugDraft && (
              <p className="text-xs text-muted-foreground">
                Student URL: /student/courses/<span className="font-medium text-foreground">{slugDraft}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              This appears in the student-facing course URL. Lowercase letters, numbers, and hyphens only. Unique within your institution.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create instance'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
