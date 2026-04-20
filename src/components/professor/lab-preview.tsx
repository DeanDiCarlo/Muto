import { Badge } from '@/components/ui/badge'
import type { LabContent } from '@muto/shared/generation'

/**
 * Renders a lab's structured content for the professor's preview tab. Each
 * section carries a Bloom's level pill, a heading, and a body. No markdown
 * rendering here — the student-facing view (T14) handles rich text.
 */
export function LabPreview({ content }: { content: LabContent | null }) {
  if (!content || !content.sections || content.sections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No content yet. This lab hasn&apos;t been generated.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {content.sections.map((section, i) => (
        <section key={i} className="space-y-2">
          <Badge variant="outline" className="font-normal capitalize">
            {section.blooms_level}
          </Badge>
          <h3 className="text-base font-semibold leading-snug">
            {section.heading}
          </h3>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {section.body}
          </div>
        </section>
      ))}
    </div>
  )
}
