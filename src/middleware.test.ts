import { isUuid, proxy } from './proxy'
import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js so no network calls are made.
// ---------------------------------------------------------------------------

const mockMaybeSingle = jest.fn()
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}))

jest.mock('@/lib/auth', () => ({ DEV_USER_COOKIE: 'muto-dev-user' }))

// Chain is re-created per call, so wire it up before each test.
beforeEach(() => {
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle, eq: mockEq } as unknown as ReturnType<typeof mockEq>)
  mockSelect.mockReturnValue({ eq: mockEq })
  mockFrom.mockReturnValue({ select: mockSelect })
})

afterEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// isUuid (pure)
// ---------------------------------------------------------------------------

describe('isUuid', () => {
  test('returns true for valid lowercase UUID', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true)
  })

  test('returns true for valid uppercase UUID', () => {
    expect(isUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(true)
  })

  test('returns false for slug', () => {
    expect(isUuid('intro-quantum-abc123')).toBe(false)
  })

  test('returns false for display slug', () => {
    expect(isUuid('s26-section-ac')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(isUuid('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// middleware — pass-through cases (no Supabase calls expected)
// ---------------------------------------------------------------------------

// Helper: build a request with a valid dev session so the auth gate passes through.
// The stub NextRequest is mutated directly to avoid hitting TypeScript's view
// of the real next/server NextRequest constructor signature.
function authed(url: string): Parameters<typeof proxy>[0] {
  const req = new NextRequest(url) as unknown as {
    nextUrl: { pathname: string; clone: () => unknown; split?: never }
    cookies: { get: (name: string) => { value: string } | undefined }
  }
  req.cookies = { get: (name) => (name === 'muto-dev-user' ? { value: 'test' } : undefined) }
  return req as unknown as Parameters<typeof proxy>[0]
}

describe('proxy — pass-through', () => {
  test('passes through when course segment is already a slug', async () => {
    const req = authed('http://localhost/professor/courses/intro-quantum/labs/bell-states')
    const res = await proxy(req)
    expect(res).toBeInstanceOf(NextResponse)
    // No redirect URL → NextResponse.next() was returned.
    expect((res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()).toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('passes through for student route with slug segment', async () => {
    const req = authed('http://localhost/student/courses/s26-section-ac/labs/bell-states')
    const res = await proxy(req)
    expect((res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()).toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// middleware — UUID redirect (professor route)
// ---------------------------------------------------------------------------

describe('proxy — professor UUID redirect', () => {
  const UUID = '123e4567-e89b-12d3-a456-426614174000'

  test('308 redirects UUID to display_slug on professor route', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { display_slug: 'intro-quantum' }, error: null })

    const req = new NextRequest(`http://localhost/professor/courses/${UUID}/labs/bell-states`) as unknown as Parameters<typeof proxy>[0]
    const res = await proxy(req)
    const redirectUrl = (res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()

    expect(redirectUrl).toContain('/professor/courses/intro-quantum/labs/bell-states')
    expect(res.status).toBe(308)
    expect(mockFrom).toHaveBeenCalledWith('courses')
  })

  test('falls through to auth gate when UUID not found in DB', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    // No session cookie → auth gate redirects to /login (expected behavior).
    const req = new NextRequest(`http://localhost/professor/courses/${UUID}`) as unknown as Parameters<typeof proxy>[0]
    const res = await proxy(req)
    const redirectUrl = (res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()
    expect(redirectUrl).toContain('/login')
  })
})

// ---------------------------------------------------------------------------
// middleware — UUID redirect (student route)
// ---------------------------------------------------------------------------

describe('proxy — student UUID redirect', () => {
  const UUID = '223e4567-e89b-12d3-a456-426614174001'

  test('308 redirects UUID to display_slug on student route', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { display_slug: 's26-section-ac' }, error: null })

    const req = new NextRequest(`http://localhost/student/courses/${UUID}/labs/bell-states`) as unknown as Parameters<typeof proxy>[0]
    const res = await proxy(req)
    const redirectUrl = (res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()

    expect(redirectUrl).toContain('/student/courses/s26-section-ac/labs/bell-states')
    expect(res.status).toBe(308)
    expect(mockFrom).toHaveBeenCalledWith('course_instances')
  })
})
