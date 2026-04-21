import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireStudent } from '@/lib/auth'
import { getInstanceBySlug } from '@/lib/actions/enrollment'
import { getOrCreateChatSession } from '@/lib/actions/chat'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChatWindow } from '@/components/student/chat-window'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'

interface ChatPageProps {
  params: Promise<{ instanceSlug: string; labSlug: string }>
}

export default async function ChatPage({ params }: ChatPageProps) {
  await requireStudent()
  const { instanceSlug, labSlug } = await params

  const instance = await getInstanceBySlug(instanceSlug)
  if (!instance) notFound()

  const admin = createAdminClient()
  const { data: lab } = await admin
    .from('labs')
    .select('id')
    .eq('course_id', instance.course_id)
    .eq('slug', labSlug)
    .maybeSingle()

  if (!lab) notFound()

  const result = await getOrCreateChatSession({ instanceId: instance.id, labId: lab.id })

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
          <Link href={`/student/courses/${instanceSlug}/labs/${labSlug}`}>
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
