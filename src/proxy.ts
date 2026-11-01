import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware'

const ALLOWED_ORIGIN = 'http://localhost:5173'

function getCorsHeaders(origin: string | null) {
  // Support browser extension origins (chrome-extension://, moz-extension://) and localhost development
  const isAllowed =
    origin &&
    (origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://') ||
      origin.startsWith('http://localhost:') ||
      origin === ALLOWED_ORIGIN)

  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGIN

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-id, x-organization-id',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isApi = pathname.startsWith('/api/')

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

  const { supabaseResponse, supabase, user } = await createMiddlewareClient(request)

  // RBAC Middleware: Restrict /dashboard strictly to users with roles owner, admin, or manager
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, approval_status')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    const role = membership?.role
    const isManagerRole = role && ['owner', 'admin', 'manager'].includes(role)

    // If regular employee attempts to visit /dashboard, redirect to /install
    if (!isManagerRole) {
      return NextResponse.redirect(new URL('/install', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}

