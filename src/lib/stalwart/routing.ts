import "server-only"

import { jmapCall, responseById } from "./client"
import { formatSetFailure, StalwartError } from "./errors"

export {
  parseEmailAliases,
  serializeEmailAliases,
  deriveCatchAllMode,
  catchAllLabel,
  deriveMailExchanger,
  mailExchangerToAllowRelaying,
  isExternalEmail,
  validateForwardTargets,
} from "./routing-utils"

/** Live update of domain routing fields (catch-all + allowRelaying). */
export async function updateDomainRouting(
  id: string,
  patch: Partial<{
    catchAllAddress: string | null
    allowRelaying: boolean
  }>
): Promise<void> {
  const r = await jmapCall([
    ["x:Domain/set", { update: { [id]: patch } }, "r0"],
  ])
  const body = responseById(r, "r0")
  const notUpdated = body.notUpdated as
    | Record<string, { type?: string; description?: string }>
    | undefined
  if (notUpdated?.[id]) {
    throw new StalwartError(formatSetFailure(notUpdated, id), "jmap", notUpdated)
  }
}

/** Live replace of account aliases (probe shape: map of EmailAlias). */
export async function updateAccountAliases(
  id: string,
  aliases: Record<string, Record<string, unknown> | null>
): Promise<void> {
  const r = await jmapCall([
    ["x:Account/set", { update: { [id]: { aliases } } }, "r1"],
  ])
  const body = responseById(r, "r1")
  const notUpdated = body.notUpdated as
    | Record<string, { type?: string; description?: string }>
    | undefined
  if (notUpdated?.[id]) {
    throw new StalwartError(formatSetFailure(notUpdated, id), "jmap", notUpdated)
  }
}
