// =============================================================================
// DEV-ONLY login page.
//
// Lists rows from public.users and lets you sign in as any of them with a
// click. No password, no SSO. Uses the `muto-dev-user` cookie set by
// `devLogin` Server Action.
//
// REPLACE BEFORE PRODUCTION with real SSO callback handling.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { devLogin, seedDevUsers } from '@/lib/actions/dev-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shell/empty-state'
import { Users } from 'lucide-react'

type SearchParams = { next?: string | string[] }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const next = Array.isArray(sp.next) ? sp.next[0] : sp.next

  const admin = createAdminClient()
  const { data: users } = await admin
    .from('users')
    .select('id, email, full_name, role, institution_id, institutions(name)')
    .order('role', { ascending: true })
    .order('full_name', { ascending: true })

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Sign in to Muto</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a seeded user. This dev login is wired to a cookie — no password
          needed. Production will use institutional SSO.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seeded users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users && users.length > 0 ? (
            users.map((u) => {
              const inst = (u.institutions as { name?: string } | null)?.name
              return (
                <form key={u.id} action={devLogin}>
                  <input type="hidden" name="userId" value={u.id} />
                  {next && <input type="hidden" name="next" value={next} />}
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-foreground/10 bg-background px-4 py-3 text-left transition-colors hover:bg-foreground/5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {u.full_name ?? u.email}
                        </span>
                        <Badge
                          variant={u.role === 'professor' ? 'default' : 'secondary'}
                          className="shrink-0"
                        >
                          {u.role}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {u.email}
                        {inst && <span className="ml-2">· {inst}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Sign in →
                    </span>
                  </button>
                </form>
              )
            })
          ) : (
            <EmptyState
              icon={<Users className="size-6" />}
              title="No users yet"
              description="Click below to seed a professor and a student for local dev."
              action={
                <form action={seedDevUsers}>
                  <Button type="submit">Seed dev users</Button>
                </form>
              }
            />
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Dev login only. Production will route through institutional SSO (SAML).
      </p>
    </div>
  )
}
