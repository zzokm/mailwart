import "server-only"

import { generateKeyPairSync } from "node:crypto"

import type {
  DkimGeneratedRecord,
  DmarcGeneratedRecord,
} from "@/lib/stalwart/types"

function pemToDnsPublicKey(publicKeyPem: string): string {
  const b64 = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "")
  // DKIM p= wants the SubjectPublicKeyInfo RSA bit string; many operators
  // publish the SPKI DER base64 (OpenSSL -pubout). Stalwart / common tooling
  // accept this form. Strip SPKI wrapper is optional for operator paste.
  return b64
}

/** Generate an RSA-2048 DKIM keypair and copy-paste DNS strings. */
export function generateDkimRecord(input: {
  domain: string
  selector?: string
}): DkimGeneratedRecord {
  const domain = input.domain.trim().toLowerCase()
  const selector = (input.selector?.trim() || "mailwart").toLowerCase()

  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })

  const p = pemToDnsPublicKey(publicKey)
  const dnsName = `${selector}._domainkey.${domain}`
  const dnsValue = `v=DKIM1; k=rsa; p=${p}`
  const zoneLine = `${dnsName}. IN TXT "${dnsValue}"`

  return {
    selector,
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    dnsName,
    dnsType: "TXT",
    dnsValue,
    zoneLine,
  }
}

/** Build a DMARC TXT record string (no zone write — paste only). */
export function generateDmarcRecord(input: {
  domain: string
  policy?: "none" | "quarantine" | "reject"
  rua?: string
  ruf?: string
}): DmarcGeneratedRecord {
  const domain = input.domain.trim().toLowerCase()
  const policy = input.policy ?? "quarantine"
  const parts = [`v=DMARC1`, `p=${policy}`, `adkim=r`, `aspf=r`]
  if (input.rua?.trim()) {
    parts.push(`rua=mailto:${input.rua.trim()}`)
  } else {
    parts.push(`rua=mailto:dmarc@${domain}`)
  }
  if (input.ruf?.trim()) {
    parts.push(`ruf=mailto:${input.ruf.trim()}`)
  }

  const dnsName = `_dmarc.${domain}`
  const dnsValue = parts.join("; ")
  const zoneLine = `${dnsName}. IN TXT "${dnsValue}"`

  return {
    policy,
    dnsName,
    dnsType: "TXT",
    dnsValue,
    zoneLine,
  }
}

/** Suggested SPF TXT for paste (advisory — match outbound path). */
export function generateSpfRecord(input: {
  domain: string
  mailHost?: string
  include?: string
}): { dnsName: string; dnsValue: string; zoneLine: string } {
  const domain = input.domain.trim().toLowerCase()
  const mechanisms = ["v=spf1", "mx"]
  if (input.mailHost?.trim()) {
    mechanisms.push(`a:${input.mailHost.trim().toLowerCase()}`)
  }
  if (input.include?.trim()) {
    mechanisms.push(`include:${input.include.trim().toLowerCase()}`)
  }
  mechanisms.push("~all")
  const dnsValue = mechanisms.join(" ")
  return {
    dnsName: domain,
    dnsValue,
    zoneLine: `${domain}. IN TXT "${dnsValue}"`,
  }
}
