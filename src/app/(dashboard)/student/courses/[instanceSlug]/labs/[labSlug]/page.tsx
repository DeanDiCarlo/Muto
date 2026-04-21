import { notFound, redirect } from 'next/navigation'
import { requireStudent } from '@/lib/auth'
import { getInstanceBySlug } from '@/lib/actions/enrollment'
import { getLabForStudent } from '@/lib/actions/student-lab'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageHeader } from '@/components/shell/page-header'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'
import { LabViewer } from '@/components/student/lab-viewer'
import { LabToc } from '@/components/student/lab-toc'
import { LabActionBar } from '@/components/student/lab-action-bar'

export default async function StudentLabPage({
  params,
}: {
  params: Promise<{ instanceSlug: string; labSlug: string }>
}) {
  const { instanceSlug, labSlug } = await params
  await requireStudent(`/student/courses/${instanceSlug}/labs/${labSlug}`)

  const instance = await getInstanceBySlug(instanceSlug)
  if (!instance) notFound()

  // Resolve lab slug within this instance's course. Unique index
  // labs(course_id, slug) makes this safe.
  const admin = createAdminClient()
  const { data: lab } = await admin
    .from('labs')
    .select('id, course_id')
    .eq('course_id', instance.course_id)
    .eq('slug', labSlug)
    .maybeSingle()

  if (!lab) {
    // If the student pasted a lab slug from a different course, redirect to
    // that course's instance (if they're enrolled in it) instead of 404.
    // We don't speculatively enroll — just 404 here.
    notFound()
  }

  const result = await getLabForStudent({ instanceId: instance.id, labId: lab.id })
  if (!result.success) notFound()

  // Defensive: in the rare case labs.course_id drifts from instance.course_id
  // (should be blocked by the denorm invariant in migration 006 + never-update
  // policy), redirect to the canonical path.
  if (lab.course_id !== instance.course_id) {
    redirect(`/student/courses/${instanceSlug}`)
  }

  const { lab: detail, moduleTitle } = result

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={labSlug} value={detail.title} />

      <PageHeader title={detail.title} description={moduleTitle} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <LabViewer sections={detail.content.sections} />
          <LabActionBar instanceSlug={instanceSlug} labSlug={labSlug} />
        </div>
        <aside className="min-w-0">
          <LabToc sections={detail.content.sections} />
        </aside>
      </div>
    </>
  )
}
