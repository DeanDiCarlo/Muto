import type { LabSection } from '@/types/generation'
import { sectionIdFor } from './lab-viewer'

export function LabToc({ sections }: { sections: LabSection[] }) {
  if (sections.length === 0) return null

  return (
    <nav
      aria-label="Lab sections"
      className="hidden lg:block sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        In this lab
      </div>
      <ol className="space-y-2 text-sm">
        {sections.map((section, idx) => (
          <li key={idx}>
            <a
              href={`#${sectionIdFor(section, idx)}`}
              className="block rounded px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-2">
                {section.blooms_level}
              </span>
              {section.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
