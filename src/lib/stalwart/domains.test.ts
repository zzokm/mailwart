import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// Mock client calls
const mockJmapCall = vi.fn()
vi.mock("./client", () => ({
  jmapCall: (...args: unknown[]) => mockJmapCall(...args),
  responseById: (resp: Array<[string, unknown, string]>, id: string) => {
    const entry = resp.find(([, , entryId]) => entryId === id)
    return (entry?.[1] as Record<string, unknown>) ?? {}
  },
}))

import { createDomain, getDomainByName } from "./domains"
import { parseActionError } from "./parse-error"
import { StalwartError } from "./errors"

describe("Domain idempotency & primaryKeyViolation resilience", () => {
  it("enriches primaryKeyViolation with clear operator-facing text", () => {
    const err = new StalwartError("primaryKeyViolation (new: primaryKeyViolation)", "jmap")
    const { message } = parseActionError(err)
    expect(message).toContain("already registered in Stalwart")
  })

  it("handles primaryKeyViolation in createDomain by fetching the existing domain", async () => {
    // 1. Initial attempt fails with primaryKeyViolation
    mockJmapCall.mockImplementation(async (calls: Array<[string, Record<string, unknown>, string]>) => {
      const [method, , callId] = calls[0]
      if (method === "x:Domain/set" && callId === "d2") {
        return [
          [
            "x:Domain/set",
            {
              notCreated: {
                new: { type: "primaryKeyViolation", description: "already exists" },
              },
            },
            "d2",
          ],
        ]
      }
      if (method === "x:Domain/get" && callId === "d1") {
        return [
          [
            "x:Domain/get",
            {
              list: [
                {
                  id: "example.com",
                  name: "example.com",
                  description: "Existing domain",
                  isEnabled: true,
                },
              ],
            },
            "d1",
          ],
        ]
      }
      if (method === "x:Domain/set" && callId === "d2_update") {
        return [["x:Domain/set", { updated: { "example.com": {} } }, "d2_update"]]
      }
      return [[method, {}, callId]]
    })

    const domain = await createDomain({ name: "example.com" })
    expect(domain).toBeDefined()
    expect(domain.name).toBe("example.com")
    expect(domain.id).toBe("example.com")
  })

  it("fetches domain by direct name if ID matches domain name", async () => {
    mockJmapCall.mockImplementation(async (calls: Array<[string, Record<string, unknown>, string]>) => {
      const [method, , callId] = calls[0]
      if (method === "x:Domain/get") {
        return [
          [
            "x:Domain/get",
            {
              list: [
                {
                  id: "yehia.dev",
                  name: "yehia.dev",
                  isEnabled: true,
                },
              ],
            },
            callId,
          ],
        ]
      }
      return [[method, {}, callId]]
    })

    const dom = await getDomainByName("yehia.dev")
    expect(dom).not.toBeNull()
    expect(dom?.name).toBe("yehia.dev")
  })
})
