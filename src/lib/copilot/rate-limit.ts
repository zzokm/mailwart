/**
 * Per-session soft limit on Copilot LLM turns (Architecture §16.6).
 * In-memory; fine for single-node. Surfaces “slow down” via 429.
 */

export const COPILOT_RATE_WINDOW_MS = 15 * 60 * 1000
export const COPILOT_RATE_MAX_CALLS = 40

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

function prune(now: number) {
  if (buckets.size < 200) return
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

export function getCopilotRateLimitStatus(sessionKey: string): {
  limited: boolean
  retryAfterSec: number
  remaining: number
} {
  const now = Date.now()
  prune(now)
  const bucket = buckets.get(sessionKey)
  if (!bucket || now >= bucket.resetAt) {
    return {
      limited: false,
      retryAfterSec: 0,
      remaining: COPILOT_RATE_MAX_CALLS,
    }
  }
  if (bucket.count >= COPILOT_RATE_MAX_CALLS) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      remaining: 0,
    }
  }
  return {
    limited: false,
    retryAfterSec: 0,
    remaining: COPILOT_RATE_MAX_CALLS - bucket.count,
  }
}

/** Count one successful accept of a Copilot chat request. */
export function recordCopilotChatCall(sessionKey: string): void {
  const now = Date.now()
  prune(now)
  const bucket = buckets.get(sessionKey)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(sessionKey, { count: 1, resetAt: now + COPILOT_RATE_WINDOW_MS })
    return
  }
  bucket.count += 1
}
