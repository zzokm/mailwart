import { z } from "zod"

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(32, "Username cannot exceed 32 characters.")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username may only contain letters, numbers, dots, hyphens, and underscores."
    ),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(255, "Email is too long."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password cannot exceed 128 characters."),
  role: z.enum(["admin", "user"]).default("user"),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

export const deleteUserSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),
})

export type DeleteUserInput = z.infer<typeof deleteUserSchema>

export const updateUserPasswordSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password cannot exceed 128 characters."),
})

export type UpdateUserPasswordInput = z.infer<typeof updateUserPasswordSchema>
