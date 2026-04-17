import { notFound } from 'next/navigation'
import { requireStudent } from '@/lib/auth'
import { getLabForStudent } from '@/lib/actions/student-lab'
import { PageHeader } from '@/components/shell/page-header'
import { InjectBreadcrumbLabel } from '@/lib/utils/breadcrumb-context'
import { LabViewer } from '@/components/student/lab-viewer'
import { LabToc } from '@/components/student/lab-toc'
import { LabActionBar } from '@/components/student/lab-action-bar'

export default async function StudentLabPage({
  params,
}: {
  params: Promise<{ instanceId: string; labId: string }>
}) {
  const { instanceId, labId } = await params
  await requireStudent(`/student/courses/${instanceId}/labs/${labId}`)

  const result = await getLabForStudent({ instanceId, labId })
  if (!result.success) notFound()

  const { lab, moduleTitle } = result

  return (
    <>
      <InjectBreadcrumbLabel segmentKey={labId} value={lab.title} />

      <PageHeader title={lab.title} description={moduleTitle} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <LabViewer sections={lab.content.sections} />
          <LabActionBar instanceId={instanceId} labId={labId} />
        </div>
        <aside className="min-w-0">
          <LabToc sections={lab.content.sections} />
        </aside>
      </div>
    </>
  )
}
