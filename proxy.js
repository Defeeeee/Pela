import { NextResponse } from 'next/server'
// Simple in-memory cache for holidays per year (lives for the process lifetime)
const holidaysCache = { year: null, data: null, fetchedAt: 0 }

function parseTestDate(request) {
  // Allow test override via query param `testDate` or header `x-test-date` in non-production only
  try {
    const url = request.nextUrl
    const qp = url.searchParams.get('testDate')
    const hdr = request.headers.get('x-test-date')
    const raw = qp || hdr
    if (!raw) return null
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    return d
  } catch (e) {
    return null
  }
}

function isGodMode(request) {
  const qp = request.nextUrl.searchParams.get('godMode')
  const hdr = request.headers.get('x-god-mode')
  return qp === 'true' || hdr === 'true'
}

async function fetchHolidaysForYear(year) {
  const nowTs = Date.now()
  // cache for 12 hours
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
  } catch (e) {
    return null
  }
}

export async function proxy(request) {
  // By default use server date/time
  let now = new Date()

  // In non-production allow overriding the date/time for testing
  const isProd = process.env.NODE_ENV === 'production'
  if (!isProd) {
    const test = parseTestDate(request)
    if (test) now = test
  }

  // Normalize to Argentina time (GMT-3) for logic checks
  const argTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const day = argTime.getDay() // 0 = Sunday, 6 = Saturday
  const hour = argTime.getHours()

  // base blocked conditions: weekend, Friday after 15:00, or daily 18:00-06:00
  let blocked = day === 6 || day === 0 || (day === 5 && hour >= 15) || (hour >= 18 || hour < 6)

  // Bypass if God Mode is active
  if (!isProd && isGodMode(request)) {
    blocked = false
  }

  // Check Argentina holidays for the year of `now` and mark blocked if today is a holiday
  let matchedHoliday = null
  try {
    const year = now.getFullYear()
    const holidays = await fetchHolidaysForYear(year)
    if (Array.isArray(holidays)) {
      const today = now.toISOString().slice(0, 10) // YYYY-MM-DD
      for (const h of holidays) {
        if (!h || !h.fecha) continue
        // Some APIs return date-only strings; compare prefix
        if (h.fecha.toString().startsWith(today)) {
          matchedHoliday = h
          blocked = true
          break
        }
      }
    }
  } catch (e) {
    // ignore fetch errors and proceed with base behavior
  }

  // If requested, return JSON showing evaluation (dev-only)
  try {
    const show = request.nextUrl.searchParams.get('showEval')
    if (!isProd && show === 'true') {
      return NextResponse.json({ now: now.toISOString(), day, hour, blocked, matchedHoliday })
    }
  } catch (e) {}

  // Prevent redirect loops: if already on /closed, allow rendering the closed page
  const pathname = request.nextUrl.pathname
  if (blocked && pathname !== '/closed') {
    const url = request.nextUrl.clone()
    url.pathname = '/closed'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
