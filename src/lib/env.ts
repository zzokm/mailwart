import { z } from "zod"

const envSchema = z.object({
  STALWART_JMAP_URL: z.string().url().optional(),
  STALWART_ADMIN_USER: z.string().min(1).optional(),
  STALWART_ADMIN_PASSWORD: z.string().min(1).optional(),
  ROUNDCUBE_URL: z.string().url().default("https://mail.zokm.me"),
  STALWART_ADMIN_UI_URL: z
    .string()
    .url()
    .default("https://mail.yehia.dev/admin"),
  APP_ADMIN_USER: z.string().optional(),
  APP_ADMIN_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
})

export type AppEnv = z.infer<typeof envSchema>

function readRawEnv(): Record<string, string | undefined> {
  return {
    STALWART_JMAP_URL: process.env.STALWART_JMAP_URL,
    STALWART_ADMIN_USER: process.env.STALWART_ADMIN_USER,
    STALWART_ADMIN_PASSWORD: process.env.STALWART_ADMIN_PASSWORD,
    ROUNDCUBE_URL: process.env.ROUNDCUBE_URL,
    STALWART_ADMIN_UI_URL: process.env.STALWART_ADMIN_UI_URL,
    APP_ADMIN_USER: process.env.APP_ADMIN_USER,
    APP_ADMIN_PASSWORD: process.env.APP_ADMIN_PASSWORD,
    SESSION_SECRET: process.env.SESSION_SECRET,
  }
}

export function getEnv(): AppEnv {
  return envSchema.parse(readRawEnv())
}

export type StalwartConfig = {
  jmapUrl: string
  adminUser: string
  adminPassword: string
}

/** Returns null when Stalwart credentials are incomplete (local/mock mode). */
export function getStalwartConfig(): StalwartConfig | null {
  const env = getEnv()
  if (
    !env.STALWART_JMAP_URL ||
    !env.STALWART_ADMIN_USER ||
    !env.STALWART_ADMIN_PASSWORD
  ) {
    return null
  }
  return {
    jmapUrl: env.STALWART_JMAP_URL,
    adminUser: env.STALWART_ADMIN_USER,
    adminPassword: env.STALWART_ADMIN_PASSWORD,
  }
}

export function getRoundcubeUrl(): string {
  return getEnv().ROUNDCUBE_URL
}

export function getStalwartAdminUiUrl(): string {
  return getEnv().STALWART_ADMIN_UI_URL
}

export function hasStalwartConfig(): boolean {
  return getStalwartConfig() !== null
}
