import { z } from "zod"

import { domainNameSchema, entityIdSchema, nonEmptyString } from "./common"

export const createDomainSchema = z.object({
  name: domainNameSchema,
  description: z.string().trim().optional(),
  autoProvisionDns: z.boolean().optional(),
})

export const updateDomainSchema = z.object({
  id: entityIdSchema,
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  catchAllAddress: z.string().nullable().optional(),
  catchAllMode: z.enum(["address", "bounce", "blackhole"]).optional(),
  allowRelaying: z.boolean().optional(),
  mailExchanger: z.enum(["local", "backup", "remote"]).optional(),
})

export const destroyDomainSchema = z.object({
  id: entityIdSchema,
  typedName: nonEmptyString("Domain name"),
  force: z.boolean().optional().default(false),
})

export const refreshDnsSchema = z.object({
  domainName: domainNameSchema,
})

export const generateDkimSchema = z.object({
  domain: domainNameSchema,
  selector: z.string().trim().optional(),
})

export const generateDmarcSchema = z.object({
  domain: domainNameSchema,
  policy: z.enum(["none", "quarantine", "reject"]).optional(),
  rua: z.string().trim().optional(),
})

export const updateCatchAllSchema = z.object({
  domainId: entityIdSchema,
  mode: z.enum(["address", "bounce", "blackhole"]),
  address: z.string().nullable().optional(),
})

export const updateMailExchangerSchema = z.object({
  domainId: entityIdSchema,
  mode: z.enum(["local", "backup", "remote"]),
})

export const provisionCloudflareDnsSchema = z.object({
  domain: domainNameSchema,
  selector: z.string().trim().optional(),
  forceOverwrite: z.boolean().optional().default(false),
})

export const saveCloudflareSettingsSchema = z.object({
  apiToken: z.string().trim().min(1, "Cloudflare API token is required"),
  defaultMailHost: z.string().trim().optional(),
})

