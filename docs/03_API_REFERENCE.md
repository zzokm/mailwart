# 03 - HTTP API Endpoints Reference

## 1. Overview

While the primary user interface communicates via Next.js Server Actions, **mailwart** exposes dedicated HTTP API route handlers under `src/app/api/` for streaming AI chat, diagnostic probing, Webmail SSO redirects, health monitoring, and external integrations.

All routes run on the Node.js runtime (`export const runtime = "nodejs"`).

---

## 2. API Routes Directory

### 2.1 Authentication & Session

#### `POST /api/auth/login`
- **File:** `src/app/api/auth/login/route.ts`
- **Description:** Authenticates user credentials and seals an `iron-session` HttpOnly cookie.
- **Request Body (JSON):**
  ```json
  {
    "username": "yehia",
    "password": "SecurePassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "user": {
      "id": "usr_9b1deb4d3b7d",
      "username": "yehia",
      "email": "admin@example.com",
      "role": "admin"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing username or password.
  - `401 Unauthorized`: Invalid credentials.
  - `429 Too Many Requests`: Rate limit exceeded for IP or username.

---

### 2.2 AI Copilot & Conversations

#### `POST /api/copilot/chat`
- **File:** `src/app/api/copilot/chat/route.ts`
- **Description:** Streams conversational responses from the configured LLM provider using the Vercel AI SDK UI message stream protocol (`createUIMessageStreamResponse`).
- **Headers:** `Content-Type: application/json`
- **Authentication:** Valid session cookie required (`requireSession()`).
- **Rate Limit:** Sliding window enforced per user (`getCopilotRateLimitStatus()`).
- **Request Body (JSON):**
  ```json
  {
    "messages": [
      {
        "role": "user",
        "content": "Create a new mailbox sales@example.com with a 5GB quota"
      }
    ]
  }
  ```
- **Response Stream (`text/event-stream` / `application/json; charset=utf-8`):**
  Returns chunked AI streaming tokens, tool invocations (`tool_call`), and tool results formatted for `@ai-sdk/react`.

---

#### `GET /api/copilot/conversations`
- **File:** `src/app/api/copilot/conversations/route.ts`
- **Description:** Lists saved Copilot conversation threads for the authenticated user.
- **Authentication:** Valid session cookie required.
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "conversations": [
      {
        "id": "conv_8f3a12bc",
        "title": "Configured DNS for example.com",
        "messageCount": 6,
        "createdAt": "2026-10-14T10:15:00.000Z",
        "updatedAt": "2026-10-14T10:22:00.000Z"
      }
    ]
  }
  ```

---

#### `POST /api/copilot/conversations`
- **File:** `src/app/api/copilot/conversations/route.ts`
- **Description:** Creates or persists a Copilot conversation thread.
- **Request Body (JSON):**
  ```json
  {
    "title": "Mailbox provisioning session",
    "provider": { "provider": "openai", "model": "gpt-4o" },
    "messages": []
  }
  ```
- **Response (200 OK):** Returns `{ "ok": true, "conversation": { ... } }`.

---

#### `GET /api/copilot/conversations/[id]`
- **File:** `src/app/api/copilot/conversations/[id]/route.ts`
- **Description:** Retrieves the full message and tool call history for a specific conversation thread.

---

#### `DELETE /api/copilot/conversations/[id]`
- **File:** `src/app/api/copilot/conversations/[id]/route.ts`
- **Description:** Deletes a conversation thread owned by the user.

---

### 2.3 Webmail Single Sign-On

#### `GET /api/webmail/sso`
- **File:** `src/app/api/webmail/sso/route.ts`
- **Description:** Mints a signed HMAC SHA-256 single-sign-on token for a specified mailbox and issues an HTTP 302 redirect directly into Roundcube.
- **Query Parameters:**
  - `email` (string, required): Full email address of the mailbox to enter (e.g. `ops@example.com`).
- **Security & Authorization:**
  - Valid operator session cookie required.
  - Generates token with 120s TTL bound to `email`.
  - Records audit event `webmail.sso`.
- **Redirect Response (302 Found):**
  ```http
  HTTP/1.1 302 Found
  Location: https://email.example.com/webmail/?_task=login&_em_sso=eyJhbGciOi...
  ```

---

### 2.4 Email Deliverability & Scoring

#### `GET /api/deliverability`
- **File:** `src/app/api/deliverability/route.ts`
- **Description:** Runs automated deliverability tests or scrapes third-party mail-tester results.
- **Authentication:** Valid session cookie or `?key=mailwart-diag-2026`.
- **Actions:**
  - `?action=mailboxes`: Ensures dedicated deliverability test mailboxes (`deliv-test@<domain>`) exist across all configured domains.
  - `?action=score&id=<mail-tester-id>`: Fetches and parses live score results from `https://www.mail-tester.com/<id>` (e.g. `9.5/10`).

---

### 2.5 System Health & Diagnostics

#### `GET /api/health`
- **File:** `src/app/api/health/route.ts`
- **Description:** Lightweight health endpoint used by Docker healthchecks and uptime probes.
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "uptime": 142850,
    "timestamp": "2026-10-15T22:50:00.000Z",
    "stalwartConfigured": true
  }
  ```

---

#### `GET /api/diagnostics`
- **File:** `src/app/api/diagnostics/route.ts`
- **Description:** In-depth network and connectivity diagnostics suite for troubleshooting Docker network topologies, hairpin NAT, and port reachability.
- **Security:** Protected by authorization query parameter `?key=mailwart-diag-2026`.
- **Supported Diagnostic Actions (`?action=`):**
  - `?action=ports`: Tests raw TCP and TLS connections across ports 25, 465, 587, 993, 4190, 8080 against `stalwart-mail` and public hosts.
  - `?action=outbound-config`: Dumps active outbound SMTP settings.
  - `?action=test-outbound&to=<email>`: Sends an immediate live SMTP verification email to test deliverability.
  - `?action=jmap-raw`: Executes a raw JMAP echo call to verify credentials and JSON response formatting.

---

### 2.6 User Management (REST)

#### `GET /api/users`
- **File:** `src/app/api/users/route.ts`
- **Description:** Lists all console accounts.
- **Authentication:** Requires administrator session (`requireAdminSession()`).
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "users": [
      {
        "id": "usr_1",
        "username": "yehia",
        "email": "yehia@example.com",
        "role": "admin",
        "createdAt": "2026-08-01T00:00:00.000Z"
      }
    ]
  }
  ```

---

#### `POST /api/users`
- **File:** `src/app/api/users/route.ts`
- **Description:** Creates a new console account.
- **Request Body (JSON):**
  ```json
  {
    "username": "support_agent",
    "email": "support@example.com",
    "password": "TemporaryPassword123!",
    "role": "user"
  }
  ```
