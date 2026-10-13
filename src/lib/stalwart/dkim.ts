import "server-only"

import { jmapCall, responseById } from "./client"

export type StalwartDkimInfo = {
  id: string
  selector: string
  keyType: "rsa" | "ed25519"
  publicKey: string
  dnsName: string
  dnsValue: string
}

/**
 * Fetch active DKIM signatures generated and used by Stalwart for a specific domain.
 * Stalwart automatically signs outbound emails using these selectors and keys.
 */
export async function getStalwartDkimSignaturesForDomain(
  domainName: string
): Promise<StalwartDkimInfo[]> {
  const target = domainName.trim().toLowerCase()
  if (!target) return []

  try {
    // 1. Query domain ID
    const dq = await jmapCall(
      [
        [
          "x:Domain/query",
          { filter: { name: target } },
          "dq0",
        ],
      ],
      { timeoutMs: 5000, retry: true }
    )
    const domainIds = (responseById(dq, "dq0").ids as string[]) ?? []
    if (domainIds.length === 0) return []
    const domainId = domainIds[0]

    // 2. Query all DKIM signatures for this domain
    const sq = await jmapCall(
      [
        [
          "x:DkimSignature/query",
          { filter: { domainId } },
          "sq0",
        ],
      ],
      { timeoutMs: 5000, retry: true }
    )
    const sigIds = (responseById(sq, "sq0").ids as string[]) ?? []
    if (sigIds.length === 0) return []

    // 3. Get DKIM signature details
    const sg = await jmapCall(
      [
        [
          "x:DkimSignature/get",
          { ids: sigIds },
          "sg0",
        ],
      ],
      { timeoutMs: 5000, retry: true }
    )
    const list =
      (responseById(sg, "sg0").list as Array<Record<string, unknown>>) ?? []

    const results: StalwartDkimInfo[] = []
    for (const item of list) {
      const stage = String(item.stage ?? "").toLowerCase()
      if (stage && stage !== "active") continue

      const selector = String(item.selector ?? "").trim()
      const publicKey = String(item.publicKey ?? "").trim()
      const rawType = String(item["@type"] ?? "")
      const isEd = rawType.toLowerCase().includes("ed25519")
      const keyType = isEd ? ("ed25519" as const) : ("rsa" as const)

      if (selector && publicKey) {
        const dnsName = `${selector}._domainkey.${target}`
        const dnsValue = isEd
          ? `v=DKIM1; k=ed25519; p=${publicKey}`
          : `v=DKIM1; k=rsa; p=${publicKey}`

        results.push({
          id: String(item.id ?? ""),
          selector,
          keyType,
          publicKey,
          dnsName,
          dnsValue,
        })
      }
    }

    return results
  } catch (err) {
    console.error(`[stalwart-dkim] Failed to fetch signatures for ${target}:`, err)
    return []
  }
}
