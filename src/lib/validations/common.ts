import { z } from "zod"

/** Hostname-like domain (not a full email). */
export const domainNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Domain name is required.")
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a valid domain name.")

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .email("Invalid email address.")

export const localPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Local-part is required.")
  .regex(/^[a-z0-9._+-]+$/i, "Local-part must not contain @.")
  .refine((v) => !v.includes("@"), "Local-part must not contain @.")

export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters.")

export const entityIdSchema = z.string().trim().min(1, "Id is required.")

export const nonEmptyString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`)

export function zodIssuesMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join("; ")
}
