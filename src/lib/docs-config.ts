export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

export interface DocMetadata {
  slug: string
  title: string
  description: string
  category: "Getting Started" | "Frontend & Interface" | "Backend & Protocols" | "Features & Tools" | "Operations & DevOps"
  filename: string
  order: number
  readTime: string
}

export const DOCS_REGISTRY: DocMetadata[] = [
  {
    slug: "get-started",
    title: "Getting Started Guide",
    description: "Step-by-step setup, local development, domain provisioning, and webmail SSO.",
    category: "Getting Started",
    filename: "00_GET_STARTED.md",
    order: 1,
    readTime: "5 min read",
  },
  {
    slug: "overview",
    title: "System Overview & Map",
    description: "System overview, high-level architecture, principles, and directory map.",
    category: "Getting Started",
    filename: "README.md",
    order: 2,
    readTime: "4 min read",
  },
  {
    slug: "architecture",
    title: "System Architecture",
    description: "Container topology, Docker network bridges, Traefik ingress, and dual runtime engine.",
    category: "Getting Started",
    filename: "01_ARCHITECTURE.md",
    order: 3,
    readTime: "7 min read",
  },
  {
    slug: "pages-and-routes",
    title: "Pages, Navigation & UX",
    description: "Detailed mapping of all 11 UI pages, AppShell chrome, navigation sidebar, and modals.",
    category: "Frontend & Interface",
    filename: "02_PAGES_AND_ROUTES.md",
    order: 4,
    readTime: "9 min read",
  },
  {
    slug: "roundcube-sso",
    title: "Roundcube Webmail SSO",
    description: "Zero-password single sign-on, HMAC tokens, and Stalwart SASL master impersonation.",
    category: "Frontend & Interface",
    filename: "06_ROUNDCUBE_SSO.md",
    order: 5,
    readTime: "5 min read",
  },
  {
    slug: "api-reference",
    title: "HTTP REST API Reference",
    description: "REST API route handlers, streaming AI chat, diagnostics, and Webmail SSO.",
    category: "Backend & Protocols",
    filename: "03_API_REFERENCE.md",
    order: 6,
    readTime: "5 min read",
  },
  {
    slug: "server-actions",
    title: "Server Actions Catalog",
    description: "Comprehensive catalog of all 80+ server actions across mail, users, Cloudflare, and auth.",
    category: "Backend & Protocols",
    filename: "04_SERVER_ACTIONS.md",
    order: 7,
    readTime: "8 min read",
  },
  {
    slug: "stalwart-integration",
    title: "Stalwart Mail Server & JMAP",
    description: "JMAP protocol specification, method calls, entity mapping, and in-memory mock store.",
    category: "Backend & Protocols",
    filename: "05_STALWART_INTEGRATION.md",
    order: 8,
    readTime: "6 min read",
  },
  {
    slug: "cloudflare-automation",
    title: "Cloudflare DNS Automation",
    description: "Multi-account pooling, automated zone discovery, and 1-click DNS record provisioning.",
    category: "Features & Tools",
    filename: "07_CLOUDFLARE_AUTOMATION.md",
    order: 9,
    readTime: "6 min read",
  },
  {
    slug: "deliverability-suite",
    title: "Deliverability Suite",
    description: "10-point audit matrix, port probes, blacklist monitoring, and mail-tester scoring.",
    category: "Features & Tools",
    filename: "08_DELIVERABILITY_SUITE.md",
    order: 10,
    readTime: "7 min read",
  },
  {
    slug: "ai-copilot",
    title: "AI Copilot & Tool Registry",
    description: "10 LLM providers, 48 administrative tools, and human-in-the-loop approvals.",
    category: "Features & Tools",
    filename: "09_AI_COPILOT.md",
    order: 11,
    readTime: "8 min read",
  },
  {
    slug: "database-and-security",
    title: "Database, Security & Deployment",
    description: "PostgreSQL 12-table schema, RBAC permissions, audit logging, and Dokploy setup.",
    category: "Operations & DevOps",
    filename: "10_DATABASE_AND_SECURITY.md",
    order: 12,
    readTime: "7 min read",
  },
]

export function getDocsCategories(): Array<{
  name: DocMetadata["category"]
  items: DocMetadata[]
}> {
  const categories: DocMetadata["category"][] = [
    "Getting Started",
    "Frontend & Interface",
    "Backend & Protocols",
    "Features & Tools",
    "Operations & DevOps",
  ]

  return categories.map((cat) => ({
    name: cat,
    items: DOCS_REGISTRY.filter((d) => d.category === cat).sort((a, b) => a.order - b.order),
  }))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}
