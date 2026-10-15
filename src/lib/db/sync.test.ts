import { beforeEach, describe, expect, it, vi } from "vitest"

const mockQuery = vi.fn()

vi.mock("pg", () => {
  return {
    Pool: vi.fn().mockImplementation(function (
      this: { query: typeof mockQuery; on: ReturnType<typeof vi.fn> }
    ) {
      this.query = mockQuery
      this.on = vi.fn()
    }),
  }
})

describe("PostgreSQL Sync Robustness (Mailboxes & Domains)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
  })

  it("syncMailboxesToDb deduplicates batch and handles stale conflicting records", async () => {
    const executedQueries: Array<{ sql: string; params: unknown[] }> = []

    mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      executedQueries.push({ sql, params })
      if (sql.includes("SELECT id, owner_id FROM mailboxes")) {
        // Simulate existing row with id 'bd' and email 'catch@zokm.dev'
        return {
          rows: [{ id: "bd", owner_id: "user_admin_123" }],
        }
      }
      return { rows: [] }
    })

    const { syncMailboxesToDb } = await import("./index")

    // Incoming accounts with new id 'bk' for same email, plus duplicate in same batch
    const accounts = [
      {
        id: "bk",
        email: "catch@zokm.dev",
        name: "catch",
        domainId: "i",
        quotaBytes: 1000,
        usedBytes: 50,
        status: "active",
      },
      {
        id: "bk_duplicate",
        email: "catch@zokm.dev",
        name: "duplicate catch",
        domainId: "i",
      },
    ]

    await syncMailboxesToDb(accounts)

    // 1. Check that duplicate email was pruned from the batch (only 1 check, 1 delete, 1 insert)
    const selectQueries = executedQueries.filter((q) =>
      q.sql.includes("SELECT id, owner_id FROM mailboxes")
    )
    expect(selectQueries).toHaveLength(1)

    // 2. Check that stale conflicting record was pruned before insert
    const deleteQueries = executedQueries.filter((q) =>
      q.sql.includes("DELETE FROM mailboxes")
    )
    expect(deleteQueries).toHaveLength(1)
    expect(deleteQueries[0].params).toEqual(["bk", "catch@zokm.dev"])

    // 3. Check that insert preserved existing owner_id
    const insertQueries = executedQueries.filter((q) =>
      q.sql.includes("INSERT INTO mailboxes")
    )
    expect(insertQueries).toHaveLength(1)
    expect(insertQueries[0].params[0]).toBe("bk")
    expect(insertQueries[0].params[1]).toBe("catch@zokm.dev")
    expect(insertQueries[0].params[7]).toBe("user_admin_123") // preserved owner_id
  })

  it("syncDomainsToDb deduplicates batch and cleans up stale records", async () => {
    const executedQueries: Array<{ sql: string; params: unknown[] }> = []

    mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      executedQueries.push({ sql, params })
      if (sql.includes("SELECT id, owner_id FROM domains")) {
        return { rows: [{ id: "dom_old", owner_id: "admin_1" }] }
      }
      return { rows: [] }
    })

    const { syncDomainsToDb } = await import("./index")

    const domains = [
      { id: "dom_new", name: "zokm.dev", description: "Primary domain" },
      { id: "dom_dup", name: "zokm.dev" },
    ]

    await syncDomainsToDb(domains)

    const selectQueries = executedQueries.filter((q) =>
      q.sql.includes("SELECT id, owner_id FROM domains")
    )
    expect(selectQueries).toHaveLength(1)

    const deleteQueries = executedQueries.filter((q) =>
      q.sql.includes("DELETE FROM domains")
    )
    expect(deleteQueries).toHaveLength(1)

    const insertQueries = executedQueries.filter((q) =>
      q.sql.includes("INSERT INTO domains")
    )
    expect(insertQueries).toHaveLength(1)
    expect(insertQueries[0].params[0]).toBe("dom_new")
    expect(insertQueries[0].params[1]).toBe("zokm.dev")
    expect(insertQueries[0].params[3]).toBe("admin_1") // preserved owner_id
  })
})
