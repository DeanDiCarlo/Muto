import Link from 'next/link'
import { requireStudent } from '@/lib/auth'
import { listMyEnrollments } from '@/lib/actions/enrollment'
import { PageHeader } from '@/components/shell/page-header'
import { EmptyState } from '@/components/shell/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen } from 'lucide-react'

export default async function StudentCoursesPage() {
  await requireStudent('/student/courses')

  const result = await listMyEnrollments()
  const enrollments = result.success ? result.enrollments : []

  return (
    <>
      <PageHeader title="My Courses" />

      {enrollments.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title="No courses yet"
          description="Use a join code from your professor to enroll in a course."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((e) => (
            <Link key={e.enrollmentId} href={`/student/courses/${e.instanceId}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h2 className="font-semibold text-base leading-snug">
                    {e.courseTitle}
                  </h2>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">{e.semester}</Badge>
                    {e.subjectArea && (
                      <span className="text-xs text-muted-foreground">
                        {e.subjectArea.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
