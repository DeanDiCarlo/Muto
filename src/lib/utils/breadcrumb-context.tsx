'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * BreadcrumbContext lets pages inject human-readable labels for path segments
 * (typically UUIDs) so that the breadcrumb component can render
 * "Courses › Quantum Computing › Plan" instead of
 * "Courses › a3f8c2d1-... › Plan".
 *
 * Keys are matched against:
 *   1. The path segment string itself (e.g., "abc-123-uuid" → "Quantum Computing")
 *   2. A bracketed param name (e.g., "[courseId]" → label) — useful when the
 *      page knows it's the courseId without knowing the value
 */

export type BreadcrumbLabels = Record<string, string>

const BreadcrumbContext = createContext<BreadcrumbLabels>({})

export function BreadcrumbProvider({
  labels,
  children,
}: {
  labels: BreadcrumbLabels
  children: ReactNode
}) {
  // Memoize so consumers don't re-render unless labels change by content
  const value = useMemo(() => labels, [labels])
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

export function useBreadcrumbLabels(): BreadcrumbLabels {
  return useContext(BreadcrumbContext)
}
