"use client"

import * as React from "react"
import { isToolUIPart, type UIMessage } from "ai"

import {
  CopilotToolStep,
  type CopilotToolPart,
} from "@/components/copilot/copilot-tool-step"

type Block =
  | { kind: "text"; key: string; text: string }
  | { kind: "steps"; key: string; parts: CopilotToolPart[]; firstStep: number }

/** Split a turn into prose blocks and runs of tool calls (one execution timeline each). */
function toBlocks(message: UIMessage): Block[] {
  const blocks: Block[] = []
  let step = 0

  for (const [index, part] of message.parts.entries()) {
    if (isToolUIPart(part)) {
      const last = blocks.at(-1)
      if (last?.kind === "steps") {
        last.parts.push(part)
      } else {
        blocks.push({
          kind: "steps",
          key: `steps-${index}`,
          parts: [part],
          firstStep: step + 1,
        })
      }
      step += 1
      continue
    }

    if (part.type === "text" && part.text.length > 0) {
      blocks.push({ kind: "text", key: `text-${index}`, text: part.text })
    }
  }

  return blocks
}

export function CopilotMessage({
  message,
  onAnswer,
  onApproval,
}: {
  message: UIMessage
  onAnswer: (value: string) => void
  onApproval: (approvalId: string, approved: boolean) => void
}) {
  const blocks = React.useMemo(() => toBlocks(message), [message])

  if (message.role === "user") {
    const text = message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim()

    if (!text) return null

    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3 py-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-secondary-foreground">
          {text}
        </div>
      </div>
    )
  }

  if (blocks.length === 0) return null

  return (
    <div className="space-y-3">
      {blocks.map((block) =>
        block.kind === "text" ? (
          <p
            key={block.key}
            className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground"
          >
            {block.text}
          </p>
        ) : (
          <ol
            key={block.key}
            className="relative space-y-3 before:absolute before:inset-y-2 before:left-[8.5px] before:w-px before:bg-border/70"
          >
            {block.parts.map((part, offset) => (
              <CopilotToolStep
                key={part.toolCallId}
                part={part}
                index={block.firstStep + offset}
                onAnswer={onAnswer}
                onApproval={onApproval}
              />
            ))}
          </ol>
        )
      )}
    </div>
  )
}
