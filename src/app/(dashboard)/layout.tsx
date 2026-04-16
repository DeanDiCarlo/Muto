/**
 * Dashboard route group.
 *
 * The actual chrome (sidebar + top bar) is rendered by the role-specific
 * layouts (`professor/layout.tsx`, `student/layout.tsx`) so that the sidebar
 * can be configured with the correct role and any course context. This layout
 * is just a passthrough that anchors the route group.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
