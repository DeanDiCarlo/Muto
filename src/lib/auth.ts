// =============================================================================
// DEV-ONLY auth helpers.
//
// This module is a stub. It powers the local dev/login experience until the
// real SSO sprint replaces it. The contract (getCurrentUser, requireProfessor,
// requireStudent, getUserRole) is what callers should depend on; the
// implementation will be swapped to read a real Supabase Auth session backed
// by SAML/Duo at Miami University.
//
// How the stub works:
//   - The dev login page lists rows from public.users and lets you "sign in"
//     as any of them by setting a `muto-dev-user` cookie containing the
//     user id.
//   - getCurrentUser() reads that cookie, then loads the row from public.users
//     via the admin client (bypasses RLS — DEV ONLY).
//   - requireProfessor / requireStudent are server-component guards that
//     redirect to /login or to the opposite-role dashboard.
//
// REPLACE BEFORE PRODUCTION.
// =============================================================================

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CurrentUser, UserRole } from '@/types/auth'

export const DEV_USER_COOKIE = 'muto-dev-user'

/**
 * Returns the currently signed-in user, or null if no session.
 *
 * In dev: reads the `muto-dev-user` cookie set by the dev login page.
 * Production: this should be replaced with `supabase.auth.getUser()` + a
 * lookup into public.users.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies()
  const userId = cookieStore.get(DEV_USER_COOKIE)?.value
  if (!userId) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id, email, full_name, role, institution_id')
    .eq('id', userId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    email: data.email,
    name: data.full_name ?? data.email,
    role: data.role as UserRole,
    institutionId: data.institution_id,
  }
}

/**
 * Returns the role of the current user, or null if unauthed.
 * 'ta' is treated as a professor for navigation purposes for now.
 */
export async function getUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser()
  return user?.role ?? null
}

/**
 * Server-component guard. Redirects to /login if unauthed; redirects
 * students to /student/courses if they hit a professor route.
 */
export async function requireProfessor(currentPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) {
    const next = currentPath ? `?next=${encodeURIComponent(currentPath)}` : ''
    redirect(`/login${next}`)
  }
  if (user.role === 'student') {
    redirect('/student/courses')
  }
  return user
}

/**
 * Server-component guard. Redirects to /login if unauthed; redirects
 * professors/TAs to /professor/courses if they hit a student route.
 */
export async function requireStudent(currentPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) {
    const next = currentPath ? `?next=${encodeURIComponent(currentPath)}` : ''
    redirect(`/login${next}`)
  }
  if (user.role === 'professor' || user.role === 'ta') {
    redirect('/professor/courses')
  }
  return user
}
