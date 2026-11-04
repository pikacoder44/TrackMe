import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@/lib/supabase/middleware'
import { getRoleHome, resolveUserSystemRole } from '@/lib/auth-rbac'

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

  // Handle CORS for API routes
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

  // Consolidate legacy /signup into /register
  if (pathname === '/signup') {
    return NextResponse.redirect(new URL('/register', request.url))
  }

  const { supabaseResponse, supabase, user } = await createMiddlewareClient(request)

  // Redirect logged-in users visiting /login or /register to their designated role portal
  if (user && (pathname === '/login' || pathname === '/register')) {
    const { role } = await resolveUserSystemRole(supabase, user)
    const destination = getRoleHome(role)
    return NextResponse.redirect(new URL(destination, request.url))
  }

  // Super Admin Portal RBAC: /admin or /admin/* restricted strictly to super_admin
  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { role } = await resolveUserSystemRole(supabase, user)
    if (role !== 'super_admin') {
      const destination = getRoleHome(role)
      return NextResponse.redirect(new URL(destination, request.url))
    }
  }

  // Manager / Employee Portal: /dashboard access
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
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
