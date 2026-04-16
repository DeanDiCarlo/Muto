import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CourseCardData } from '@/lib/actions/courses'

export function CourseCard({ course }: { course: CourseCardData }) {
  const stats = [
    `${course.moduleCount} ${course.moduleCount === 1 ? 'module' : 'modules'}`,
    `${course.labCount} ${course.labCount === 1 ? 'lab' : 'labs'}`,
    `${course.enrolledStudentCount} ${
      course.enrolledStudentCount === 1 ? 'student' : 'students'
    }`,
  ].join(' · ')

  return (
    <Link
      href={`/professor/courses/${course.id}`}
      className="group block focus:outline-none"
    >
      <Card className="h-full transition-colors group-hover:bg-foreground/[0.02] group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold leading-tight">
              {course.title}
            </h3>
            {course.activeInstanceCount > 0 && (
              <Badge variant="secondary" className="shrink-0">
                Live
              </Badge>
            )}
          </div>

          {course.subjectArea && (
            <div>
              <Badge variant="outline" className="font-normal">
                {course.subjectArea}
              </Badge>
            </div>
          )}

          {course.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {course.description}
            </p>
          )}

          <p className="mt-auto text-xs text-muted-foreground">{stats}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
