'use client'

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'

export function SortableList<T extends { id: string | number }>({
  items,
  onReorder,
  renderItem,
  disabled = false,
}: {
  items: T[]
  onReorder: (next: T[]) => void
  renderItem: (item: T, dragHandle: ReactNode) => ReactNode
  disabled?: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => String(i.id) === String(active.id))
    const newIndex = items.findIndex((i) => String(i.id) === String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  if (disabled) {
    return <>{items.map((item) => <div key={String(item.id)}>{renderItem(item, null)}</div>)}</>
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => String(i.id))} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableItem key={String(item.id)} id={String(item.id)}>
            {(dragHandle) => renderItem(item, dragHandle)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({
  id,
  children,
}: {
  id: string
  children: (dragHandle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none p-1"
      aria-label="Drag to reorder"
    >
      <GripVertical className="size-4" />
    </button>
  )

  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  )
}
