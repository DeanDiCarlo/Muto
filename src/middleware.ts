import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Matches a full RFC-4122 UUID (lowercase or uppercase).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(segment: string): boolean {
  return UUID_RE.test(segment)
}

// Only run on dashboard course routes; everything else is skipped before the
// middleware even executes.
export const config = {
  matcher: ['/professor/courses/:path*', '/student/courses/:path*'],
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  // Split path. pathname always starts with '/', so parts[0] === ''.
  // Example: '/professor/courses/{uuid}/labs/{slug}'
  //           ['', 'professor', 'courses', '{uuid}', 'labs', '{slug}']
  const parts = pathname.split('/')
  const courseSegment = parts[3] // segment immediately after /courses/

  // Not a UUID → already slug-based or empty, pass through to avoid loops.
  if (!courseSegment || !isUuid(courseSegment)) {
    return NextResponse.next()
  }

  const role = parts[1] as 'professor' | 'student'

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
      .eq('id', courseSegment)
      .maybeSingle()
    displaySlug = (data as { display_slug: string } | null)?.display_slug ?? null
  } else {
    const { data } = await supabase
      .from('course_instances')
      .select('display_slug')
      .eq('id', courseSegment)
      .maybeSingle()
    displaySlug = (data as { display_slug: string } | null)?.display_slug ?? null
  }

  // UUID not found in DB → let the page handle the 404 naturally.
  if (!displaySlug) {
    return NextResponse.next()
  }

  // Replace the UUID segment with display_slug and issue a 308 (permanent)
  // redirect so browsers and crawlers update bookmarks/indexes.
  parts[3] = displaySlug
  const redirectUrl = req.nextUrl.clone()
  redirectUrl.pathname = parts.join('/')
  return NextResponse.redirect(redirectUrl, { status: 308 })
}
