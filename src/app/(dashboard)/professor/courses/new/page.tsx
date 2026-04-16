import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireProfessor } from '@/lib/auth'
import { PageHeader } from '@/components/shell/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CourseCreateForm } from '@/components/professor/course-create-form'

export default async function NewCoursePage() {
  await requireProfessor('/professor/courses/new')

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/professor/courses">
            <ArrowLeft className="mr-1 size-4" />
            Back to courses
          </Link>
        </Button>
      </div>

      <PageHeader
        title="New course"
        description="A course is a reusable definition. You'll offer it each semester as a course instance."
      />

      <Card>
        <CardContent className="pt-6">
          <CourseCreateForm />
        </CardContent>
      </Card>
    </div>
  )
}
