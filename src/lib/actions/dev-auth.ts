'use server'

// =============================================================================
// DEV-ONLY auth Server Actions.
// Sets / clears the `muto-dev-user` cookie used by src/lib/auth.ts.
// REPLACE BEFORE PRODUCTION (real SSO flow).
// =============================================================================

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { DEV_USER_COOKIE } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const devLoginSchema = z.object({
  userId: z.string().uuid(),
  next: z.string().optional(),
})

export async function devLogin(formData: FormData) {
  const parsed = devLoginSchema.parse({
    userId: formData.get('userId'),
    next: formData.get('next') || undefined,
  })

  // Verify user exists (admin client — DEV ONLY)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id, role')
    .eq('id', parsed.userId)
    .single()

  if (error || !data) throw new Error('User not found')

  const cookieStore = await cookies()
  cookieStore.set(DEV_USER_COOKIE, data.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // 30 days — dev convenience
    maxAge: 60 * 60 * 24 * 30,
  })

  // Pick a sensible default landing page if `next` not provided.
  const fallback = data.role === 'student' ? '/student/courses' : '/professor/courses'
  redirect(parsed.next || fallback)
}

export async function devLogout() {
  const cookieStore = await cookies()
  cookieStore.delete(DEV_USER_COOKIE)
  redirect('/login')
}

const seedUsersSchema = z.object({})

/**
 * One-click seeder for local dev: creates an institution + a professor +
 * a student if no users exist yet. Safe to call multiple times — no-op when
 * users already exist.
 */
export async function seedDevUsers(_formData: FormData) {
  seedUsersSchema.parse({})
  const admin = createAdminClient()

  const { count } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) return

  // Institution
  const { data: inst, error: instErr } = await admin
    .from('institutions')
    .upsert(
      {
        name: 'Miami University (Dev)',
        slug: 'miami-dev',
      },
      { onConflict: 'slug' }
    )
    .select('id')
    .single()
  if (instErr || !inst) throw new Error(`Institution seed failed: ${instErr?.message}`)

  // Create auth users via admin API (sets the public.users row via trigger)
  const seeds = [
    {
      email: 'prof@dev.muto',
      full_name: 'Professor Pat',
      role: 'professor' as const,
    },
    {
      email: 'student@dev.muto',
      full_name: 'Student Sam',
      role: 'student' as const,
    },
  ]

  for (const s of seeds) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email: s.email,
      email_confirm: true,
      password: crypto.randomUUID(),
      user_metadata: {
        institution_id: inst.id,
        full_name: s.full_name,
        role: s.role,
      },
    })
    if (createErr && !createErr.message.toLowerCase().includes('already')) {
      throw new Error(`Auth user seed failed (${s.email}): ${createErr.message}`)
    }
  }
}
