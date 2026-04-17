'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendChatMessage } from '@/lib/actions/chat'
import { ChatMessageBubble, type Message } from '@/components/student/chat-message-bubble'
import { ChatComposer } from '@/components/student/chat-composer'

interface ChatWindowProps {
  sessionId: string
  initialMessages: Message[]
}

export function ChatWindow({ sessionId, initialMessages }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isAssistantThinking, setIsAssistantThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Subscribe to new messages via Realtime
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat_messages:session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_session_id=eq.${sessionId}`,
        },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) => {
            // Deduplicate — optimistic insert may already have added it
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          if (msg.role === 'assistant') {
            setIsAssistantThinking(false)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId])

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAssistantThinking])

  async function handleSend(content: string) {
    // Optimistic: add student message immediately
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId,
      role: 'student',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setIsAssistantThinking(true)

    const result = await sendChatMessage({ sessionId, content })

    if (!result.success) {
      // Revert optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setIsAssistantThinking(false)
      throw new Error(result.error)
    }

    // Replace optimistic with real message (Realtime may also deliver it — dedup handles it)
    setMessages((prev) =>
      prev
        .filter((m) => m.id !== optimisticId)
        .concat([
          { ...result.userMessage, role: result.userMessage.role as 'student' },
          { ...result.assistantMessage, role: result.assistantMessage.role as 'assistant' },
        ])
    )
    setIsAssistantThinking(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">
            Ask the tutor anything about this lab.
          </p>
        )}
        {messages.map((msg) => (
          <ChatMessageBubble key={msg.id} message={msg} />
        ))}
        {isAssistantThinking && (
          <div className="flex items-start gap-2">
            <div className="bg-muted rounded-lg px-4 py-2.5 text-sm text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <ChatComposer onSend={handleSend} />
    </div>
  )
}
