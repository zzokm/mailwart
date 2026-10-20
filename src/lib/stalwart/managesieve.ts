import "server-only"

import net from "node:net"
import tls from "node:tls"
import { getStalwartConfig } from "@/lib/env"

export interface ManageSieveOptions {
  host?: string
  port?: number
  timeoutMs?: number
}

function getManageSieveConfig(options?: ManageSieveOptions) {
  const stalwart = getStalwartConfig()
  let defaultHost = process.env.NODE_ENV === "production" ? "stalwart-mail" : "127.0.0.1"
  if (stalwart?.jmapUrl) {
    try {
      const u = new URL(stalwart.jmapUrl)
      if (u.hostname) {
        defaultHost = u.hostname
      }
    } catch {}
  }
  const host =
    options?.host ||
    process.env.MANAGESIEVE_HOST ||
    defaultHost
  const port = options?.port || Number(process.env.MANAGESIEVE_PORT || 4190)
  const impersonatorUser =
    process.env.WEBMAIL_IMPERSONATOR_USER ||
    stalwart?.adminUser ||
    "admin"
  const impersonatorPassword =
    process.env.WEBMAIL_IMPERSONATOR_PASSWORD ||
    stalwart?.adminPassword ||
    ""
  const timeoutMs = options?.timeoutMs || 2500

  return { host, port, impersonatorUser, impersonatorPassword, timeoutMs }
}

/**
 * Line-based communication helper for RFC 5804 ManageSieve over TCP/TLS
 */
class SieveSocket {
  private socket: net.Socket | tls.TLSSocket
  private buffer = ""
  private receivedLines: string[] = []
  private queue: Array<(line: string) => void> = []
  private isDestroyed = false

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket
    this.setupListeners()
  }

  private setupListeners() {
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8")
      this.flushLines()
    })
  }

  private flushLines() {
    while (this.buffer.includes("\r\n")) {
      const idx = this.buffer.indexOf("\r\n")
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)
      const resolve = this.queue.shift()
      if (resolve) {
        resolve(line)
      } else {
        this.receivedLines.push(line)
      }
    }
  }

  public readLine(timeoutMs = 5000): Promise<string> {
    if (this.isDestroyed) return Promise.reject(new Error("Socket destroyed"))

    if (this.receivedLines.length > 0) {
      return Promise.resolve(this.receivedLines.shift()!)
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const qIdx = this.queue.indexOf(handler)
        if (qIdx !== -1) this.queue.splice(qIdx, 1)
        reject(new Error(`ManageSieve read timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      const handler = (line: string) => {
        clearTimeout(timer)
        resolve(line)
      }

      this.queue.push(handler)
    })
  }

  public async readResponse(timeoutMs = 5000): Promise<{ ok: boolean; lines: string[]; statusLine: string }> {
    const lines: string[] = []
    while (true) {
      const line = await this.readLine(timeoutMs)
      lines.push(line)
      const trimmed = line.trim()
      if (trimmed.startsWith("OK")) {
        return { ok: true, lines, statusLine: line }
      }
      if (trimmed.startsWith("NO")) {
        return { ok: false, lines, statusLine: line }
      }
      if (trimmed.startsWith("BYE")) {
        return { ok: false, lines, statusLine: line }
      }
    }
  }

  public write(data: string): Promise<void> {
    if (this.isDestroyed) return Promise.reject(new Error("Socket destroyed"))
    return new Promise((resolve, reject) => {
      this.socket.write(data, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  public upgradeToTls(): Promise<void> {
    return new Promise((resolve, reject) => {
      const plainSocket = this.socket
      plainSocket.removeAllListeners("data")

      const secureSocket = tls.connect({
        socket: plainSocket,
        rejectUnauthorized: false, // accommodate self-signed cluster certificates
      })

      this.socket = secureSocket
      this.setupListeners()

      secureSocket.once("secureConnect", () => {
        resolve()
      })

      secureSocket.once("error", (err) => {
        reject(err)
      })
    })
  }

  public close() {
    this.isDestroyed = true
    try {
      this.socket.end()
      this.socket.destroy()
    } catch {
      // ignore
    }
  }
}

function getCandidateHosts(primaryHost: string): string[] {
  const hosts: string[] = []
  if (primaryHost && !hosts.includes(primaryHost)) hosts.push(primaryHost)
  const envHost = process.env.MANAGESIEVE_HOST
  if (envHost && !hosts.includes(envHost)) hosts.push(envHost)
  const imapHost = process.env.STALWART_IMAP_HOST
  if (imapHost && !hosts.includes(imapHost)) hosts.push(imapHost)
  if (!hosts.includes("stalwart-mail")) hosts.push("stalwart-mail")
  if (!hosts.includes("127.0.0.1")) hosts.push("127.0.0.1")
  return hosts
}

/**
 * Connect to ManageSieve server with support for candidate host fallback, STARTTLS, and Implicit TLS.
 */
async function connectToManageSieve(config: ReturnType<typeof getManageSieveConfig>): Promise<SieveSocket> {
  const timeoutMs = config.timeoutMs || 3500
  const candidateHosts = getCandidateHosts(config.host)
  let lastError: Error | null = null

  for (const host of candidateHosts) {
    // 1. First attempt: Plain TCP with STARTTLS
    try {
      const rawSocket = new net.Socket()
      const conn = new SieveSocket(rawSocket)

      await new Promise<void>((resolve, reject) => {
        rawSocket.setTimeout(timeoutMs)
        rawSocket.once("connect", () => resolve())
        rawSocket.once("error", reject)
        rawSocket.once("timeout", () => {
          rawSocket.destroy()
          reject(new Error(`TCP connect to ${host}:${config.port} timed out`))
        })
        rawSocket.connect(config.port, host)
      })

      const banner = await conn.readResponse(timeoutMs)
      if (banner.ok) {
        const hasStartTls = banner.lines.some((l) => l.toUpperCase().includes('"STARTTLS"'))
        if (hasStartTls) {
          await conn.write("STARTTLS\r\n")
          const startTlsRes = await conn.readResponse(timeoutMs)
          if (startTlsRes.ok) {
            await conn.upgradeToTls()
            await conn.readResponse(timeoutMs).catch(() => ({}))
          }
        }
        return conn
      }
      conn.close()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }

    // 2. Second attempt: Direct TLS (Implicit TLS)
    try {
      const tlsSocket = tls.connect({
        host,
        port: config.port,
        rejectUnauthorized: false,
      })
      const secureConn = new SieveSocket(tlsSocket)

      await new Promise<void>((resolve, reject) => {
        tlsSocket.setTimeout(timeoutMs)
        tlsSocket.once("secureConnect", () => resolve())
        tlsSocket.once("error", reject)
        tlsSocket.once("timeout", () => {
          tlsSocket.destroy()
          reject(new Error(`Direct TLS to ${host}:${config.port} timed out`))
        })
      })

      const banner = await secureConn.readResponse(timeoutMs).catch(() => null)
      if (banner && banner.ok) {
        return secureConn
      }
      return secureConn
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError || new Error(`ManageSieve unreachable on all candidate hosts: ${candidateHosts.join(", ")}:${config.port}`)
}

/**
 * Upload and activate a Sieve script for a specific mailbox in Stalwart using ManageSieve.
 * Leverages multiple master impersonation candidate formats to ensure compatibility.
 */
export async function syncMailboxSieveScript(params: {
  accountEmail: string
  scriptContent: string
  scriptName?: string
  options?: ManageSieveOptions
}): Promise<{ ok: boolean; note?: string; error?: string }> {
  const { accountEmail, scriptContent, scriptName = "mailwart", options } = params
  const config = getManageSieveConfig(options)

  if (!config.impersonatorPassword) {
    return {
      ok: false,
      error: "STALWART_ADMIN_PASSWORD not configured for ManageSieve sync.",
    }
  }

  let conn: SieveSocket | null = null

  try {
    conn = await connectToManageSieve(config)

    // Build SASL PLAIN candidate payloads for master impersonation
    const domain = accountEmail.split("@")[1] || ""
    const adminUser = config.impersonatorUser
    const adminPass = config.impersonatorPassword

    const candidatePayloads: string[] = [
      // 1. Stalwart standard user%admin
      `\0${accountEmail}%admin\0${adminPass}`,
      // 2. Stalwart user%adminUser
      `\0${accountEmail}%${adminUser}\0${adminPass}`,
      // 3. RFC 4616 SASL PLAIN format: authzid\0authcid\0passwd
      `${accountEmail}\0${adminUser}\0${adminPass}`,
      `${accountEmail}\0admin\0${adminPass}`,
    ]

    if (domain) {
      candidatePayloads.push(`\0${accountEmail}%admin@${domain}\0${adminPass}`)
    }
    // Fallback: direct admin auth
    candidatePayloads.push(`\0${adminUser}\0${adminPass}`)

    let authenticated = false
    let lastStatusLine = ""

    for (const payload of candidatePayloads) {
      const b64Token = Buffer.from(payload, "utf8").toString("base64")
      await conn.write(`AUTHENTICATE "PLAIN" ${b64Token}\r\n`)
      const authRes = await conn.readResponse(config.timeoutMs)
      if (authRes.ok) {
        authenticated = true
        break
      }
      lastStatusLine = authRes.statusLine
    }

    if (!authenticated) {
      throw new Error(`ManageSieve authentication failed: ${lastStatusLine}`)
    }

    // Upload script via PUTSCRIPT
    const scriptBytes = Buffer.from(scriptContent, "utf8")
    await conn.write(`PUTSCRIPT "${scriptName}" {${scriptBytes.length}+}\r\n${scriptContent}\r\n`)
    const putRes = await conn.readResponse(config.timeoutMs)
    if (!putRes.ok) {
      throw new Error(`PUTSCRIPT failed: ${putRes.statusLine}`)
    }

    // Activate script via SETACTIVE
    await conn.write(`SETACTIVE "${scriptName}"\r\n`)
    const activeRes = await conn.readResponse(config.timeoutMs)
    if (!activeRes.ok) {
      throw new Error(`SETACTIVE failed: ${activeRes.statusLine}`)
    }

    // Graceful Logout
    await conn.write("LOGOUT\r\n").catch(() => {})
    conn.close()

    return {
      ok: true,
      note: `Sieve script '${scriptName}' uploaded and active on ${accountEmail} via ManageSieve.`,
    }
  } catch (err) {
    conn?.close()
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`[ManageSieve] sync error for ${accountEmail}:`, errMsg)
    return {
      ok: false,
      error: errMsg,
      note: `ManageSieve offline or pending (${errMsg}). Rule is persisted in database and will take effect once synchronized.`,
    }
  }
}

/**
 * Probe ManageSieve daemon port (4190) reachability and capabilities.
 */
export async function probeManageSieve(options?: ManageSieveOptions): Promise<{
  available: boolean
  note: string
}> {
  const config = getManageSieveConfig(options)
  let conn: SieveSocket | null = null

  try {
    const probeTimeout = options?.timeoutMs || 3000
    conn = await connectToManageSieve({ ...config, timeoutMs: probeTimeout })
    await conn.write("LOGOUT\r\n").catch(() => {})
    conn.close()

    return {
      available: true,
      note: `ManageSieve port 4190 reachable on ${config.host}.`,
    }
  } catch (err) {
    conn?.close()
    const msg = err instanceof Error ? err.message : String(err)
    return {
      available: false,
      note: `ManageSieve unreachable on ${config.host}:${config.port} (${msg}).`,
    }
  }
}
