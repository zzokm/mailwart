"use server"

import { revalidatePath } from "next/cache"

import { recordAudit } from "@/lib/audit"
import {
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

    const { userId } = parsed.data

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
      },
    }
  } catch {
    return { ok: false, error: "Unauthenticated" }
  }
}
