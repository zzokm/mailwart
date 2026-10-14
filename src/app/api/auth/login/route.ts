import { NextResponse, type NextRequest } from "next/server"
import { loginAction } from "@/lib/actions/auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const result = await loginAction(body)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Authentication failed." },
      { status: 500 }
    )
  }
}
