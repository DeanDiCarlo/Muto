// =============================================================================
// DEV-ONLY logout endpoint.
// Clears the dev session cookie and redirects to /login.
// REPLACE BEFORE PRODUCTION (real SSO sign-out flow).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { DEV_USER_COOKIE } from '@/lib/auth'

export function GET(req: NextRequest) {
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  const res = NextResponse.redirect(url)
  res.cookies.delete(DEV_USER_COOKIE)
  return res
}
