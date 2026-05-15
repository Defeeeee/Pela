import { proxy } from './proxy'

export async function middleware(request) {
  return await proxy(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - imgs (public images)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|imgs).*)',
  ],
}
