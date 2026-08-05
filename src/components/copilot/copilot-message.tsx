"use client"

import * as React from "react"
import { isToolUIPart, type UIMessage } from "ai"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  CopilotToolStep,
  type CopilotToolPart,
} from "@/components/copilot/copilot-tool-step"

type Block =
  | { kind: "text"; key: string; text: string }
  | { kind: "steps"; key: string; parts: CopilotToolPart[]; firstStep: number }

/** Split a turn into prose blocks and runs of tool calls (one execution timeline each). */
function toBlocks(message: UIMessage, firstToolStep: number): Block[] {
  const blocks: Block[] = []
  let step = firstToolStep - 1

  for (const [index, part] of message.parts.entries()) {
    if (isToolUIPart(part)) {
      const last = blocks.at(-1)
      if (last?.kind === "steps") {
        last.parts.push(part)
      } else {
        blocks.push({
          kind: "steps",
          key: `steps-${part.toolCallId}`,
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
  firstToolStep = 1,
  onAnswer,
  onApproval,
}: {
  message: UIMessage
  firstToolStep?: number
  onAnswer: (value: string) => void
  onApproval: (approvalId: string, approved: boolean) => void
}) {
  const blocks = React.useMemo(
    () => toBlocks(message, firstToolStep),
    [firstToolStep, message]
  )

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
          <div
            key={block.key}
            className="min-w-0 break-words text-[13px] leading-relaxed text-foreground [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-2 [&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-surface [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-1.5 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              components={{
                a: ({ href, children, ...props }) => (
                  <a
                    {...props}
                    href={href}
                    target={href?.startsWith("http") ? "_blank" : undefined}
                    rel={href?.startsWith("http") ? "noreferrer" : undefined}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {block.text}
            </ReactMarkdown>
          </div>
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
