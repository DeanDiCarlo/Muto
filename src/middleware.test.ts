import { isUuid } from './middleware'
import { NextRequest, NextResponse } from 'next/server'
import middleware from './middleware'

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

describe('middleware — pass-through', () => {
  test('passes through when course segment is already a slug', async () => {
    const req = new NextRequest('http://localhost/professor/courses/intro-quantum/labs/bell-states') as unknown as Parameters<typeof middleware>[0]
    const res = await middleware(req)
    expect(res).toBeInstanceOf(NextResponse)
    // No redirect URL → NextResponse.next() was returned.
    expect((res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()).toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('passes through for student route with slug segment', async () => {
    const req = new NextRequest('http://localhost/student/courses/s26-section-ac/labs/bell-states') as unknown as Parameters<typeof middleware>[0]
    const res = await middleware(req)
    expect((res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()).toBeUndefined()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// middleware — UUID redirect (professor route)
// ---------------------------------------------------------------------------

describe('middleware — professor UUID redirect', () => {
  const UUID = '123e4567-e89b-12d3-a456-426614174000'

  test('308 redirects UUID to display_slug on professor route', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { display_slug: 'intro-quantum' }, error: null })

    const req = new NextRequest(`http://localhost/professor/courses/${UUID}/labs/bell-states`) as unknown as Parameters<typeof middleware>[0]
    const res = await middleware(req)
    const redirectUrl = (res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()

    expect(redirectUrl).toContain('/professor/courses/intro-quantum/labs/bell-states')
    expect(res.status).toBe(308)
    expect(mockFrom).toHaveBeenCalledWith('courses')
  })

  test('passes through when UUID not found in DB', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const req = new NextRequest(`http://localhost/professor/courses/${UUID}`) as unknown as Parameters<typeof middleware>[0]
    const res = await middleware(req)
    expect((res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// middleware — UUID redirect (student route)
// ---------------------------------------------------------------------------

describe('middleware — student UUID redirect', () => {
  const UUID = '223e4567-e89b-12d3-a456-426614174001'

  test('308 redirects UUID to display_slug on student route', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { display_slug: 's26-section-ac' }, error: null })

    const req = new NextRequest(`http://localhost/student/courses/${UUID}/labs/bell-states`) as unknown as Parameters<typeof middleware>[0]
    const res = await middleware(req)
    const redirectUrl = (res as unknown as { redirectUrl: () => string | undefined }).redirectUrl()

    expect(redirectUrl).toContain('/student/courses/s26-section-ac/labs/bell-states')
    expect(res.status).toBe(308)
    expect(mockFrom).toHaveBeenCalledWith('course_instances')
  })
})
