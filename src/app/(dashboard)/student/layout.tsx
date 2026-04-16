import { AppShell } from '@/components/shell/app-shell'

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // T4 will replace this with `await getCurrentUser()` and pass real user.
  return <AppShell role="student">{children}</AppShell>
}
