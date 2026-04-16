import Link from 'next/link'
import { Plus, BookOpen } from 'lucide-react'
import { requireProfessor } from '@/lib/auth'
import { listCoursesForProfessor } from '@/lib/actions/courses'
import { PageHeader } from '@/components/shell/page-header'
import { EmptyState } from '@/components/shell/empty-state'
import { Button } from '@/components/ui/button'
import { CourseCard } from '@/components/professor/course-card'

export default async function ProfessorCoursesPage() {
  await requireProfessor('/professor/courses')
  const courses = await listCoursesForProfessor()

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Courses"
        description="Your course definitions. Each course can be offered multiple semesters."
        actions={
          <Button asChild>
            <Link href="/professor/courses/new">
              <Plus className="mr-1 size-4" />
              New course
            </Link>
          </Button>
        }
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title="No courses yet"
          description="Create your first course to start uploading materials and generating labs."
          action={
            <Button asChild>
              <Link href="/professor/courses/new">
                <Plus className="mr-1 size-4" />
                New course
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  )
}
