'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { toggleInstanceActive, type InstanceCardData } from '@/lib/actions/instances'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function InstanceCard({ instance }: { instance: InstanceCardData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  async function handleCopyCode() {
    const ok = await copyToClipboard(instance.joinCode)
    if (ok) toast.success('Copied')
    else toast.error('Clipboard not available')
  }

  async function handleCopyLink() {
    const ok = await copyToClipboard(instance.joinLink)
    if (ok) toast.success('Copied')
    else toast.error('Clipboard not available')
  }

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleInstanceActive(instance.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.isActive ? 'Instance activated' : 'Instance deactivated'
      )
      router.refresh()
    })
  }

  const studentLabel =
    instance.enrolledStudentCount === 1 ? '1 student' : `${instance.enrolledStudentCount} students`

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold tracking-tight">
            {instance.semester}
          </h3>
          <Badge variant={instance.isActive ? 'default' : 'secondary'}>
            {instance.isActive ? 'Active' : 'Deactivated'}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <code className="font-mono text-xl font-semibold tracking-wider">
              {instance.joinCode}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyCode}
            >
              <Copy />
              Copy code
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {instance.joinLink}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleCopyLink}
            >
              <Copy />
              Copy link
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-muted-foreground">{studentLabel}</span>
          <Button
            type="button"
            variant={instance.isActive ? 'outline' : 'default'}
            size="sm"
            onClick={handleToggle}
            disabled={isPending}
          >
            {isPending
              ? 'Saving...'
              : instance.isActive
                ? 'Deactivate'
                : 'Activate'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
