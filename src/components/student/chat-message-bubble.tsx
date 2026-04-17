'use client'

interface Message {
  id: string
  role: 'student' | 'assistant'
  content: string
  created_at: string
}

interface ChatMessageBubbleProps {
  message: Message
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  const isStudent = message.role === 'student'
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`flex flex-col gap-1 ${isStudent ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
          isStudent
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {message.content}
      </div>
      <span className="text-xs text-muted-foreground px-1">{time}</span>
    </div>
  )
}

export type { Message }
