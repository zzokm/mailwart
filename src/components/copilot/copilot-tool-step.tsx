"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  getToolName,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai"
import {
  AlertTriangle,
  Ban,
  Check,
  CornerDownRight,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  formatToolJson,
  humanizeToolName,
  readApprovalStub,
  readAskPrompt,
  readNavIntent,
  readSuggestedActions,
  summarizeToolOutput,
  type CopilotSuggestedAction,
} from "@/lib/copilot/tool-ui"
import { getCopilotToolUiMetadata } from "@/lib/copilot/tool-metadata"
import { cn } from "@/lib/utils"

export type CopilotToolPart = ToolUIPart | DynamicToolUIPart

type StepTone = "running" | "ok" | "error" | "attention" | "muted"

const TONE_DOT: Record<StepTone, string> = {
  running: "border-brand/40 bg-brand/10 text-brand",
  ok: "border-success/30 bg-success/10 text-success",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  attention: "border-warn/40 bg-warn/10 text-warn",
  muted: "border-border bg-muted text-muted-foreground",
}

function StepDot({ tone, icon }: { tone: StepTone; icon: React.ReactNode }) {
  return (
    <span
      className={cn(
        "absolute left-0 top-0 flex size-[18px] items-center justify-center rounded-full border [&_svg]:size-2.5",
        TONE_DOT[tone]
      )}
      aria-hidden
    >
      {icon}
    </span>
  )
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
      {children}
    </p>
  )
}

function JsonDisclosure({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="group/json mt-1.5">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <CornerDownRight
          className="size-3 transition-transform group-open/json:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        {label}
      </summary>
      <pre className="mt-1 max-h-56 overflow-auto rounded-md border border-border/60 bg-surface/70 p-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {formatToolJson(value)}
      </pre>
    </details>
  )
}

/**
 * One backend step in the assistant's execution timeline: live status while the
 * tool runs, then the sanitized outcome, approval gate, or clarification form.
 */
export function CopilotToolStep({
  part,
  index,
  onAnswer,
  onApproval,
}: {
  part: CopilotToolPart
  index: number
  onAnswer: (value: string) => void
  onApproval: (approvalId: string, approved: boolean) => void
}) {
  const name = getToolName(part)
  const metadata = getCopilotToolUiMetadata(name)
  const label = humanizeToolName(name)

  let tone: StepTone = "running"
  let icon: React.ReactNode = <Loader2 className="animate-spin" />
  let body: React.ReactNode = null

  switch (part.state) {
    case "input-streaming": {
      body = <Detail>{metadata.preparing}</Detail>
      break
    }

    case "input-available": {
      body = <Detail>{metadata.running}</Detail>
      break
    }

    case "approval-requested": {
      tone = "attention"
      icon = <ShieldAlert />
      body = (
        <ApprovalCard
          toolName={label}
          input={part.input}
          approvalId={part.approval.id}
          onApproval={onApproval}
        />
      )
      break
    }

    case "approval-responded": {
      tone = part.approval.approved ? "running" : "muted"
      icon = part.approval.approved ? <Loader2 className="animate-spin" /> : <Ban />
      body = (
        <Detail>
          {part.approval.approved ? "Approved — running…" : "Rejected"}
        </Detail>
      )
      break
    }

    case "output-denied": {
      tone = "muted"
      icon = <Ban />
      body = <Detail>Rejected by operator — no side effects.</Detail>
      break
    }

    case "output-error": {
      tone = "error"
      icon = <AlertTriangle />
      body = (
        <Detail>
          <span className="text-destructive">{part.errorText}</span>
          <span> Check the request details and try again.</span>
        </Detail>
      )
      break
    }

    case "output-available": {
      const ask = name === "ask_operator" ? readAskPrompt(part.output) : null
      if (ask) {
        tone = "attention"
        icon = <ShieldAlert />
        body = (
          <AskOperatorCard
            prompt={ask}
            onAnswer={onAnswer}
            toolCallId={part.toolCallId}
          />
        )
        break
      }

      const approval = readApprovalStub(part.output)
      if (approval) {
        tone = "attention"
        icon = <ShieldAlert />
        body = (
          <div className="mt-1.5 rounded-lg border border-warn/30 bg-warn/5 p-2.5">
            <p className="text-[11.5px] font-medium text-foreground">
              Held for approval
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {approval.message}
            </p>
          </div>
        )
        break
      }

      const summary = summarizeToolOutput(part.output)
      const nav = readNavIntent(part.output)
      const actions = readSuggestedActions(part.output)
      if (nav && !actions.some((action) => action.type === "navigate")) {
        actions.push({ type: "navigate", label: "Open page", href: nav.href })
      }
      tone = summary.tone === "error" ? "error" : "ok"
      icon = summary.tone === "error" ? <X /> : <Check />
      body = (
        <>
          <Detail>
            <span
              className={cn(summary.tone === "error" && "text-destructive")}
            >
              {summary.tone === "error"
                ? `${summary.text}. Check the request details and try again.`
                : `${metadata.completed} ${summary.text}`}
            </span>
          </Detail>
          {actions.length > 0 ? (
            <SuggestedActions actions={actions} onPrompt={onAnswer} />
          ) : null}
          <JsonDisclosure label="Result" value={part.output} />
        </>
      )
      break
    }
  }

  return (
    <li className="relative pl-6">
      <StepDot tone={tone} icon={icon} />
      <div className="flex items-baseline gap-1.5">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/80">
          Step {index}
        </span>
        <span className="truncate text-[12.5px] font-medium text-foreground">
          {label}
        </span>
      </div>
      {body}
    </li>
  )
}

function SuggestedActions({
  actions,
  onPrompt,
}: {
  actions: CopilotSuggestedAction[]
  onPrompt: (value: string) => void
}) {
  const router = useRouter()
  const [visible, setVisible] = React.useState(true)
  if (!visible) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested actions">
      {actions.map((action) => (
        <Button
          key={`${action.type}-${action.label}`}
          type="button"
          size="xs"
          variant="outline"
          onClick={() => {
            if (action.type === "navigate") router.push(action.href)
            if (action.type === "webmail") {
              window.open(action.href, "_blank", "noopener,noreferrer")
            }
            if (action.type === "prompt") onPrompt(action.prompt)
          }}
        >
          {action.label}
        </Button>
      ))}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={() => setVisible(false)}
      >
        Stay here
      </Button>
    </div>
  )
}

function describeApprovalTarget(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  for (const key of [
    "email",
    "name",
    "domainName",
    "domain",
    "id",
    "jobId",
    "mailboxId",
  ]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function ApprovalCard({
  toolName,
  input,
  approvalId,
  onApproval,
}: {
  toolName: string
  input: unknown
  approvalId: string
  onApproval: (approvalId: string, approved: boolean) => void
}) {
  const [decided, setDecided] = React.useState<boolean | null>(null)
  const target = describeApprovalTarget(input)

  const decide = (approved: boolean) => {
    if (decided !== null) return
    setDecided(approved)
    onApproval(approvalId, approved)
  }

  return (
    <div className="mt-1.5 rounded-lg border border-warn/30 bg-warn/5 p-2.5">
      <p className="text-[11.5px] font-medium text-foreground">
        Destructive — irreversible without restore
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        Approve runs <span className="font-medium text-foreground">{toolName}</span>
        {target ? (
          <>
            {" "}
            on <span className="font-mono text-foreground">{target}</span>
          </>
        ) : null}
        . Reject cancels with no side effects. Approvals expire in ~5 minutes.
      </p>
      <JsonDisclosure label="Arguments" value={input} />
      {decided === null ? (
        <div className="mt-2 flex gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => decide(true)}
          >
            Approve
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            onClick={() => decide(false)}
          >
            Reject
          </Button>
        </div>
      ) : (
        <Detail>
          {decided ? "Approved — running…" : "Rejected — no side effects."}
        </Detail>
      )}
    </div>
  )
}

function AskOperatorCard({
  prompt,
  toolCallId,
  onAnswer,
}: {
  prompt: NonNullable<ReturnType<typeof readAskPrompt>>
  toolCallId: string
  onAnswer: (value: string) => void
}) {
  const [answered, setAnswered] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")

  const submit = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed || answered) return
    setAnswered(trimmed)
    onAnswer(trimmed)
  }

  return (
    <div className="mt-1.5 rounded-lg border border-border/70 bg-surface/60 p-2.5">
      <p className="text-[11.5px] leading-snug font-medium text-foreground">
        {prompt.question}
      </p>

      {answered ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          You answered{" "}
          <span className="font-medium text-foreground">{answered}</span>
        </p>
      ) : (
        <>
          {prompt.options.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {prompt.options.map((option) => (
                <Button
                  key={`${toolCallId}-${option.value}`}
                  type="button"
                  size="xs"
                  variant="outline"
                  title={option.hint}
                  onClick={() => submit(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}

          {prompt.allowFreeform ? (
            <form
              className="mt-2 flex gap-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                submit(draft)
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type an answer…"
                aria-label={prompt.question}
                className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[11.5px] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <Button type="submit" size="xs" disabled={!draft.trim()}>
                Send
              </Button>
            </form>
          ) : null}
        </>
      )}
    </div>
  )
}
