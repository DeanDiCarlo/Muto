'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * BreadcrumbContext lets pages inject human-readable labels for path segments
 * (typically UUIDs) so that the breadcrumb component can render
 * "Courses › Quantum Computing › Plan" instead of
 * "Courses › a3f8c2d1-... › Plan".
 *
 * Keys are matched against:
 *   1. The path segment string itself (e.g., "abc-123-uuid" → "Quantum Computing")
 *   2. A bracketed param name (e.g., "[courseId]" → label) — useful when the
 *      page knows its slot but not the value
 *
 * Labels are mutable: nested pages/layouts deeper in the tree can register
 * labels via `useInjectBreadcrumbLabel` or the `<InjectBreadcrumbLabel>`
 * component. The top-level `<BreadcrumbProvider>` owns the label map and is
 * mounted by `AppShell` so that sibling `<Breadcrumbs>` in the top bar can
 * read labels written from inside `{children}`.
 */

export type BreadcrumbLabels = Record<string, string>

type BreadcrumbContextValue = {
  labels: BreadcrumbLabels
  setLabel: (key: string, value: string) => void
  unsetLabel: (key: string) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  labels: {},
  setLabel: () => {},
  unsetLabel: () => {},
})

export function BreadcrumbProvider({
  children,
  initialLabels,
}: {
  children: ReactNode
  initialLabels?: BreadcrumbLabels
}) {
  const [labels, setLabels] = useState<BreadcrumbLabels>(initialLabels ?? {})

  const setLabel = useCallback((key: string, value: string) => {
    setLabels((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }))
  }, [])

  const unsetLabel = useCallback((key: string) => {
    setLabels((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ labels, setLabel, unsetLabel }),
    [labels, setLabel, unsetLabel]
  )

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbLabels(): BreadcrumbLabels {
  return useContext(BreadcrumbContext).labels
}

/**
 * Client hook that registers a breadcrumb label for the life of the component.
 * No-op when `key` or `value` is nullish.
 */
export function useInjectBreadcrumbLabel(
  key: string | null | undefined,
  value: string | null | undefined
) {
  const { setLabel, unsetLabel } = useContext(BreadcrumbContext)
  useEffect(() => {
    if (!key || !value) return
    setLabel(key, value)
    return () => unsetLabel(key)
  }, [key, value, setLabel, unsetLabel])
}

/**
 * Zero-visual client component usable directly from server components.
 * Renders nothing; its only job is to register a breadcrumb label while
 * mounted.
 */
export function InjectBreadcrumbLabel({
  segmentKey,
  value,
}: {
  segmentKey: string
  value: string | null | undefined
}) {
  useInjectBreadcrumbLabel(segmentKey, value)
  return null
}
