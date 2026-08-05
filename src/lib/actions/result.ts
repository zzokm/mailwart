import "server-only"

import type { z } from "zod"

import { hasStalwartConfig } from "@/lib/env"
import { parseActionError } from "@/lib/stalwart/parse-error"
import { StalwartError } from "@/lib/stalwart/errors"
import type { ActionResult, DataSource } from "@/lib/stalwart/types"
import { zodIssuesMessage } from "@/lib/validations/common"

export function dataSource(): DataSource {
  return hasStalwartConfig() ? "live" : "mock"
}

export function okResult<T>(data: T, src: DataSource = dataSource()): ActionResult<T> {
  return { ok: true, data, source: src }
}

export function failResult<T = never>(
  error: unknown,
  src: DataSource = dataSource()
): ActionResult<T> {
  const parsed = parseActionError(error)
  return {
    ok: false,
    error: parsed.message,
    code: parsed.code,
    source: src,
  }
}

/** Validate input with Zod; returns ActionResult on failure. */
export function validateInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  src: DataSource = dataSource()
):
  | { ok: true; data: z.infer<TSchema> }
  | { ok: false; result: ActionResult<never> } {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      result: failResult(
        new StalwartError(zodIssuesMessage(parsed.error), "validation"),
        src
      ),
    }
  }
  return { ok: true, data: parsed.data }
}
