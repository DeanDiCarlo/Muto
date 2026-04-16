'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { regenerateLab } from '@/lib/actions/labs'

/**
 * Button that enqueues a new `generate_lab` job for the given lab. Confirms
 * via a small dialog since regeneration overwrites existing content.
 */
export function RegenerateLabButton({
  labId,
  status,
  label = 'Regenerate',
}: {
  labId: string
  status: 'pending' | 'generating' | 'complete' | 'failed'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  // Disable while a regeneration is already running.
  const disabled = status === 'generating'

  function onConfirm() {
    startTransition(async () => {
      const res = await regenerateLab(labId)
      if (res.success) {
        toast.success('Regeneration queued')
        setOpen(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <RefreshCw className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate this lab?</DialogTitle>
          <DialogDescription>
            This will queue a new generation job and overwrite the existing
            content for this lab.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Queuing…' : 'Regenerate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
