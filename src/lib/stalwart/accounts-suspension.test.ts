import { describe, expect, it, vi } from "vitest"
import { hydrateAccounts } from "./email"

vi.mock("server-only", () => ({}))
vi.mock("./client", () => ({
  BULK_TIMEOUT_MS: 30000,
  jmapCall: vi.fn(),
  responseById: vi.fn(),
}))

describe("Account Suspension & Activation (permissions mapping)", () => {
  it("hydrateAccounts marks account as suspended when disabledPermissions contains authenticate", () => {
    const rawAccounts = [
      {
        id: "acc-1",
        name: "testuser",
        description: "testuser@scboost.com",
        domainId: "dom-1",
        permissions: {
          "@type": "Merge",
          disabledPermissions: { authenticate: true, emailSend: true },
        },
      },
      {
        id: "acc-2",
        name: "activeuser",
        description: "activeuser@scboost.com",
        domainId: "dom-1",
        permissions: {
          "@type": "Inherit",
        },
      },
      {
        id: "acc-3",
        name: "legacyuser",
        description: "legacy@scboost.com",
        domainId: "dom-1",
        isEnabled: false,
      },
    ]

    const hydrated = hydrateAccounts(rawAccounts, [{ id: "dom-1", name: "scboost.com" }])

    expect(hydrated[0].isEnabled).toBe(false)
    expect(hydrated[1].isEnabled).toBe(true)
    expect(hydrated[2].isEnabled).toBe(false)
  })

  it("updateAccount transforms isEnabled to permissions payload for Stalwart JMAP", async () => {
    const { updateAccount } = await import("./accounts")
    const { jmapCall, responseById } = await import("./client")

    vi.mocked(jmapCall).mockResolvedValue({
      methodResponses: [["x:Account/set", {}, "a2"]],
    })
    vi.mocked(responseById).mockReturnValue({
      updated: { "acc-1": {} },
    })

    // 1. Suspend
    await updateAccount("acc-1", { isEnabled: false })

    expect(jmapCall).toHaveBeenLastCalledWith([
      [
        "x:Account/set",
        {
          update: {
            "acc-1": {
              permissions: {
                "@type": "Merge",
                disabledPermissions: { authenticate: true, emailSend: true },
              },
            },
          },
        },
        "a2",
      ],
    ])

    // 2. Activate
    await updateAccount("acc-1", { isEnabled: true })

    expect(jmapCall).toHaveBeenLastCalledWith([
      [
        "x:Account/set",
        {
          update: {
            "acc-1": {
              permissions: {
                "@type": "Inherit",
              },
            },
          },
        },
        "a2",
      ],
    ])
  })
})
