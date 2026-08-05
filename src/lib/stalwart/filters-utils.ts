import type {
  Autoresponder,
  FilterAction,
  FilterCondition,
  FilterRule,
} from "./types"

/** Escape a string for use inside a Sieve quoted string. */
export function sieveQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function conditionTest(c: FilterCondition): string {
  const val = sieveQuote(c.value)
  const op =
    c.op === "is" ? ":is" : c.op === "matches" ? ":matches" : ":contains"
  if (c.field === "header") {
    const name = sieveQuote(c.headerName?.trim() || "X-Custom")
    return `header ${op} ${name} ${val}`
  }
  if (c.field === "from") return `address ${op} ["From"] ${val}`
  if (c.field === "to") return `address ${op} ["To"] ${val}`
  return `header ${op} "Subject" ${val}`
}

function actionLines(a: FilterAction): string[] {
  switch (a.type) {
    case "fileinto":
      return [`fileinto ${sieveQuote(a.folder?.trim() || "INBOX")};`, "stop;"]
    case "discard":
      return ["discard;", "stop;"]
    case "redirect":
      return [
        `redirect ${sieveQuote(a.redirectTo?.trim() || "postmaster@localhost")};`,
        "stop;",
      ]
    case "keep":
      return ["keep;", "stop;"]
    case "stop":
      return ["stop;"]
    default:
      return ["keep;"]
  }
}

/** Generate a readable Sieve snippet for a filter rule. */
export function buildFilterSieve(rule: FilterRule): string {
  const test = conditionTest(rule.condition)
  const body = actionLines(rule.action)
    .map((l) => `  ${l}`)
    .join("\n")
  const requires =
    rule.action.type === "fileinto"
      ? 'require ["fileinto"];\n'
      : rule.action.type === "redirect"
        ? 'require ["copy"];\n'
        : ""
  return `${requires}# ${rule.name}\nif ${test} {\n${body}\n}`
}

/** Generate a vacation Sieve snippet for an autoresponder. */
export function buildVacationSieve(ar: Autoresponder): string {
  const lines = ['require ["vacation"];', ""]
  if (ar.startAt || ar.endAt) {
    lines.push("# Schedule enforced by mailwart / ManageSieve when supported.")
    if (ar.startAt) lines.push(`# start: ${ar.startAt.slice(0, 10)}`)
    if (ar.endAt) lines.push(`# end: ${ar.endAt.slice(0, 10)}`)
  }
  const args = [
    `:days ${Math.max(0, ar.daysBetween)}`,
    `:subject ${sieveQuote(ar.subject)}`,
  ]
  lines.push(`vacation ${args.join(" ")}`)
  lines.push(`  ${sieveQuote(ar.body)};`)
  return lines.join("\n")
}

export function summarizeFilter(rule: FilterRule): string {
  const field =
    rule.condition.field === "header"
      ? `header:${rule.condition.headerName || "?"}`
      : rule.condition.field
  const cond = `${field} ${rule.condition.op} “${rule.condition.value}”`
  let act: string = rule.action.type
  if (rule.action.type === "fileinto") {
    act = `fileinto ${rule.action.folder || "INBOX"}`
  } else if (rule.action.type === "redirect") {
    act = `redirect ${rule.action.redirectTo || "?"}`
  }
  return `${cond} → ${act}`
}

/** Normalize denylist/allowlist entries (email or domain). */
export function normalizeAddressList(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const v = item.trim().toLowerCase()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

export function parseAddressListText(text: string): string[] {
  return normalizeAddressList(
    text
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
}
