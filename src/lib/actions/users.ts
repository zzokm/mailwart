"use server"

import { revalidatePath } from "next/cache"

import { recordAudit } from "@/lib/audit"
import {
  getSession,
  requireAdminSession,
  requireSession,
  sessionActor,
} from "@/lib/auth/session"
import {
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  type SafeUser,
} from "@/lib/db/users"
import { initDatabase } from "@/lib/db"
import { zodIssuesMessage } from "@/lib/validations/common"
import {
  createUserSchema,
  deleteUserSchema,
  type CreateUserInput,
  type DeleteUserInput,
} from "@/lib/validations/users"

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

export async function listUsersAction(): Promise<ActionResult<SafeUser[]>> {
  try {
    await requireAdminSession()
    await initDatabase()
    const users = await listUsers()
    return { ok: true, data: users }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list users."
    return { ok: false, error: message }
  }
}

export async function createUserAction(
  rawInput: CreateUserInput
): Promise<ActionResult<SafeUser>> {
  try {
    await requireAdminSession()
    await initDatabase()
    const parsed = createUserSchema.safeParse(rawInput)
    if (!parsed.success) {
      return { ok: false, error: zodIssuesMessage(parsed.error) }
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

    revalidatePath("/dashboard/settings")
    return { ok: true, data: newUser }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create user."
    return { ok: false, error: message }
  }
}

export async function deleteUserAction(
  rawInput: DeleteUserInput
): Promise<ActionResult> {
  try {
    const session = await requireAdminSession()
    const parsed = deleteUserSchema.safeParse(rawInput)
    if (!parsed.success) {
      return { ok: false, error: zodIssuesMessage(parsed.error) }
    }

    const userId = (parsed.data.userId || parsed.data.id)!

    const targetUser = await findUserById(userId)
    if (!targetUser) {
      return { ok: false, error: "User not found." }
    }

    // Safety checks: Cannot delete self
    if (session.userId === targetUser.id || session.username === targetUser.username) {
      return { ok: false, error: "You cannot delete your own account." }
    }

    // Safety check: Cannot delete the primary admin account 'yehia'
    if (targetUser.username === "yehia") {
      return { ok: false, error: "The primary admin account cannot be deleted." }
    }

    const deleted = await deleteUser(userId)
    if (!deleted) {
      return { ok: false, error: "User could not be deleted." }
    }

    const actor = await sessionActor()
    await recordAudit({
      actor,
      action: "user.destroy",
      detail: `Deleted user ${targetUser.username} (${targetUser.email})`,
    })

    revalidatePath("/dashboard/settings")
    return { ok: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete user."
    return { ok: false, error: message }
  }
}

export async function getCurrentUserAction(): Promise<ActionResult<{
  userId?: string
  username?: string
  email?: string
  role?: string
  impersonatingFrom?: {
    userId: string
    username: string
    role: "admin"
  }
}>> {
  try {
    const session = await requireSession()
    return {
      ok: true,
      data: {
        userId: session.userId,
        username: session.username,
        email: session.email,
        role: session.role,
        impersonatingFrom: session.impersonatingFrom,
      },
    }
  } catch {
    return { ok: false, error: "Unauthenticated" }
  }
}

export async function impersonateUserAction(
  targetUserId: string
): Promise<ActionResult<SafeUser>> {
  try {
    const session = await getSession()
    const isAdmin =
      session.role === "admin" || session.impersonatingFrom?.role === "admin"
    if (!isAdmin) {
      return { ok: false, error: "Only administrators can impersonate users." }
    }

    await initDatabase()
    const targetUser = await findUserById(targetUserId)
    if (!targetUser) {
      return { ok: false, error: "Target user not found." }
    }

    const originalAdmin = session.impersonatingFrom || {
      userId: session.userId || "",
      username: session.username || "yehia",
      role: "admin" as const,
    }

    session.impersonatingFrom = originalAdmin
    session.userId = targetUser.id
    session.username = targetUser.username
    session.email = targetUser.email
    session.role = targetUser.role
    await session.save()

    const actor = originalAdmin.username
    await recordAudit({
      actor,
      action: "user.impersonate",
      detail: `Admin ${actor} switched to user ${targetUser.username} (${targetUser.email})`,
    })

    revalidatePath("/", "layout")
    return { ok: true, data: targetUser }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to switch to user."
    return { ok: false, error: message }
  }
}

export async function stopImpersonatingAction(): Promise<ActionResult> {
  try {
    const session = await getSession()
    if (!session.impersonatingFrom) {
      return { ok: false, error: "Not currently impersonating any user." }
    }

    const originalAdmin = session.impersonatingFrom
    const impersonatedUser = session.username

    session.userId = originalAdmin.userId
    session.username = originalAdmin.username
    session.role = originalAdmin.role
    delete session.impersonatingFrom
    await session.save()

    await recordAudit({
      actor: originalAdmin.username,
      action: "user.stop_impersonate",
      detail: `Admin ${originalAdmin.username} exited impersonation of ${impersonatedUser}`,
    })

    revalidatePath("/", "layout")
    return { ok: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to exit impersonation."
    return { ok: false, error: message }
  }
}
