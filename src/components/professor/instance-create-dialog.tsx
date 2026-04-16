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
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = semester.trim()
    if (!trimmed) {
      toast.error('Semester is required')
      return
    }

    startTransition(async () => {
      const result = await createInstance({
        courseId,
        semester: trimmed,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Instance for ${result.instance.semester} created`)
      setSemester('')
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
              onChange={(e) => setSemester(e.target.value)}
              required
              maxLength={100}
              autoFocus
              disabled={isPending}
            />
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
