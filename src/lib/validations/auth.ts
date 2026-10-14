import { z } from "zod"

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
})

export type LoginInput = z.infer<typeof loginSchema>

export function checkPasswordStrength(password: string) {
  const hasMinLength = password.length >= 8
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(
    password
  )

  const valid = hasMinLength && hasUpper && hasLower && hasNumberOrSpecial
  return {
    valid,
    hasMinLength,
    hasUpper,
    hasLower,
    hasNumberOrSpecial,
  }
}

