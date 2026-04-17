import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { JoinCard } from '@/components/student/join-card'

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  // If not logged in, redirect to login with next param
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`)
  }

  // Look up the instance by join code
  const admin = createAdminClient()
  const { data: instance } = await admin
    .from('course_instances')
    .select('id, semester, is_active, courses!inner(title)')
    .ilike('join_code', code)
    .single()

  if (!instance) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">Invalid Join Code</h1>
          <p className="text-sm text-muted-foreground">
            The join code &ldquo;{code}&rdquo; doesn&apos;t match any course.
            Double-check the code from your professor.
          </p>
        </div>
      </div>
    )
  }

  if (!instance.is_active) {
    const courseTitle = Array.isArray(instance.courses)
      ? instance.courses[0]?.title
      : (instance.courses as { title: string })?.title
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">{courseTitle}</h1>
          <p className="text-sm text-muted-foreground">
            This course is no longer accepting enrollments.
          </p>
        </div>
      </div>
    )
  }

  const courseTitle = Array.isArray(instance.courses)
    ? instance.courses[0]?.title
    : (instance.courses as { title: string })?.title

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <JoinCard
        courseTitle={courseTitle ?? 'Course'}
        semester={instance.semester}
        joinCode={code}
      />
    </div>
  )
}
