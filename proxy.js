import { NextResponse } from 'next/server'

const holidaysCache = { year: null, data: null, fetchedAt: 0 }

function parseTestDate(request) {
  try {
    const url = request.nextUrl
    const qp = url.searchParams.get('testDate')
    const hdr = request.headers.get('x-test-date')
    const raw = qp || hdr
    if (!raw) return null
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    return d
  } catch (e) { return null }
}

function isGodMode(request) {
  const qp = request.nextUrl.searchParams.get('godMode')
  const hdr = request.headers.get('x-god-mode')
  return qp === 'true' || hdr === 'true'
}

async function fetchHolidaysForYear(year) {
  const nowTs = Date.now()
  const CACHE_TTL = 1000 * 60 * 60 * 12
  if (holidaysCache.year === year && holidaysCache.data && (nowTs - holidaysCache.fetchedAt) < CACHE_TTL) {
    return holidaysCache.data
  }
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`)
    if (!res.ok) return null
    const data = await res.json()
    holidaysCache.year = year
    holidaysCache.data = data
    holidaysCache.fetchedAt = nowTs
    return data
  } catch (e) { return null }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl

  // 1. ALWAYS ALLOW ASSETS AND SYSTEM ROUTES
  if (
    pathname.startsWith('/imgs') || 
    pathname.startsWith('/_next') || 
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api')
  ) {
    return NextResponse.next()
  }

  // 2. PREVENT REDIRECT LOOPS
  if (pathname === '/closed') {
    return NextResponse.next()
  }

  const isProd = process.env.NODE_ENV === 'production'
  
  // 3. GOD MODE BYPASS
  if (!isProd && isGodMode(request)) {
    return NextResponse.next()
  }

  let now = new Date()
  if (!isProd) {
    const test = parseTestDate(request)
    if (test) now = test
  }

  const argTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const day = argTime.getDay()
  const hour = argTime.getHours()

  let blocked = day === 6 || day === 0 || (day === 5 && hour >= 15) || (hour >= 18 || hour < 6)

  // 4. HOLIDAY CHECK
  try {
    const year = now.getFullYear()
    const holidays = await fetchHolidaysForYear(year)
    if (Array.isArray(holidays)) {
      const today = now.toISOString().slice(0, 10)
      for (const h of holidays) {
        if (h?.fecha?.toString().startsWith(today)) {
          blocked = true
          break
        }
      }
    }
  } catch (e) {}

  if (blocked) {
    const url = request.nextUrl.clone()
    url.pathname = '/closed'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
