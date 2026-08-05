# Email Manager

Next.js admin dashboard for Stalwart (JMAP). Product host: **https://email.yehia.dev**

## Local

```bash
cp .env.example .env.local
# fill STALWART_*, APP_ADMIN_*, SESSION_SECRET, and webmail secrets
npm install
npm run dev
```

## Production (Dokploy)

See [docs/mail/email-manager-deploy.md](../docs/mail/email-manager-deploy.md).

- `Dockerfile` — standalone Next.js image
- `docker-compose.yml` — Email Manager + Roundcube at `/webmail`
- `roundcube/plugins/em_sso` — signed-token SSO using Stalwart impersonation
- Secrets: `scripts/mail-restore/email-manager-admin.txt`
- Deploy helper: `scripts/mail-restore/deploy-email-manager.py`
