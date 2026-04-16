'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { useBreadcrumbLabels } from '@/lib/utils/breadcrumb-context'

/**
 * Derives breadcrumb items from the current pathname and the BreadcrumbContext
 * label injection. Segment matching:
 *   1. labels[segment] (exact match — typically a UUID → human-readable title)
 *   2. labels[`[paramName]`] (e.g., "[courseId]" — when page knows its slot but not the value)
 *   3. Title-case fallback (e.g., "materials" → "Materials")
 *
 * The dashboard route group `(dashboard)` is invisible to URLs but we still
 * skip top-level role segments (`professor` / `student`) since they're
 * encoded by the sidebar context, not the breadcrumb trail.
 */

const ROLE_SEGMENTS = new Set(['professor', 'student'])

// Map URL segment → bracketed param name when there's a 1:1 convention.
// Used as a secondary lookup for labels keyed by [paramName].
const SEGMENT_PARAM_MAP: Record<string, string> = {}

function titleCase(s: string) {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? '/'
  const labels = useBreadcrumbLabels()

  const segments = pathname.split('/').filter(Boolean)

  // Walk segments and build href incrementally
  const items: Array<{ label: string; href: string }> = []
  let href = ''
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    href += `/${seg}`

    // Skip role segments — they're implied by the sidebar
    if (i === 0 && ROLE_SEGMENTS.has(seg)) continue

    const paramKey = SEGMENT_PARAM_MAP[seg]
    const label =
      labels[seg] ??
      (paramKey ? labels[paramKey] : undefined) ??
      titleCase(seg)

    items.push({ label, href })
  }

  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground">Home</div>
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm min-w-0">
      <ol className="flex items-center gap-1 min-w-0">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          return (
            <li key={item.href} className="flex items-center gap-1 min-w-0">
              {idx > 0 && (
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
              )}
              {isLast ? (
                <span
                  className="font-medium text-foreground truncate"
                  aria-current="page"
                  title={item.label}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground transition-colors truncate"
                  title={item.label}
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
