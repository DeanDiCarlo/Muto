import { Sidebar, type CourseContext, type SidebarRole } from './sidebar'
import { TopBar, type ShellUser } from './top-bar'

/**
 * The full app shell: persistent sidebar (role-aware), sticky top bar with
 * breadcrumbs + user menu, and a scrollable main area for the page content.
 *
 * Each role-specific layout (professor / student) renders this with its
 * `role` baked in so the sidebar nav matches the section.
 */
export function AppShell({
  role,
  user,
  courseContext,
  children,
}: {
  role: SidebarRole
  user?: ShellUser
  courseContext?: CourseContext
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar role={role} courseContext={courseContext} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
