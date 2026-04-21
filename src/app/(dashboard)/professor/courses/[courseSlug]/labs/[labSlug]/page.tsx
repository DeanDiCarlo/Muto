import { notFound, redirect } from 'next/navigation'
import { AlertTriangle, FileText } from 'lucide-react'
import { requireProfessor } from '@/lib/auth'
import { getLabBySlug, getLab } from '@/lib/actions/labs'
import { PageHeader } from '@/components/shell/page-header'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LabPreview } from '@/components/professor/lab-preview'
import { LabStatusBadge } from '@/components/professor/lab-list-item'
import { RegenerateLabButton } from '@/components/professor/regenerate-lab-button'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'

export default async function ProfessorLabDetailPage({
  params,
}: {
  params: Promise<{ courseSlug: string; labSlug: string }>
}) {
  const { courseSlug, labSlug } = await params
  await requireProfessor(
    `/professor/courses/${courseSlug}/labs/${labSlug}`
  )

  // Resolve the lab by slug first, then try the cross-course case where the
  // user pasted a mismatched URL: redirect to the canonical course slug for
  // this lab instead of 404-ing (plan §2: 307 on mismatch, not 404).
  const bySlug = await getLabBySlug(courseSlug, labSlug)
  if (!bySlug) {
    // Fallback: did the user paste a lab that belongs to a different course?
    // Attempt an id-lookup only if labSlug *could* be a uuid — middleware
    // covers the uuid-segment case. Otherwise 404.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(labSlug)) {
      const byId = await getLab(labSlug)
      if (byId) notFound()
    }
    notFound()
  }

  // Load the full detail (concepts + source materials) by id.
  const detail = await getLab(bySlug.lab.id)
  if (!detail) notFound()

  // Defensive: ensure URL's course slug matches the lab's actual course.
  // If it doesn't, 307 to the canonical URL.
  if (bySlug.course.slug !== courseSlug) {
    redirect(`/professor/courses/${bySlug.course.slug}/labs/${labSlug}`)
  }

  const { lab, concepts, sourceMaterials } = detail

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <InjectBreadcrumbLabel segmentKey={courseSlug} value={lab.courseTitle} />
      <InjectBreadcrumbLabel segmentKey={labSlug} value={lab.title} />

      <PageHeader
        title={lab.title}
        description={`Module: ${lab.moduleTitle}`}
        actions={
          <>
            <LabStatusBadge status={lab.generationStatus} />
            <RegenerateLabButton
              labId={lab.id}
              status={lab.generationStatus}
            />
          </>
        }
      />

      {lab.generationStatus === 'failed' && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex-1">
            <div className="font-medium">Generation failed</div>
            <p className="text-destructive/90">
              The last generation attempt for this lab failed. You can retry
              from here.
            </p>
          </div>
          <RegenerateLabButton
            labId={lab.id}
            status={lab.generationStatus}
            label="Retry"
          />
        </div>
      )}

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="concepts">
            Concepts ({concepts.length})
          </TabsTrigger>
          <TabsTrigger value="sources">
            Source Materials ({sourceMaterials.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="pt-4">
          <LabPreview content={lab.content} />
        </TabsContent>

        <TabsContent value="concepts" className="pt-4">
          {concepts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No concepts attached to this lab yet.
            </p>
          ) : (
            <div className="space-y-2">
              {concepts.map((c) => (
                <Card key={c.id} size="sm">
                  <CardContent className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{c.name}</div>
                      {c.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.description}
                        </p>
                      )}
                    </div>
                    {c.bloomsLevel && (
                      <Badge variant="outline" className="font-normal capitalize">
                        {c.bloomsLevel}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sources" className="pt-4">
          {sourceMaterials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No source materials attached to this lab.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sourceMaterials.map((s) => (
                <div
                  key={s.id}
                  className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs"
                >
                  <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{s.fileName}</span>
                  <Badge variant="secondary" className="font-mono">
                    {s.fileType}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
