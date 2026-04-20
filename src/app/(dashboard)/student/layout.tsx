import { AppShell } from '@/components/shell/app-shell'
import { getCurrentUser } from '@/lib/auth'

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const current = await getCurrentUser()
  const user = current
    ? { id: current.id, name: current.name, email: current.email }
    : undefined
  return (
    <AppShell role="student" user={user}>
      {children}
    </AppShell>
  )
}
