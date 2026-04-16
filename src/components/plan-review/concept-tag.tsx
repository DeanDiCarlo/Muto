'use client'

import { useState, useRef, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function ConceptTag({
  name,
  onRename,
  onRemove,
  disabled = false,
}: {
  name: string
  onRename: (newName: string) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(name)
  }, [name])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) {
      onRename(trimmed)
    } else {
      setDraft(name)
    }
    setEditing(false)
  }

  return (
    <Badge
      variant="secondary"
      className={cn('h-7 gap-1 px-2 py-1 text-xs', disabled && 'opacity-60')}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(name)
              setEditing(false)
            }
          }}
          className="bg-transparent border-none outline-none text-xs min-w-[60px] w-auto"
          style={{ width: `${Math.max(draft.length, 4)}ch` }}
        />
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setEditing(true)}
          disabled={disabled}
          className="text-xs hover:underline disabled:cursor-not-allowed"
        >
          {name}
        </button>
      )}
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${name}`}
        >
          ×
        </button>
      )}
    </Badge>
  )
}
