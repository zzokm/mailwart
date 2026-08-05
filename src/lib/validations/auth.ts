import { z } from "zod"

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your admin username."),
  password: z.string().min(1, "Enter your password."),
})

export type LoginInput = z.infer<typeof loginSchema>
