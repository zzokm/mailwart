# Architecture Review Log — mailwart

Karpathy-style critical self-review of Phase 1 docs. Three passes; each pass records findings and what changed.

---

## Pass 1 — Brand generalization + core architecture

**Date:** 2026-08-05  
**Reviewed:** Rewrite of `ARCHITECTURE.md` / `PRODUCT_SPEC.md` from legacy “Email Manager” personal-brand docs → **mailwart**.

### Findings (pre-rewrite)

1. **Brand leakage.** Docs and PRODUCT/DESIGN treated personal hostnames as product identity. Violates generalized product constraint.
2. **Scope too narrow for mission.** Spec stopped at basic CRUD + bulk; mission requires cPanel-grade phases 2–5 (DNS, routing, app passwords/2FA, filters, logs, analytics, theme, breadcrumbs).
3. **React Query unset.** Existing code uses RSC + Server Actions only; architecture must define when client cache is allowed so Phase 2+ does not invent two conflicting patterns.
4. **Production paths at risk.** A greenfield rewrite would delete Roundcube SSO / compose — architecture must explicitly preserve them.

### Changes made

- Rebranded docs to **mailwart**; Bricolage Grotesque ExtraLight 200 for wordmark.
- Separated **brand vs deployment config** (Architecture §2, Product §8).
- Documented RSC / Server Actions / React Query boundaries (Architecture §4.1).
- Expanded product IA and feature specs for phases 2–5.
- Explicit KEEP list: Roundcube plugin, SSO route, Dockerfile, compose.

### Pass 1 verdict

Core system shape is correct for a single-operator Stalwart dashboard. Edge cases for bulk persistence, rate limits under load, DNS complexity, SSO abuse, and multi-tenant seams still thin → Pass 2.

---

## Pass 2 — Edge cases: bulk, rate limits, DNS, SSO

**Date:** 2026-08-05  
**Reviewed:** Pass 1 docs against failure modes.

### Findings

1. **CSV bulk jobs are request-scoped.** A 500-row import can exceed reverse-proxy timeouts; “serial chunks in one Server Action” is fragile. Need job model: chunked actions with client-held job id **or** server temp job store.
2. **Stalwart rate / overload.** Docs covered our timeouts but not **client-side pacing** when Stalwart returns 429/503 or slows under bulk.
3. **DNS validation is naive.** Single resolver view misses split-horizon; multiple SPF mechanisms and DKIM selectors need a defined pass/warn/fail rubric.
4. **SSO/impersonation blast radius.** Token lifetime alone is insufficient — need audience binding, method constraints, and impersonator least-privilege called out as required deploy config.
5. **React Query vs Action progress.** Bulk progress must pick one source of truth to avoid double-submit.

### Changes made

See commits after Pass 2 edits to Architecture/Product — summary:

- Bulk: **job session** pattern — wizard holds `jobId`; each chunk is a separate Server Action; optional disk/memory job report TTL 1h; no silent full-file single request.
- Rate limits: honor Retry-After; cap concurrent JMAP to 1 mutating pipeline; backoff on 429/503.
- DNS: rubric + multi-selector DKIM + “checks reflect server resolver” warning.
- SSO: claims (`aud`, `exp`, `nonce`, `mailbox`); recommend dedicated impersonator principal; audit SSO mint events.
- Bulk UI: React Query watches job report; mutations only via chunk actions (no second writer).

### Pass 2 verdict

Operability under partial failure is specified. Multi-tenant generalization and long-term state persistence still open → Pass 3.

---

## Pass 3 — Multi-tenant seams, state persistence, simplicity

**Date:** 2026-08-05  
**Reviewed:** Pass 2 docs for over-engineering and future seams.

### Findings

1. **“Multi-tenant” temptation.** Building SaaS tenancy now violates Karpathy simplicity. Need **seams only**: env-scoped Stalwart binding, no hard-coded domains in UI logic, brand-free copy — not org tables.
2. **Audit/job persistence choice was OR.** Pick defaults: in-process/memory job reports for v1 single-node; append-only audit file or SQLite if restart survival required in Phase 4 — document decision gate.
3. **Feature honesty for 2FA/app passwords.** Spec must not invent Stalwart fields; probe-or-deep-link pattern is mandatory.
4. **Phase boundary creep.** Analytics charts in Phase 2 would bloat — keep counts in Phase 2, charts in Phase 5.
5. **PRODUCT.md / DESIGN.md still old brand.** Light update required so Impeccable context matches mailwart without a full UI redesign.

### Changes made

- Architecture: **single-tenant deploy, multi-domain**; “tenant” = one Stalwart + one mailwart instance; future multi-tenant = multiple deploys or later `STALWART_*` profiles — not Phase 2–5 scope.
- Jobs: default **memory Map + TTL**; document upgrade to SQLite when multi-instance or restart-safe bulk is required.
- Audit: Phase 4 default **SQLite** (or JSONL on volume) — pick one in implementation; prefer SQLite if both Roundcube and app share volumes complexity — actually prefer **JSONL on named volume** for fewer moving parts unless querying demands SQLite.
- Product: analytics Phase 5; Phase 2 = counts + health only.
- Probe-or-deep-link for app passwords / 2FA / Sieve editor.
- Light PRODUCT.md / DESIGN.md / README rebrand to mailwart.

### Pass 3 verdict

Docs are generalized, edge-aware, and Phase-1-scoped. Persistence defaults chosen (memory jobs, JSONL audit). PRODUCT.md / DESIGN.md / README / `.env.example` lightly rebranded to **mailwart**; `env.ts` example defaults no longer hardcode personal hosts. Production SSO/compose preserved. **Ready for Phase 2.** No git push.
