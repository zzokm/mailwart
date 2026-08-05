# mailwart

Next.js admin dashboard for Stalwart Mail Server (JMAP). Product name: **mailwart**.

Repo folder / Docker service may still say `email-manager` — that is historical pathing, not the brand.

## Local

```bash
cp .env.example .env.local
# fill STALWART_*, APP_ADMIN_*, SESSION_SECRET, and webmail secrets
npm install
npm run dev
```

## Production (Dokploy)

- `Dockerfile` — standalone Next.js image
- `docker-compose.yml` — app + Roundcube at `/webmail`
- `roundcube/plugins/em_sso` — signed-token SSO using Stalwart impersonation
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Product: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)

## Phase 1

Architecture and docs only. Do not push until the full app mission is complete.
