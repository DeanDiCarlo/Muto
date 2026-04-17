'use client'

import { useState, useRef, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ChatComposerProps {
  onSend: (content: string) => Promise<void>
  disabled?: boolean
}

export function ChatComposer({ onSend, disabled = false }: ChatComposerProps) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSend = value.trim().length > 0 && !sending && !disabled

  async function handleSend() {
    if (!canSend) return
    const content = value.trim()
    setValue('')
    setSending(true)
    try {
      await onSend(content)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send'
      if (message.startsWith('RATE_LIMIT:')) {
        toast.error(message.replace('RATE_LIMIT: ', ''))
      } else {
        toast.error(message)
      }
      // Restore content on error
      setValue(content)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex gap-2 items-end border-t bg-background p-4">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask the tutor a question… (Enter to send, Shift+Enter for newline)"
        rows={2}
        disabled={sending || disabled}
        className="resize-none flex-1"
      />
      <Button onClick={handleSend} disabled={!canSend} size="sm" className="mb-0.5">
        {sending ? 'Sending…' : 'Send'}
      </Button>
    </div>
  )
}
