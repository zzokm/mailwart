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

- `Dockerfile` — standalone Next.js image (`output: 'standalone'`)
- `docker-compose.yml` — `email-manager` + Roundcube at `/webmail`, volume `mailwart_audit`
- `roundcube/plugins/em_sso` — signed-token SSO using Stalwart impersonation
- Env template: `.env.example` (secrets only in Dokploy / `.env.local`)
- Deploy runbook (parent workspace): `docs/mail/email-manager-deploy.md`
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Product: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)

Auto-deploy: push `main` → GitHub `zzokm/yehia-email-manager` → Dokploy compose.
