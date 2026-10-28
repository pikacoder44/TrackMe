import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const ALLOWED_ORIGIN = 'http://localhost:5173'

function getCorsHeaders(origin: string | null) {
  // Support desktop client origin or any origin matching localhost:5173 / development
  const allowedOrigin = origin && (origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost:'))
    ? origin
    : ALLOWED_ORIGIN

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-id, x-organization-id',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export async function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/')

  if (isApi) {
    const corsHeaders = getCorsHeaders(request.headers.get('origin'))

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    const response = NextResponse.next()
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    return response
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}

