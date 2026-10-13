import { z } from "zod"

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
})

export type LoginInput = z.infer<typeof loginSchema>
