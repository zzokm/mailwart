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
  {
    slug: "rav-webmail",
    title: "Rav Webmail & Dual Engine",
    description: "Next.js 16 + React 19 + Rust Axum webmail, Tantivy search, live WebSockets, and dual SSO.",
    category: "Frontend & Interface",
    filename: "11_RAV_WEBMAIL.md",
    order: 13,
    readTime: "6 min read",
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

export const FILE_TO_DOC_MAP: Record<string, { slug: string; title: string }> = {
  "00_GET_STARTED.md": { slug: "get-started", title: "Getting Started Guide" },
  "00_get_started.md": { slug: "get-started", title: "Getting Started Guide" },
  "README.md": { slug: "overview", title: "System Overview & Map" },
  "readme.md": { slug: "overview", title: "System Overview & Map" },
  "01_ARCHITECTURE.md": { slug: "architecture", title: "System Architecture" },
  "01_architecture.md": { slug: "architecture", title: "System Architecture" },
  "02_PAGES_AND_ROUTES.md": { slug: "pages-and-routes", title: "Pages, Navigation & UX" },
  "02_pages_and_routes.md": { slug: "pages-and-routes", title: "Pages, Navigation & UX" },
  "03_API_REFERENCE.md": { slug: "api-reference", title: "HTTP REST API Reference" },
  "03_api_reference.md": { slug: "api-reference", title: "HTTP REST API Reference" },
  "04_SERVER_ACTIONS.md": { slug: "server-actions", title: "Server Actions Catalog" },
  "04_server_actions.md": { slug: "server-actions", title: "Server Actions Catalog" },
  "05_STALWART_INTEGRATION.md": { slug: "stalwart-integration", title: "Stalwart Mail Server & JMAP" },
  "05_stalwart_integration.md": { slug: "stalwart-integration", title: "Stalwart Mail Server & JMAP" },
  "06_ROUNDCUBE_SSO.md": { slug: "roundcube-sso", title: "Roundcube Webmail SSO" },
  "06_roundcube_sso.md": { slug: "roundcube-sso", title: "Roundcube Webmail SSO" },
  "07_CLOUDFLARE_AUTOMATION.md": { slug: "cloudflare-automation", title: "Cloudflare DNS Automation" },
  "07_cloudflare_automation.md": { slug: "cloudflare-automation", title: "Cloudflare DNS Automation" },
  "08_DELIVERABILITY_SUITE.md": { slug: "deliverability-suite", title: "Deliverability Suite" },
  "08_deliverability_suite.md": { slug: "deliverability-suite", title: "Deliverability Suite" },
  "09_AI_COPILOT.md": { slug: "ai-copilot", title: "AI Copilot & Tool Registry" },
  "09_ai_copilot.md": { slug: "ai-copilot", title: "AI Copilot & Tool Registry" },
  "10_DATABASE_AND_SECURITY.md": { slug: "database-and-security", title: "Database, Security & Deployment" },
  "10_database_and_security.md": { slug: "database-and-security", title: "Database, Security & Deployment" },
  "11_RAV_WEBMAIL.md": { slug: "rav-webmail", title: "Rav Webmail & Dual Engine" },
  "11_rav_webmail.md": { slug: "rav-webmail", title: "Rav Webmail & Dual Engine" },
}
