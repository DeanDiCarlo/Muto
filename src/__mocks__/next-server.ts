// Minimal stubs for next/server used in middleware unit tests.
// Only the surface area that src/middleware.ts touches is implemented.

export class NextURL {
  pathname: string
  private _search: string

  constructor(url: string, base?: string) {
    const full = base ? new URL(url, base) : new URL(url)
    this.pathname = full.pathname
    this._search = full.search
  }

  clone(): NextURL {
    return new NextURL(this.toString())
  }

  toString(): string {
    return `http://localhost${this.pathname}${this._search}`
  }
}

export class NextRequest {
  nextUrl: NextURL

  constructor(url: string) {
    this.nextUrl = new NextURL(url)
  }
}

export class NextResponse {
  status: number
  headers: Map<string, string>
  private _redirectUrl?: string

  constructor(body?: null, init?: { status?: number }) {
    this.status = init?.status ?? 200
    this.headers = new Map()
  }

  static next(): NextResponse {
    return new NextResponse(null, { status: 200 })
  }

  static redirect(url: NextURL | URL | string, init?: { status?: number } | number): NextResponse {
    const res = new NextResponse(null, {
      status: typeof init === 'number' ? init : init?.status ?? 307,
    })
    res._redirectUrl = url.toString()
    return res
  }

  redirectUrl(): string | undefined {
    return this._redirectUrl
  }
}
