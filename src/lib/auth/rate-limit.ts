/**
 * In-memory login rate limit: 5 failed attempts / 15 minutes / IP.
 * Fine for single-node; Redis only if multi-instance later.
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function prune(now: number) {
  if (buckets.size < 500) return
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

export function getLoginRateLimitStatus(ip: string): {
  limited: boolean
  retryAfterSec: number
} {
  const now = Date.now()
  prune(now)
  const bucket = buckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    return { limited: false, retryAfterSec: 0 }
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }
  return { limited: false, retryAfterSec: 0 }
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now()
  const bucket = buckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  bucket.count += 1
}

export function clearLoginFailures(ip: string): void {
  buckets.delete(ip)
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return headers.get("x-real-ip")?.trim() || "unknown"
}
