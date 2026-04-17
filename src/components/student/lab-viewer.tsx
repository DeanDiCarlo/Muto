import ReactMarkdown from 'react-markdown'
import { Badge } from '@/components/ui/badge'
import type { LabSection } from '@/types/generation'

export function sectionIdFor(section: LabSection, idx: number): string {
  const slug = section.heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `section-${idx}-${slug || 'untitled'}`
}

const MARKDOWN_CLASSES =
  'text-sm leading-relaxed text-foreground ' +
  '[&_p]:mt-3 [&_p]:leading-relaxed ' +
  '[&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold ' +
  '[&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-semibold ' +
  '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 ' +
  '[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 ' +
  '[&_li]:mt-1 ' +
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs ' +
  '[&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 ' +
  '[&_blockquote]:mt-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground ' +
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 ' +
  '[&_strong]:font-semibold ' +
  '[&_hr]:my-6 [&_hr]:border-border'

export function LabViewer({ sections }: { sections: LabSection[] }) {
  return (
    <div className="space-y-10">
      {sections.map((section, idx) => (
        <section
          key={idx}
          id={sectionIdFor(section, idx)}
          className="scroll-mt-24"
        >
          <Badge variant="secondary" className="mb-3 capitalize">
            {section.blooms_level}
          </Badge>
          <h2 className="text-xl font-semibold tracking-tight">
            {section.heading}
          </h2>
          <div className={MARKDOWN_CLASSES}>
            <ReactMarkdown>{section.body}</ReactMarkdown>
          </div>
        </section>
      ))}
    </div>
  )
}
