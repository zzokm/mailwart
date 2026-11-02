"use server"

import { revalidatePath } from "next/cache"
import { requireAdminSession } from "@/lib/auth/session"
import {
  createMcpApiKey,
  listMcpApiKeys,
  revokeMcpApiKey,
  type GeneratedMcpApiKey,
  type SafeMcpApiKey,
} from "@/lib/db/mcp-keys"
import type { ActionResult } from "@/lib/stalwart/types"
import { okResult, failResult } from "./result"
import { recordAudit } from "@/lib/audit"

export async function listMcpApiKeysAction(): Promise<ActionResult<SafeMcpApiKey[]>> {
  try {
    await requireAdminSession()
    const keys = await listMcpApiKeys()
    return okResult(keys)
  } catch (err) {
    return failResult(err)
  }
}

export async function createMcpApiKeyAction(
  name: string
): Promise<ActionResult<GeneratedMcpApiKey>> {
  try {
    const session = await requireAdminSession()
    const trimmed = name?.trim()
    if (!trimmed) {
      return failResult(new Error("API Key name is required."))
    }

    const keyRecord = await createMcpApiKey(trimmed, session.username || "admin")

    await recordAudit({
      action: "mcp.key_create",
      actor: session.username || "admin",
      target: keyRecord.name,
      meta: { keyId: keyRecord.id, prefix: keyRecord.prefix },
    })

    revalidatePath("/dashboard/settings")
    return okResult(keyRecord)
  } catch (err) {
    return failResult(err)
  }
}

export async function revokeMcpApiKeyAction(
  id: string
): Promise<ActionResult<{ revoked: boolean }>> {
  try {
    const session = await requireAdminSession()
    if (!id?.trim()) {
      return failResult(new Error("Key ID is required."))
    }

    const success = await revokeMcpApiKey(id)

    await recordAudit({
      action: "mcp.key_revoke",
      actor: session.username || "admin",
      target: id,
    })

    revalidatePath("/dashboard/settings")
    return okResult({ revoked: success })
  } catch (err) {
    return failResult(err)
  }
}
