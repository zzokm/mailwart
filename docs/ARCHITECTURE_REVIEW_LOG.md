# Architecture Review Log

Karpathy-style critical self-review of Phase 1 docs. Three passes; docs updated after each.

---

## Pass 1 — Accuracy vs live VPS scripts

**Reviewed:** `ARCHITECTURE.md`, `PRODUCT_SPEC.md` against `scripts/mail-restore/{provision,catchall-setup,bootstrap,create-hashed,verify-roundcube-login}.py` and `docs/mail/*`.

### Findings

1. **Domain create schema mismatch.** Official Stalwart docs require `certificateManagement`, `dkimManagement`, `dnsManagement`, `subAddressing` on create. Live `provision.py` succeeded with only `{ name, description }`. Docs previously waved at “sensible defaults” without stating the VPS-proven minimal create.
2. **Account identity is multi-sourced.** Scripts reconstruct email from `description`, `emails` (array *or* dict), and `name`+domain map. Architecture under-specified parsing rules → risk of wrong row keys in UI.
3. **Admin identity evolved.** Bootstrap used Basic `admin`; day-2 ops use `admin@zokm.me`. Easy to misconfigure env.
4. **Session library left as OR.** Karpathy: pick one. Dual options invite bikeshedding in Phase 2.
5. **Placeholder page** still create-next-app marketing chrome — contradicts “minimal placeholder” Phase 1 deliverable.

### Changes made

- ARCHITECTURE §5.3: document **minimal Domain create (VPS-proven)** vs full schema fallback.
- ARCHITECTURE §5.3: add **Account email resolution algorithm**.
- ARCHITECTURE §2 / §6: clarify recovery `admin` vs `admin@zokm.me`.
- ARCHITECTURE §6.2: commit to **iron-session** sealed cookie (not jose-or).
- PRODUCT_SPEC §5.2: align domain create with minimal-first strategy.
- Replace `src/app/page.tsx` with Phase 1 placeholder (no dashboard).
- Add `.env.example` (no secrets).

---

## Pass 2 — Operability, runtime, and failure modes

**Reviewed:** updated docs for deploy/runtime gaps and over-flexibility.

### Findings

1. **Next.js runtime unspecified.** Private Docker DNS (`stalwart-mail:8080`) and long JMAP bulk calls require **Node.js runtime**, not Edge.
2. **Bulk chunk size** was a range (25–50); implementers need a default: **25**.
3. **Local Windows dev** will not see `127.0.0.1:8080` on the VPS — must use `https://mail.yehia.dev/jmap` (or SSH tunnel). Not stated.
4. **Login rate limit** mentioned in checklist only — no concrete rule.
5. **Aliases** still fuzzy; PRODUCT_SPEC allowed shipping without probe — tighten to “read-only display if present; edit after live shape confirm”.
6. **PRODUCT_SPEC** used HTML entity `&lt;30s` — fix to plain markdown.

### Changes made

- ARCHITECTURE: new §5.7 Node runtime + local-dev URL guidance.
- ARCHITECTURE §5.4: default chunk size **25**.
- ARCHITECTURE §6.2: login rate limit **5 / 15 min / IP** (app-level).
- PRODUCT_SPEC §5.3: aliases edit gated on Phase 2 probe.
- PRODUCT_SPEC §9: fix timing copy.
- Cross-link Dokploy compose id `ZHxvknPKmn9V0LDDL5GFh` for ops traceability.

---

## Pass 3 — Consistency, simplicity, Phase 1 boundary

**Reviewed:** both docs for duplication conflicts, speculative scope, and Phase 1 exit criteria.

### Findings

1. **IA route list vs component hierarchy** slightly diverged (`/aliases` top-level vs tab). Unify: aliases live under mailbox detail; no top-level `/aliases` in v1.
2. **Authentication policy UI** appeared in Settings and as integration target — keep read in Settings; mutate only Danger zone (already said; make ARCHITECTURE folder tree drop premature `settings` API sprawl).
3. **Health for Roundcube** optional HEAD may trigger auth walls — mark as best-effort GET `/` expect 200 HTML, never follow login POST.
4. **Secrets hygiene:** ensure docs never paste live passwords from restore scripts (confirmed clean).
5. **Success criteria** should require `package.json` Next 16+ and docs paths explicitly for parent agent handoff.

### Changes made

- PRODUCT_SPEC §4: remove top-level `/aliases`; mailbox detail owns aliases.
- ARCHITECTURE §4 folder tree: drop standalone aliases route; keep mailboxes only.
- ARCHITECTURE §7: Roundcube health = best-effort GET, no credential POST.
- ARCHITECTURE §13 / PRODUCT_SPEC §11: tighten Phase 1 exit checklist for parent deliverable.
- Both docs: add “Source of truth” script list pointer.
- Final consistency pass on terminology: always “JMAP `/jmap`”, never imply REST management API for v0.16.16.

### Pass 3 verdict

Docs are aligned with live Stalwart v0.16.16 usage on this VPS, Karpathy-simple (one client module, iron-session, chunk 25), and Phase-1-scoped (no feature UI beyond placeholder). **Ready for Phase 2.**
