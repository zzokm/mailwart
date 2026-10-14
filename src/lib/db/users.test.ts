import { describe, expect, it } from "vitest"

import { createPasswordHash, verifyPassword } from "./users"
import { createUserSchema, deleteUserSchema } from "../validations/users"
import { loginSchema } from "../validations/auth"
import { isSessionValid, type SessionData } from "../auth/session-options"

describe("User & RBAC Security Layer", () => {
  it("securely hashes passwords with scrypt and verifies matches correctly", () => {
    const password = "SuperSecretPassword123!"
    const { combined, salt, hash } = createPasswordHash(password)

    expect(combined).toContain(":")
    expect(salt).toHaveLength(32) // 16 bytes in hex = 32 chars
    expect(hash).toHaveLength(128) // 64 bytes in hex = 128 chars

    // Verifies with colon format
    expect(verifyPassword(password, combined)).toBe(true)

    // Verifies with separate hash and salt
    expect(verifyPassword(password, hash, salt)).toBe(true)

    // Rejects incorrect password
    expect(verifyPassword("WrongPassword!", combined)).toBe(false)
    expect(verifyPassword("", combined)).toBe(false)
  })

  it("validates user creation schema strictly", () => {
    // Valid input
    const valid = createUserSchema.safeParse({
      username: "operator_1",
      email: "operator@example.com",
      password: "strongpassword123",
      role: "user",
    })
    expect(valid.success).toBe(true)

    // Rejects short usernames
    const shortUser = createUserSchema.safeParse({
      username: "ab",
      email: "operator@example.com",
      password: "strongpassword123",
      role: "user",
    })
    expect(shortUser.success).toBe(false)

    // Rejects invalid email
    const invalidEmail = createUserSchema.safeParse({
      username: "operator",
      email: "not-an-email",
      password: "strongpassword123",
      role: "user",
    })
    expect(invalidEmail.success).toBe(false)

    // Rejects short password (< 8 chars)
    const shortPass = createUserSchema.safeParse({
      username: "operator",
      email: "valid@example.com",
      password: "123",
      role: "user",
    })
    expect(shortPass.success).toBe(false)
  })

  it("validates delete user schema with UUID check", () => {
    expect(
      deleteUserSchema.safeParse({ userId: "550e8400-e29b-41d4-a716-446655440000" }).success
    ).toBe(true)

    expect(deleteUserSchema.safeParse({ userId: "not-a-uuid" }).success).toBe(
      false
    )
  })

  it("validates login schema accepting username or email", () => {
    expect(
      loginSchema.safeParse({ username: "yehia", password: "password" }).success
    ).toBe(true)

    expect(
      loginSchema.safeParse({
        username: "yehia@example.com",
        password: "password",
      }).success
    ).toBe(true)

    expect(loginSchema.safeParse({ username: "", password: "password" }).success).toBe(
      false
    )
  })

  it("enforces session validity for admin and user roles", () => {
    const adminSession: SessionData = {
      userId: "123",
      username: "yehia",
      role: "admin",
      exp: Date.now() + 60000,
    }
    expect(isSessionValid(adminSession)).toBe(true)

    const userSession: SessionData = {
      userId: "456",
      username: "john",
      role: "user",
      exp: Date.now() + 60000,
    }
    expect(isSessionValid(userSession)).toBe(true)

    const expiredSession: SessionData = {
      userId: "456",
      username: "john",
      role: "user",
      exp: Date.now() - 1000,
    }
    expect(isSessionValid(expiredSession)).toBe(false)

    const invalidRoleSession = {
      userId: "456",
      username: "john",
      role: "guest" as unknown as SessionData["role"],
      exp: Date.now() + 60000,
    }
    expect(isSessionValid(invalidRoleSession)).toBe(false)
  })

  it("strictly validates primary admin status and case-insensitivity", async () => {
    const { isPrimaryAdmin } = await import("./users")
    expect(isPrimaryAdmin("yehia")).toBe(true)
    expect(isPrimaryAdmin("YEHIA")).toBe(true)
    expect(isPrimaryAdmin({ username: "yehia" })).toBe(true)
    expect(isPrimaryAdmin("operator")).toBe(false)
    expect(isPrimaryAdmin("admin")).toBe(false)
    expect(isPrimaryAdmin(null)).toBe(false)
  })

  it("validates strong password requirements correctly", async () => {
    const { checkPasswordStrength } = await import("../validations/auth")
    // Weak: short
    expect(checkPasswordStrength("Ab1!").valid).toBe(false)
    // Weak: no uppercase
    expect(checkPasswordStrength("secretpassword1!").valid).toBe(false)
    // Weak: no lowercase
    expect(checkPasswordStrength("SECRETPASSWORD1!").valid).toBe(false)
    // Weak: no number/special
    expect(checkPasswordStrength("SecretPassword").valid).toBe(false)
    // Strong
    const strong = checkPasswordStrength("StrongPassword123!")
    expect(strong.valid).toBe(true)
    expect(strong.hasMinLength).toBe(true)
    expect(strong.hasUpper).toBe(true)
    expect(strong.hasLower).toBe(true)
    expect(strong.hasNumberOrSpecial).toBe(true)
  })
})

