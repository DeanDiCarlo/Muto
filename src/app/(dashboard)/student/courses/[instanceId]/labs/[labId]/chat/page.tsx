import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireStudent } from '@/lib/auth'
import { getOrCreateChatSession } from '@/lib/actions/chat'
import { ChatWindow } from '@/components/student/chat-window'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

interface ChatPageProps {
  params: Promise<{ instanceId: string; labId: string }>
}

export default async function ChatPage({ params }: ChatPageProps) {
  await requireStudent()
  const { instanceId, labId } = await params

  const result = await getOrCreateChatSession({ instanceId, labId })

  if (!result.success) {
    if (result.error === 'Unauthorized' || result.error === 'Not enrolled in this course') {
      redirect('/student/courses')
    }
    notFound()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/student/courses/${instanceId}/labs/${labId}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Lab
          </Link>
        </Button>
        <span className="text-sm font-medium">AI Tutor</span>
      </div>
      <ChatWindow sessionId={result.sessionId} initialMessages={result.messages} />
    </div>
  )
}
