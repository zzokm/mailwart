import type { StalwartAccount, StalwartDomain } from "./types"

/** Normalize emails field from Account/get (array | dict | objects). */
export function collectEmailCandidates(account: {
  name?: string
  description?: string
  emails?: unknown
  domainId?: string
}): string[] {
  const candidates = new Set<string>()
  const desc = account.description ?? ""
  if (desc.includes("@")) {
    candidates.add(desc.toLowerCase())
  }

  const emails = account.emails
  if (Array.isArray(emails)) {
    for (const e of emails) {
      if (typeof e === "string" && e.includes("@")) {
        candidates.add(e.toLowerCase())
      } else if (e && typeof e === "object" && "email" in e) {
        const v = (e as { email?: string }).email
        if (v?.includes("@")) candidates.add(v.toLowerCase())
      }
    }
  } else if (emails && typeof emails === "object") {
    for (const v of Object.values(emails as Record<string, unknown>)) {
      if (typeof v === "string" && v.includes("@")) {
        candidates.add(v.toLowerCase())
      } else if (v && typeof v === "object" && "email" in v) {
        const email = (v as { email?: string }).email
        if (email?.includes("@")) candidates.add(email.toLowerCase())
      }
    }
  }

  return [...candidates]
}

export function resolveAccountEmail(
  account: {
    id: string
    name?: string
    description?: string
    emails?: unknown
    domainId?: string
  },
  domainsById: Map<string, StalwartDomain>
): { email: string; domainName?: string } {
  const candidates = collectEmailCandidates(account)
  const domain = account.domainId
    ? domainsById.get(account.domainId)
    : undefined

  if (domain?.name && account.name) {
    const reconstructed = `${account.name}@${domain.name}`.toLowerCase()
    return { email: reconstructed, domainName: domain.name }
  }

  if (candidates.length > 0) {
    const first = candidates[0]
    const at = first.indexOf("@")
    return {
      email: first,
      domainName: at > 0 ? first.slice(at + 1) : domain?.name,
    }
  }

  if (account.description) {
    return { email: account.description, domainName: domain?.name }
  }

  return {
    email: account.name ?? account.id,
    domainName: domain?.name,
  }
}

export function hydrateAccounts(
  raw: Array<Record<string, unknown>>,
  domains: StalwartDomain[]
): StalwartAccount[] {
  const domainsById = new Map(domains.map((d) => [d.id, d]))
  return raw.map((item) => {
    const base = {
      id: String(item.id),
      name: String(item.name ?? ""),
      description:
        typeof item.description === "string" ? item.description : undefined,
      domainId: typeof item.domainId === "string" ? item.domainId : undefined,
      emails: item.emails,
      quotas:
        item.quotas && typeof item.quotas === "object"
          ? (item.quotas as Record<string, unknown>)
          : undefined,
      aliases: (item.aliases as StalwartAccount["aliases"]) ?? null,
      roles: item.roles,
    }
    const { email, domainName } = resolveAccountEmail(base, domainsById)
    const isAdmin =
      email.toLowerCase().startsWith("admin@") ||
      (item.roles !== undefined &&
        JSON.stringify(item.roles).toLowerCase().includes("admin"))

    return {
      ...base,
      email,
      domainName,
      isAdmin,
    }
  })
}

export function parseEmailAddress(email: string): {
  local: string
  domain: string
} | null {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at <= 0 || at === trimmed.length - 1) return null
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (!/^[a-z0-9._+-]+$/i.test(local)) return null
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null
  return { local, domain }
}
