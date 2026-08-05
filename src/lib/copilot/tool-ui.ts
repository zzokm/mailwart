/**
 * Client-safe readers for Copilot tool stream payloads.
 * Never imports the server registry — shapes come off the wire already sanitized.
 */

import { isAllowedDashboardHref } from "./tools/navigate"

export type CopilotNavIntent = { href: string; reason?: string }

export type CopilotAskOption = { label: string; value: string; hint?: string }

export type CopilotAskPrompt = {
  question: string
  options: CopilotAskOption[]
  allowFreeform: boolean
}

export type CopilotApprovalStub = { tool: string; message: string }

export type ToolSummary = { tone: "ok" | "error"; text: string }

const ACRONYMS: Record<string, string> = {
  dkim: "DKIM",
  dmarc: "DMARC",
  dns: "DNS",
  spf: "SPF",
  mx: "MX",
  csv: "CSV",
  id: "ID",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** `refresh_domain_dns` → `Refresh domain DNS` */
export function humanizeToolName(name: string): string {
  return name
    .split("_")
    .map((word, index) => {
      const acronym = ACRONYMS[word]
      if (acronym) return acronym
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1)
      return word
    })
    .join(" ")
}

/** Nav hrefs arrive either as `navigate` on any result or as a `navigate_to` result. */
export function readNavIntent(output: unknown): CopilotNavIntent | null {
  if (!isRecord(output)) return null

  const href =
    str(output.navigate) ??
    (output.status === "nav_intent" && output.ok === true
      ? str(output.href)
      : undefined)

  if (!href || !isAllowedDashboardHref(href)) return null
  return { href, reason: str(output.reason) }
}

export function readAskPrompt(value: unknown): CopilotAskPrompt | null {
  if (!isRecord(value)) return null
  const question = str(value.question)
  if (!question) return null

  const options: CopilotAskOption[] = Array.isArray(value.options)
    ? value.options.flatMap((raw) => {
        if (!isRecord(raw)) return []
        const label = str(raw.label)
        const optionValue = str(raw.value)
        if (!label || !optionValue) return []
        return [{ label, value: optionValue, hint: str(raw.hint) }]
      })
    : []

  return {
    question,
    options,
    allowFreeform: value.allowFreeform === true || options.length === 0,
  }
}

export function readApprovalStub(output: unknown): CopilotApprovalStub | null {
  if (!isRecord(output) || output.status !== "awaiting_approval") return null
  return {
    tool: str(output.tool) ?? "tool",
    message: str(output.message) ?? "Requires operator approval.",
  }
}

function describeEntity(data: Record<string, unknown>): string | undefined {
  for (const key of ["email", "name", "domainName", "domain", "href", "id"]) {
    const value = str(data[key])
    if (value) return value
  }
  return undefined
}

export function summarizeToolOutput(output: unknown): ToolSummary {
  if (!isRecord(output)) {
    return { tone: "ok", text: "Done" }
  }

  if (output.ok === false) {
    return { tone: "error", text: str(output.error) ?? "Tool call failed" }
  }

  const data = output.data
  if (Array.isArray(data)) {
    return {
      tone: "ok",
      text: `${data.length} ${data.length === 1 ? "record" : "records"}`,
    }
  }
  if (isRecord(data)) {
    const entity = describeEntity(data)
    if (entity) return { tone: "ok", text: entity }

    const listKey = Object.entries(data).find(([, value]) =>
      Array.isArray(value)
    )
    if (listKey) {
      const [key, value] = listKey
      return { tone: "ok", text: `${(value as unknown[]).length} ${key}` }
    }
  }

  const note = str(output.note)
  if (note) return { tone: "ok", text: note }

  return { tone: "ok", text: "Done" }
}

const MAX_JSON_CHARS = 1600

export function formatToolJson(value: unknown): string {
  let text: string
  try {
    text = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return "[unserializable]"
  }
  if (text.length <= MAX_JSON_CHARS) return text
  return `${text.slice(0, MAX_JSON_CHARS)}\n… truncated`
}
