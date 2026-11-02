import { NextResponse } from "next/server"
import { checkAllMailboxesQuota } from "@/lib/quota/quota-monitor"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const summary = await checkAllMailboxesQuota()
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), summary })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

export async function POST() {
  return GET()
}
