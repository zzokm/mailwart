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

---

# mailwart Copilot — review passes

Karpathy-style critical self-review of the Copilot expansion (Architecture §16). Three passes; each records findings and what changed.

---

## Copilot Pass 1 — Layout, state shape, tool registry seam

**Date:** 2026-08-05  
**Reviewed:** First draft of Copilot architecture against AppShell realities and existing Server Actions.

### Findings

1. **Overlay temptation.** A fixed `position: fixed` drawer on desktop would cover tables and fight the Operate mode. Mission requires **shrink**, not overlay — must be a flex peer of `SidebarInset`.
2. **One store for everything.** Dumping messages + Stalwart directory into one Zustand blob would fork server truth. Copilot store must stay UI/stream-only; mutations go through existing actions.
3. **Tool registry as HTTP wrappers.** Inventing REST for the model would duplicate Server Actions. Registry must be thin adapters over `mail.ts` (and friends).
4. **Mobile shrink is hostile.** At <1024px with icon/expanded sidebar, a 22rem panel leaves Main unusable — need an explicit breakpoint and Sheet fallback.
5. **Shortcut collision.** Sidebar already owns `Ctrl/Cmd+B`; Copilot needs a distinct chord (`Ctrl/Cmd+J`).

### Changes made

- Architecture §11 + §16.2: desktop flex shrink; mobile Sheet at `< lg` (1024px); `--copilot-width: 22rem`.
- §16.3: client slices for open/messages/toolStream/approvals/run/navIntent; no directory cache in Copilot.
- §16.4: allowlisted registry → Server Action; risk tiers read/write/destructive.
- Product §5.13 + IA note: Copilot is panel chrome, not a new top-level route.

### Pass 1 verdict

Layout and registry seams are correct. Concurrency, approval races, persistence, and secret handling still thin → Pass 2.

---

## Copilot Pass 2 — Concurrent tools, approval races, persistence

**Date:** 2026-08-05  
**Reviewed:** Pass 1 against failure modes while streaming tool calls.

### Findings

1. **Concurrent tool calls.** Models often emit parallel tools. Parallel **destructive** calls could race Stalwart and the bulk “one mutating pipeline” rule. Need serialization policy for write/destructive; reads may fan-out with a small concurrency cap.
2. **Approval race.** Operator double-clicks Approve, or a stale card from a previous `runId` is approved after a new run started → double mutate or wrong target. Approvals must be single-use and bound to `(runId, toolCallId)` with TTL.
3. **Reject vs abort.** Closing the panel mid-approval must not silently Approve; treat as leave-pending until TTL or explicit Reject. Aborting the stream rejects outstanding pending approvals for that `runId`.
4. **Chat persistence.** Full `localStorage` of messages risks leaking mailbox identifiers across shared machines longer than a session. Prefer **sessionStorage** for messages; **localStorage** only for panel-open preference.
5. **navIntent storms.** Multiple navigate tools in one turn could thrash the router — apply only the **last** allowlisted href per turn.

### Changes made

- §16.6: one active `runId`; write/destructive tools serialize; read fan-out capped; bulk job conflict block.
- §16.7: single-use approval tokens; TTL ~5 min; abort → reject pending for run.
- §16.3: sessionStorage for chat; localStorage for open preference only.
- §16.8: last navigation wins per turn; allowlist `/dashboard/*` only.

### Pass 2 verdict

Runtime races and persistence defaults are specified. Secret handling and mobile/a11y edge cases → Pass 3.

---

## Copilot Pass 3 — Secrets, mobile a11y, simplicity gate

**Date:** 2026-08-05  
**Reviewed:** Pass 2 for over-engineering and secret leakage.

### Findings

1. **Key leakage vectors.** Streaming debug payloads, tool results that echo env, and Settings forms that bind `type="text"` values into client state are the real risks — not only “don’t use NEXT_PUBLIC”. Sanitize tool results; Settings shows configured + last-4 only.
2. **Encrypted settings store temptation.** Building a vault in C2 is overkill if Dokploy env already holds keys. Prefer env-first; optional server-only settings write only if operators need UI without redeploy — document both, implement env-first in C2.
3. **Mobile focus trap.** Sheet must trap focus and restore to the TopBar toggle on close; Esc closes Copilot without navigating away.
4. **Placeholder scope creep.** C1 must not ship chat composers that pretend to call models — chrome + empty state only, or operators will think C2/C4 already work.
5. **Simplicity:** No Copilot-specific DI, no second JMAP client, no vector DB. Registry + stream + approvals is enough.

### Changes made

- §16.5: env-first provider keys; UI mask only; Node-only completion path.
- Security checklist: Copilot key + approval items.
- §16.2 / Product: C1 = shell + placeholder; no fake composer wiring.
- Review: mobile Sheet focus/Esc; last-nav-wins already in Pass 2.
- Explicit non-goals: no vault/DI/second client in C1–C5 unless a real deploy pain appears.

### Pass 3 verdict

Copilot architecture is edge-aware and C1-scoped. Ready to implement the sliding panel shell. **No git push** until Copilot C1–C5 complete.

---

## Copilot C2 — Multi-provider (2026-08-05)

### Delivered
- Provider catalog (10): OpenAI, Anthropic, Google, Cerebras, Groq, Mistral, DeepSeek, Moonshot, Ollama, OpenRouter.
- Env-first resolve (`COPILOT_*`); Settings JSON fallback under `data/` (gitignored); UI shows last-4 only.
- Dynamic model list via provider APIs; preference persisted server-side.
- `getCopilotLanguageModelConfig()` thin adapter for Phase 3–4 Vercel AI SDK.
- `.env.example` placeholders; Settings section on `/dashboard/settings`.

### Non-goals held
- No vault/DI framework; no `NEXT_PUBLIC_*` keys; no chat/stream yet (C4); no tool registry (C3).

**No git push.**

---

## Copilot C3 — Tool registry & stream (2026-08-05)

### Delivered
- Installed `ai` + `@ai-sdk/{openai,anthropic,google}` mapped from Phase 2 `sdkKind`.
- Allowlisted registry in `src/lib/copilot/tools/` wrapping existing `mail.ts` Server Actions (no second JMAP client).
- Risk tags `read` | `write` | `destructive`; destructive returns `awaiting_approval` + AI SDK `toolApproval: user-approval` (Phase 5 hook).
- `sanitizeToolResult` redacts passwords, app secrets, DKIM private keys.
- Authenticated `POST /api/copilot/chat` → `streamCopilotChat` → `streamText` + tools → UI message stream.
- Architecture §16.4 / phase map updated for C3 tool names/categories.

### Non-goals held
- No rich chat UI (C4); no approval cards / rate limits enforced (C5); **no git push**.
