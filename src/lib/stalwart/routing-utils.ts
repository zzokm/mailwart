import type {
  CatchAllMode,
  EmailAliasEntry,
  MailExchangerMode,
  StalwartDomain,
} from "./types"

/** Parse Stalwart Account.aliases (array | map) into a stable list. */
export function parseEmailAliases(
  raw: unknown,
  domainsById: Map<string, StalwartDomain>
): EmailAliasEntry[] {
  if (raw == null) return []

  const entries: Array<{ key: string; value: Record<string, unknown> }> = []

  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      if (typeof item === "string") {
        const at = item.indexOf("@")
        if (at > 0) {
          entries.push({
            key: String(i),
            value: { name: item.slice(0, at), domainId: item.slice(at + 1), email: item },
          })
        } else {
          entries.push({
            key: String(i),
            value: { name: item },
          })
        }
      } else if (item && typeof item === "object") {
        entries.push({
          key: String(i),
          value: item as Record<string, unknown>,
        })
      }
    })
  } else if (typeof raw === "object") {
    for (const [key, value] of Object.entries(
      raw as Record<string, unknown>
    )) {
      if (typeof value === "string") {
        const at = value.indexOf("@")
        if (at > 0) {
          entries.push({
            key,
            value: { name: value.slice(0, at), domainId: value.slice(at + 1), email: value },
          })
        } else {
          entries.push({ key, value: { name: value } })
        }
      } else if (value && typeof value === "object") {
        entries.push({ key, value: value as Record<string, unknown> })
      }
    }
  }

  const out: EmailAliasEntry[] = []
  for (const { key, value } of entries) {
    const name = typeof value.name === "string" ? value.name : ""
    const domainId = typeof value.domainId === "string" ? value.domainId : ""

    let domain = domainsById.get(domainId)
    if (!domain && domainId) {
      domain = Array.from(domainsById.values()).find(
        (d) => d.name.toLowerCase() === domainId.toLowerCase()
      )
    }
    if (!domain && typeof value.email === "string" && value.email.includes("@")) {
      const emailDomain = value.email.split("@")[1].toLowerCase()
      domain = Array.from(domainsById.values()).find(
        (d) => d.name.toLowerCase() === emailDomain
      )
    }

    const email =
      typeof value.email === "string"
        ? value.email.toLowerCase()
        : domain?.name && name
          ? `${name}@${domain.name}`.toLowerCase()
          : undefined

    if (!email && !name) continue

    out.push({
      key,
      name: name || (email ? email.split("@")[0] : ""),
      domainId: domain?.id || domainId,
      enabled: value.enabled !== false,
      description:
        typeof value.description === "string"
          ? value.description
          : undefined,
      email,
    })
  }
  return out
}

/**
 * Serialize alias entries to a map Stalwart Account/set accepts.
 * Pass `previousKeys` to null out removed indices on update.
 */
export function serializeEmailAliases(
  aliases: EmailAliasEntry[],
  previousKeys: string[] = []
): Record<string, Record<string, unknown> | null> {
  const out: Record<string, Record<string, unknown> | null> = {}
  const used = new Set<string>()
  aliases.forEach((a, i) => {
    const key = a.key && /^\d+$/.test(a.key) ? a.key : String(i)
    used.add(key)
    out[key] = {
      enabled: a.enabled,
      name: a.name,
      domainId: a.domainId,
      description: a.description ?? null,
    }
  })
  for (const key of previousKeys) {
    if (!used.has(key)) out[key] = null
  }
  return out
}

export function deriveCatchAllMode(
  domain: Pick<StalwartDomain, "catchAllAddress" | "catchAllMode">
): CatchAllMode {
  if (domain.catchAllMode === "blackhole" && !domain.catchAllAddress) {
    return "blackhole"
  }
  if (domain.catchAllAddress) return "address"
  if (domain.catchAllMode === "bounce") return "bounce"
  return "bounce"
}

export function catchAllLabel(
  domain: Pick<StalwartDomain, "catchAllAddress" | "catchAllMode">
): string {
  const mode = deriveCatchAllMode(domain)
  if (mode === "address" && domain.catchAllAddress) return domain.catchAllAddress
  if (mode === "blackhole") return "blackhole"
  return "bounce"
}

export function deriveMailExchanger(
  domain: Pick<StalwartDomain, "allowRelaying" | "mailExchanger">
): MailExchangerMode {
  if (domain.mailExchanger) return domain.mailExchanger
  return domain.allowRelaying ? "backup" : "local"
}

export function mailExchangerToAllowRelaying(
  mode: MailExchangerMode
): boolean {
  return mode !== "local"
}

export function isExternalEmail(
  email: string,
  knownDomains: Set<string>
): boolean {
  const at = email.lastIndexOf("@")
  if (at <= 0) return true
  const domain = email.slice(at + 1).toLowerCase()
  return !knownDomains.has(domain)
}

export function validateForwardTargets(
  targets: string[],
  knownEmails: Set<string>,
  knownDomains: Set<string>
): { ok: true } | { ok: false; error: string } {
  if (targets.length === 0) {
    return { ok: false, error: "Add at least one forward target." }
  }
  for (const raw of targets) {
    const t = raw.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
      return { ok: false, error: `Invalid target address: ${raw}` }
    }
    if (!isExternalEmail(t, knownDomains) && !knownEmails.has(t)) {
      return {
        ok: false,
        error: `Internal target ${t} must exist as a mailbox.`,
      }
    }
  }
  return { ok: true }
}
