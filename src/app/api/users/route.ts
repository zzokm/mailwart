import { NextResponse } from "next/server"

import { recordAudit } from "@/lib/audit"
import { requireAdminSession, sessionActor } from "@/lib/auth/session"
import { initDatabase } from "@/lib/db"
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
} from "@/lib/db/users"
import { zodIssuesMessage } from "@/lib/validations/common"
import {
  createUserSchema,
  deleteUserSchema,
} from "@/lib/validations/users"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAdminSession()
    await initDatabase()
    const users = await listUsers()
    return NextResponse.json({ ok: true, users })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list users."
    return NextResponse.json({ ok: false, error: message }, { status: 401 })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminSession()
    await initDatabase()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 })
    }

    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: zodIssuesMessage(parsed.error) },
        { status: 400 }
      )
    }

    const { username, email, password, role } = parsed.data

    const newUser = await createUser({
      username,
      email,
      password,
      role,
    })

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "user.create",
      detail: `Created user ${newUser.username} (${newUser.email}) with role '${newUser.role}'`,
    })

    return NextResponse.json({ ok: true, user: newUser }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user."
    const status = message.toLowerCase().includes("unauthorized") ? 401 : 400
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAdminSession()
    await initDatabase()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 })
    }

    const parsed = deleteUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: zodIssuesMessage(parsed.error) },
        { status: 400 }
      )
    }

    const { userId } = parsed.data

    const targetUser = await findUserById(userId)
    if (!targetUser) {
      return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 })
    }

    if (session.userId === targetUser.id || session.username === targetUser.username) {
      return NextResponse.json(
        { ok: false, error: "You cannot delete your own account." },
        { status: 400 }
      )
    }

    if (targetUser.username === "yehia") {
      return NextResponse.json(
        { ok: false, error: "The primary admin account cannot be deleted." },
        { status: 400 }
      )
    }

    const deleted = await deleteUser(userId)
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "User could not be deleted." }, { status: 500 })
    }

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "user.destroy",
      detail: `Deleted user ${targetUser.username} (${targetUser.email})`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete user."
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
