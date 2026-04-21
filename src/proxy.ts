// =============================================================================
// Next.js 16 proxy (replaces middleware.ts).
//
// Two responsibilities, in order:
//   1. UUID→slug redirect: any /professor/courses/{uuid} or
//      /student/courses/{uuid} URL is 308-redirected to the display_slug
//      equivalent. Keeps old bookmarks and pasted UUIDs working transparently.
//   2. Auth gate (DEV stub): blocks /professor/* and /student/* to anyone
//      without the dev session cookie. Production: validate Supabase Auth JWT.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEV_USER_COOKIE } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROTECTED_PREFIXES = ['/professor', '/student']

export function isUuid(segment: string): boolean {
  return UUID_RE.test(segment)
}

export const config = {
  matcher: [
    '/((?!_next/|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot|map)).*)',
  ],
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl

  // ---------------------------------------------------------------------------
  // 1. UUID→slug redirect
  // Only fires on /professor/courses/{segment} and /student/courses/{segment}.
  // ---------------------------------------------------------------------------
  const parts = pathname.split('/')
  // parts: ['', role, 'courses', courseSegment, ...]
  if (
    parts.length >= 4 &&
    parts[2] === 'courses' &&
    (parts[1] === 'professor' || parts[1] === 'student') &&
    isUuid(parts[3])
  ) {
    const role = parts[1] as 'professor' | 'student'
    const uuid = parts[3]

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let displaySlug: string | null = null
    if (role === 'professor') {
      const { data } = await supabase
        .from('courses')
        .select('display_slug')
        .eq('id', uuid)
        .maybeSingle()
      displaySlug = (data as { display_slug: string } | null)?.display_slug ?? null
    } else {
      const { data } = await supabase
        .from('course_instances')
        .select('display_slug')
        .eq('id', uuid)
        .maybeSingle()
      displaySlug = (data as { display_slug: string } | null)?.display_slug ?? null
    }

    if (displaySlug) {
      parts[3] = displaySlug
      const redirectUrl = req.nextUrl.clone()
      redirectUrl.pathname = parts.join('/')
      return NextResponse.redirect(redirectUrl, { status: 308 })
    }
    // UUID not found → fall through to auth gate, page handles 404.
  }

  // ---------------------------------------------------------------------------
  // 2. Auth gate
  // ---------------------------------------------------------------------------
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
