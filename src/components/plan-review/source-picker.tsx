'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export type SourceMaterial = { id: string; file_name: string; file_type: string }

export function SourcePicker({
  availableMaterials,
  selectedIds,
  onChange,
  disabled = false,
}: {
  availableMaterials: SourceMaterial[]
  selectedIds: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  function toggle(id: string) {
    const has = selectedIds.includes(id)
    const next = has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    onChange(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 text-xs"
        >
          <Plus className="size-3" />
          Source
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        {availableMaterials.length === 0 ? (
          <DropdownMenuItem disabled>
            No materials uploaded yet.
          </DropdownMenuItem>
        ) : (
          availableMaterials.map((mat) => (
            <DropdownMenuCheckboxItem
              key={mat.id}
              checked={selectedIds.includes(mat.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(mat.id)}
            >
              <span className="truncate max-w-[300px]">{mat.file_name}</span>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
