// =============================================================================
// Auth gate (DEV stub) — Next.js 16 `proxy.ts` convention (replaces
// `middleware.ts`).
//
// Blocks `/professor/*` and `/student/*` to anyone without the dev session
// cookie set by `devLogin`. Allow-lists everything else (`/`, `/login`,
// `/join/*`, static assets are filtered out by `matcher`).
//
// Production replacement: this should validate a real Supabase Auth session
// (use `@supabase/ssr` proxy client to refresh tokens).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { DEV_USER_COOKIE } from '@/lib/auth'

const PROTECTED_PREFIXES = ['/professor', '/student']

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
  if (!isProtected) return NextResponse.next()

  const hasSession = req.cookies.get(DEV_USER_COOKIE)?.value
  if (hasSession) return NextResponse.next()

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Skip Next internals and static assets so middleware doesn't run on every
  // image/font request.
  matcher: ['/((?!_next/|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot|map)).*)'],
}
