'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  ClipboardList,
  FileStack,
  GraduationCap,
  Home,
  LayoutGrid,
  Layers,
  Sparkles,
  Users,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export type SidebarRole = 'professor' | 'student'

export type CourseContext = {
  id: string
  slug: string
  title: string
}

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  match?: 'exact' | 'prefix'
}

function profTopNav(): NavItem[] {
  return [
    { href: '/professor/courses', label: 'Courses', icon: BookOpen, match: 'prefix' },
  ]
}

function profCourseNav(courseSlug: string): NavItem[] {
  const base = `/professor/courses/${courseSlug}`
  return [
    { href: base, label: 'Overview', icon: Home, match: 'exact' },
    { href: `${base}/materials`, label: 'Materials', icon: FileStack, match: 'prefix' },
    { href: `${base}/plan`, label: 'Plan', icon: ClipboardList, match: 'prefix' },
    { href: `${base}/labs`, label: 'Labs', icon: Sparkles, match: 'prefix' },
    { href: `${base}/instances`, label: 'Instances', icon: Users, match: 'prefix' },
  ]
}

function studentTopNav(): NavItem[] {
  return [
    { href: '/student/courses', label: 'My Courses', icon: GraduationCap, match: 'prefix' },
  ]
}

function studentCourseNav(instanceSlug: string): NavItem[] {
  const base = `/student/courses/${instanceSlug}`
  return [
    { href: base, label: 'Overview', icon: Home, match: 'exact' },
    { href: `${base}/labs`, label: 'Labs', icon: Layers, match: 'prefix' },
  ]
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === 'exact') return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-foreground/10 text-foreground'
          : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function Sidebar({
  role,
  courseContext,
}: {
  role: SidebarRole
  courseContext?: CourseContext
}) {
  const pathname = usePathname() ?? '/'

  const topNav = role === 'professor' ? profTopNav() : studentTopNav()

  let courseNav: NavItem[] | null = null
  if (courseContext) {
    courseNav =
      role === 'professor'
        ? profCourseNav(courseContext.slug)
        : studentCourseNav(courseContext.slug)
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-foreground/10 bg-card/30">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 px-4">
        <div
          className="flex size-7 items-center justify-center rounded-md bg-foreground text-background"
          aria-hidden
        >
          <LayoutGrid className="size-4" />
        </div>
        <Link
          href={role === 'professor' ? '/professor/courses' : '/student/courses'}
          className="text-sm font-semibold tracking-tight"
        >
          Muto
        </Link>
      </div>

      <Separator />

      {/* Top-level nav */}
      <nav className="flex flex-col gap-0.5 p-2">
        {topNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
      </nav>

      {/* Course-context nav */}
      {courseNav && courseContext && (
        <>
          <Separator className="my-1" />
          <div className="flex flex-col gap-0.5 p-2">
            <p
              className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground truncate"
              title={courseContext.title}
            >
              {courseContext.title}
            </p>
            {courseNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item)}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-auto p-3 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {role === 'professor' ? 'Professor view' : 'Student view'}
      </div>
    </aside>
  )
}
