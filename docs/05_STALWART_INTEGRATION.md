# 05 — Stalwart Mail Server Integration

## 1. Overview & Protocol Specification

[Stalwart Mail Server](https://stalw.art/) is an open-source, all-in-one mail server written in Rust that supports JMAP, IMAP, SMTP, ManageSieve, ACME, and directory authentication.

**mailwart** interfaces with Stalwart v0.16.x+ using the standard **JMAP (JSON Meta Application Protocol)** protocol at the endpoint `STALWART_JMAP_URL` (typically `http://stalwart-mail:8080/jmap` in-cluster or `https://mail.example.com/jmap`).

All management requests declare two JMAP capabilities:
- `urn:ietf:params:jmap:core` (RFC 8620)
- `urn:stalwart:jmap` (Stalwart directory & MTA management extensions)

---

## 2. JMAP Client Architecture (`src/lib/stalwart/client.ts`)

JMAP calls are executed server-side via `jmapCall()` using Node's native `fetch` with strict timeout controls:

```typescript
export async function jmapCall(
  methodCalls: JmapMethodCall[],
  options: JmapClientOptions = {}
): Promise<JmapResponse> {
  const config = getStalwartConfig()
  // Authenticates with Basic base64(adminUser:adminPassword)
  const res = await fetch(config.jmapUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(config.adminUser, config.adminPassword),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      methodCalls,
    }),
    signal: controller.signal,
    cache: "no-store",
  })
  ...
}
```

### JMAP Call Structure
Each method invocation in `methodCalls` is a 3-element tuple:
`[MethodName, ArgumentsObject, CallId]`

Example:
```json
[
  "x:Domain/get",
  {
    "ids": ["dom_example_com"]
  },
  "c0"
]
```

### Response Parsing & ID Matching (`responseById`)
JMAP batches multiple method responses into `methodResponses`. The helper `responseById(res, callId)` extracts the exact result matching the original `callId`:
```typescript
const [name, data] = responseById(res, "c0")
if (name === "error") throw mapHttpError(500, data)
```

---

## 3. Entity Models & Data Normalization

### 3.1 Domains (`x:Domain`)
Managed via `src/lib/stalwart/domains.ts`:

| Stalwart Attribute | TypeScript Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Fully qualified domain name (e.g. `example.com`). |
| `description` | `string` | Administrative notes or label. |
| `isEnabled` | `boolean` | When `false`, Stalwart rejects incoming mail and blocks authentication. |
| `catchAllAddress`| `string \| null`| Fallback email address for unrouted local parts. |
| `allowRelaying` | `boolean` | When `true`, enables backup/split MX relaying for unknown users. |
| `subAddressing` | `string` | Sub-addressing delimiter (e.g. `+` for `user+tag@domain`). |

#### CRUD Method Calls
- **Query:** `["x:Domain/query", { "filter": {} }, "c0"]`
- **Get:** `["x:Domain/get", { "ids": ["dom_123"] }, "c1"]`
- **Set (Create):** `["x:Domain/set", { "create": { "k1": { ... } } }, "c2"]`
- **Set (Update):** `["x:Domain/set", { "update": { "dom_123": { ... } } }, "c3"]`
- **Set (Destroy):** `["x:Domain/set", { "destroy": ["dom_123"] }, "c4"]`

---

### 3.2 Accounts / Mailboxes (`x:Account`)
Managed via `src/lib/stalwart/accounts.ts`:

| Stalwart Attribute | TypeScript Type | Description |
| :--- | :--- | :--- |
| `email` | `string` | Primary email address (`user@domain.com`). |
| `name` | `string` | User display name. |
| `secrets` | `object` | Holds password hashes or clear credentials on creation. |
| `quota.storage` | `number` | Maximum allowed mailbox storage in bytes. |
| `isEnabled` | `boolean` | Account active or suspended state. |
| `roles` | `string[]` | Account permissions (e.g. `["user"]`). |

#### Storage Quota Mapping
Stalwart tracks storage quotas in bytes. Mailwart exposes operator-friendly inputs in Megabytes (MB) or Gigabytes (GB) and normalizes values before JMAP submission:
- `quotaBytes = inputMib * 1024 * 1024`
- Unlimited / Server Default = `0` or `null`.

---

### 3.3 Email Aliases & Forwarding
- **Inbound Aliases:** Saved on the `x:Account` object under `aliases`. Normalizer `parseEmailAliases()` and serializer `serializeEmailAliases()` ensure local-parts are correctly combined with the parent domain name.
- **Outbound Forwarders:** Implemented either as Sieve redirect rules or Stalwart alias expansions, with target loop detection to prevent infinite forwarding loops.

---

### 3.4 Catch-All Implementation (`src/lib/stalwart/catchall.ts`)
Stalwart provides native catch-all routing on the domain level:
1. **Address Mode:** `catchAllAddress` is set to an existing mailbox address (e.g. `catch@example.com`). All unrouted mail arriving at `@example.com` lands in this inbox.
2. **Bounce Mode:** `catchAllAddress` is set to `null`. Unknown local-parts are rejected at the SMTP RCPT TO phase with a `550 User unknown` response.
3. **Blackhole Mode:** Advisory mode that drops unrouted mail silently.

The helper `ensureCatchAllMailbox()` checks if a designated catch-all mailbox exists and creates it automatically with an unlimited quota if requested by the operator.

---

### 3.5 Application Passwords (`src/lib/stalwart/app-passwords.ts`)
Stalwart supports application-specific passwords allowing third-party email clients (Thunderbird, iOS Mail, Outlook) to connect without using the master account password.
- **Method:** `x:AppPassword/set`
- Mints a cryptographically secure 16-character random token.
- Associates an operator label (e.g. "MacBook Pro Mail.app").
- Passwords can be revoked at any time from `/dashboard/mailboxes/[id]`.

---

## 4. In-Memory Mock Store (`src/lib/stalwart/mock.ts`)

When Stalwart credentials are not present in `.env.local` or environment variables, mailwart boots in `mock` mode.

### Mock Store Capabilities:
- Stateful in-memory database holding pre-seeded domains (`example.com`, `example.net`, `example.org`, `internal.test`).
- Mock accounts (`admin@example.com`, `ops@example.com`, `hello@example.com`) with randomized quota usage metrics.
- Simulated delivery traces and audit events.
- Allows full interactive testing of the UI, wizards, and Copilot tools without network dependencies.
