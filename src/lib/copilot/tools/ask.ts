import { z } from "zod"

/** Clarification prompt rendered as a choice card in the Copilot panel (§16.3). */
export const askOperatorSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe("One short question for the operator"),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80).describe("Button text"),
        value: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .describe("Reply sent back when the operator picks this option"),
        hint: z.string().trim().max(120).optional(),
      })
    )
    .min(1)
    .max(6)
    .optional()
    .describe("Up to 6 choices. Omit for a free-text answer."),
  allowFreeform: z
    .boolean()
    .optional()
    .describe("Also let the operator type an answer instead of picking"),
})

export type AskOperatorInput = z.infer<typeof askOperatorSchema>

export type AskOperatorResult = {
  status: "awaiting_operator_input"
  question: string
  options: NonNullable<AskOperatorInput["options"]>
  allowFreeform: boolean
  note: string
}

export function resolveAskOperator(input: AskOperatorInput): AskOperatorResult {
  const options = input.options ?? []
  return {
    status: "awaiting_operator_input",
    question: input.question,
    options,
    allowFreeform: input.allowFreeform ?? options.length === 0,
    note: "The operator has not answered yet. Stop and wait for their reply.",
  }
}
