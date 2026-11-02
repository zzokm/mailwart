import { describe, expect, it } from "vitest"
import {
  createMcpApiKey,
  listMcpApiKeys,
  revokeMcpApiKey,
  validateMcpApiKey,
} from "./mcp-keys"

describe("MCP API Key Management and Authentication", () => {
  it("generates an API key with secure prefix and hashes it", async () => {
    const key = await createMcpApiKey("Claude Desktop Production", "yehia")
    expect(key.id).toMatch(/^mcp_key_/)
    expect(key.name).toBe("Claude Desktop Production")
    expect(key.rawKey).toMatch(/^mw_mcp_[0-9a-f]{48}$/)
    expect(key.prefix).toMatch(/^mw_mcp_[0-9a-f]{6}\.\.\.$/)
    expect(key.createdBy).toBe("yehia")

    // Key should validate successfully
    const auth = await validateMcpApiKey(key.rawKey)
    expect(auth.valid).toBe(true)
    expect(auth.name).toBe("Claude Desktop Production")

    // Invalid key should fail
    const invalidAuth = await validateMcpApiKey("invalid-key-xyz")
    expect(invalidAuth.valid).toBe(false)
  })

  it("lists generated keys without revealing raw secret", async () => {
    const key = await createMcpApiKey("Cursor IDE Agent", "yehia")
    const keys = await listMcpApiKeys()

    const found = keys.find((k) => k.id === key.id)
    expect(found).toBeDefined()
    expect(found?.name).toBe("Cursor IDE Agent")
    expect((found as unknown as { rawKey?: string }).rawKey).toBeUndefined()
  })

  it("revokes an API key successfully", async () => {
    const key = await createMcpApiKey("Temporary Testing Key", "yehia")
    expect((await validateMcpApiKey(key.rawKey)).valid).toBe(true)

    const revoked = await revokeMcpApiKey(key.id)
    expect(revoked).toBe(true)

    const reauth = await validateMcpApiKey(key.rawKey)
    expect(reauth.valid).toBe(false)
  })

  it("respects process.env.MCP_API_KEY master fallback", async () => {
    const origEnv = process.env.MCP_API_KEY
    try {
      process.env.MCP_API_KEY = "mw_master_secret_env_token_12345"
      const auth = await validateMcpApiKey("mw_master_secret_env_token_12345")
      expect(auth.valid).toBe(true)
      expect(auth.actor).toBe("admin-master")
    } finally {
      process.env.MCP_API_KEY = origEnv
    }
  })
})
