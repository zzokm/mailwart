import { z } from "zod";

const envSchema = z.object({
  STALWART_JMAP_URL: z.string().url().optional(),
  STALWART_ADMIN_USER: z.string().optional(),
  STALWART_ADMIN_PASSWORD: z.string().optional(),
  ROUNDCUBE_URL: z.string().url().default("https://mail.example.com/webmail/"),
  WEBMAIL_SSO_SECRET: z.string().min(32).optional(),
  STALWART_ADMIN_UI_URL: z
    .string()
    .url()
    .default("https://mail.example.com/admin"),
  APP_ADMIN_USER: z.string().optional(),
  APP_ADMIN_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  /** Expected MX target hostname (optional rubric). */
  DNS_EXPECTED_MX: z.string().optional(),
  /** CSV of DKIM selectors to probe (e.g. stalwart,default). */
  DNS_DKIM_SELECTORS: z.string().optional(),
  /** Expected SPF include/ip/a mechanism substring (optional). */
  DNS_EXPECTED_SPF: z.string().optional(),
  /** Append-only audit JSONL path (Architecture §9.2). Relative to cwd or absolute. */
  AUDIT_LOG_PATH: z.string().optional(),
  /** Cloudflare API Token for automated DNS provisioning across zones. */
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  /** Path to persistent Cloudflare settings JSON file. */
  CLOUDFLARE_SETTINGS_PATH: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Compose passes unset optional vars through as `${VAR:-}`, so they arrive as
 * empty strings rather than absent. Blank means "not configured".
 */
function unset(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readRawEnv(): Record<string, string | undefined> {
  return {
    STALWART_JMAP_URL: unset(process.env.STALWART_JMAP_URL),
    STALWART_ADMIN_USER: unset(process.env.STALWART_ADMIN_USER),
    STALWART_ADMIN_PASSWORD: unset(process.env.STALWART_ADMIN_PASSWORD),
    ROUNDCUBE_URL: unset(process.env.ROUNDCUBE_URL),
    WEBMAIL_SSO_SECRET: unset(process.env.WEBMAIL_SSO_SECRET),
    STALWART_ADMIN_UI_URL: unset(process.env.STALWART_ADMIN_UI_URL),
    APP_ADMIN_USER: unset(process.env.APP_ADMIN_USER),
    APP_ADMIN_PASSWORD: unset(process.env.APP_ADMIN_PASSWORD),
    SESSION_SECRET: unset(process.env.SESSION_SECRET),
    DNS_EXPECTED_MX: unset(process.env.DNS_EXPECTED_MX),
    DNS_DKIM_SELECTORS: unset(process.env.DNS_DKIM_SELECTORS),
    DNS_EXPECTED_SPF: unset(process.env.DNS_EXPECTED_SPF),
    AUDIT_LOG_PATH: unset(process.env.AUDIT_LOG_PATH),
    CLOUDFLARE_API_TOKEN: unset(process.env.CLOUDFLARE_API_TOKEN),
    CLOUDFLARE_SETTINGS_PATH: unset(process.env.CLOUDFLARE_SETTINGS_PATH),
  };
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(readRawEnv());
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export type StalwartConfig = {
  jmapUrl: string;
  adminUser: string;
  adminPassword: string;
};

/** Returns null when Stalwart credentials are incomplete (local/mock mode). */
export function getStalwartConfig(): StalwartConfig | null {
  const env = getEnv();
  if (
    !env.STALWART_JMAP_URL ||
    !env.STALWART_ADMIN_USER ||
    !env.STALWART_ADMIN_PASSWORD
  ) {
    return null;
  }
  return {
    jmapUrl: env.STALWART_JMAP_URL,
    adminUser: env.STALWART_ADMIN_USER,
    adminPassword: env.STALWART_ADMIN_PASSWORD,
  };
}

export function getRoundcubeUrl(): string {
  return getEnv().ROUNDCUBE_URL;
}

export function getStalwartAdminUiUrl(): string {
  return getEnv().STALWART_ADMIN_UI_URL;
}

export function hasStalwartConfig(): boolean {
  return getStalwartConfig() !== null;
}

export type DnsExpectations = {
  expectedMx?: string;
  dkimSelectors: string[];
  expectedSpf?: string;
};

/** Optional DNS health rubric from env (Architecture §10). */
export function getDnsExpectations(): DnsExpectations {
  const env = getEnv();
  const selectors = (env.DNS_DKIM_SELECTORS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return {
    expectedMx: env.DNS_EXPECTED_MX?.trim().toLowerCase() || undefined,
    dkimSelectors: selectors,
    expectedSpf: env.DNS_EXPECTED_SPF?.trim() || undefined,
  };
}
