export type DnsRecordType = "MX" | "A" | "SPF" | "DKIM" | "DMARC" | "PTR" | "DNSBL"

export type CheckStatus = "pass" | "warn" | "fail" | "skipped"

export type DnsRecordCheck = {
  type: DnsRecordType
  name: string
  status: CheckStatus
  expected: string
  observed?: string
  summary: string
  impact: string
  recommendation?: string
}

export type PortService =
  | "SMTP (Submission)"
  | "SMTP (Implicit TLS)"
  | "IMAP (SSL/TLS)"
  | "SMTP (Inbound MX)"
  | "SMTP (Outbound Egress 25)"

export type EgressTarget = {
  target: string
  port: number
  status: CheckStatus
  latencyMs?: number
  error?: string
}

export type EgressProbeResult = {
  status: CheckStatus
  port25Reachable: boolean
  relayReachable: boolean
  canDeliverExternal: boolean
  probedTargets: EgressTarget[]
  summary: string
  recommendation?: string
}

export type PortCheck = {
  port: number
  service: PortService
  status: CheckStatus
  latencyMs: number
  note: string
}

export type OutboundProbeResult = {
  status: CheckStatus
  sender: string
  recipient: string
  queueResponse?: string
  queueId?: string
  tlsVersion?: string
  cipher?: string
  latencyMs: number
  error?: string
}

export type InboundProbeResult = {
  status: CheckStatus
  targetMailbox: string
  protocol: "IMAP" | "JMAP"
  latencyMs: number
  handshake: "ok" | "failed"
  error?: string
}

export type ExternalTesterResult = {
  enabled: boolean
  recipient?: string
  service?: "mail-tester" | "custom"
  status: "sent" | "failed" | "skipped"
  queueResponse?: string
  queueId?: string
  reportUrl?: string
  error?: string
}

export type DeliverabilityIssue = {
  severity: "critical" | "warning" | "tip"
  title: string
  message: string
  recommendation: string
  suggestedRecord?: {
    type: string
    name: string
    content: string
  }
}

export type DomainDeliverabilityReport = {
  domain: string
  score: number // 0 to 10
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  tempMailbox: {
    email: string
    name: string
    created: boolean
    cleaned: boolean
  }
  dnsChecks: DnsRecordCheck[]
  portChecks: PortCheck[]
  outbound: OutboundProbeResult
  inbound: InboundProbeResult
  egress?: EgressProbeResult
  external: ExternalTesterResult
  issues: DeliverabilityIssue[]
}

export type DeliverabilitySuiteReport = {
  runId: string
  timestamp: string
  overallScore: number // 0 to 10
  overallGrade: "A+" | "A" | "B" | "C" | "D" | "F"
  totalDomains: number
  passedDomains: number
  warningsCount: number
  failuresCount: number
  domainReports: DomainDeliverabilityReport[]
  egress?: EgressProbeResult
  systemSummary: string
  recommendations: string[]
}

export type RunDeliverabilityOptions = {
  domains?: string[]
  externalRecipient?: string
  autoCleanup?: boolean
}
