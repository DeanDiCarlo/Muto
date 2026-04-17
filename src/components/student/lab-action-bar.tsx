import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MessageCircle, ClipboardCheck } from 'lucide-react'

export function LabActionBar({
  instanceId,
  labId,
}: {
  instanceId: string
  labId: string
}) {
  const base = `/student/courses/${instanceId}/labs/${labId}`

  return (
    <div className="sticky bottom-0 mt-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-6 sm:px-6">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" asChild>
          <Link href={`${base}/chat`}>
            <MessageCircle />
            Ask the Tutor
          </Link>
        </Button>
        <Button size="lg" asChild>
          <Link href={`${base}/review`}>
            <ClipboardCheck />
            Take Knowledge Review
          </Link>
        </Button>
      </div>
    </div>
  )
}
