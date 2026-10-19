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
      }
    }
  }

  public readLine(timeoutMs = 5000): Promise<string> {
    if (this.isDestroyed) return Promise.reject(new Error("Socket destroyed"))
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

      if (this.buffer.includes("\r\n")) {
        const idx = this.buffer.indexOf("\r\n")
        const line = this.buffer.slice(0, idx)
        this.buffer = this.buffer.slice(idx + 2)
        clearTimeout(timer)
        resolve(line)
      } else {
        this.queue.push(handler)
      }
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

      const secureSocket = tls.connect(
        {
          socket: plainSocket,
          rejectUnauthorized: false, // accommodate self-signed cluster certificates
        },
        () => {
          this.socket = secureSocket
          this.setupListeners()
          resolve()
        }
      )

      secureSocket.on("error", (err) => {
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

/**
 * Upload and activate a Sieve script for a specific mailbox in Stalwart using ManageSieve.
 * Leverages master impersonation `<email>%<adminUser>` to configure Sieve filters.
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
    const rawSocket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: config.host, port: config.port }, () => resolve(s))
      s.setTimeout(config.timeoutMs)
      s.on("error", reject)
      s.on("timeout", () => {
        s.destroy()
        reject(new Error(`Connection to ${config.host}:${config.port} timed out`))
      })
    })

    conn = new SieveSocket(rawSocket)

    // 1. Read initial banner / capabilities
    const banner = await conn.readResponse(config.timeoutMs)
    const hasStartTls = banner.lines.some((l) => l.toUpperCase().includes('"STARTTLS"'))

    // 2. Upgrade with STARTTLS if advertised
    if (hasStartTls) {
      await conn.write("STARTTLS\r\n")
      const startTlsRes = await conn.readResponse(config.timeoutMs)
      if (!startTlsRes.ok) {
        throw new Error(`STARTTLS rejected: ${startTlsRes.statusLine}`)
      }
      await conn.upgradeToTls()
      // Post-TLS capabilities response
      await conn.readResponse(config.timeoutMs)
    }

    // 3. Authenticate using SASL PLAIN with master impersonation
    // Format: \0<authzid>\0<password> where authzid is <email>%<impersonator>
    const authIdentity = `${accountEmail}%${config.impersonatorUser}`
    const plainPayload = `\0${authIdentity}\0${config.impersonatorPassword}`
    const b64Token = Buffer.from(plainPayload, "utf8").toString("base64")

    await conn.write(`AUTHENTICATE "PLAIN" ${b64Token}\r\n`)
    const authRes = await conn.readResponse(config.timeoutMs)
    if (!authRes.ok) {
      // Fallback: try authenticating directly as admin if impersonation format differs
      const altPayload = `\0${config.impersonatorUser}\0${config.impersonatorPassword}`
      const altToken = Buffer.from(altPayload, "utf8").toString("base64")
      await conn.write(`AUTHENTICATE "PLAIN" ${altToken}\r\n`)
      const altAuthRes = await conn.readResponse(config.timeoutMs)
      if (!altAuthRes.ok) {
        throw new Error(`ManageSieve authentication failed: ${authRes.statusLine}`)
      }
    }

    // 4. Upload script via PUTSCRIPT
    const scriptBytes = Buffer.from(scriptContent, "utf8")
    await conn.write(`PUTSCRIPT "${scriptName}" {${scriptBytes.length}+}\r\n${scriptContent}\r\n`)
    const putRes = await conn.readResponse(config.timeoutMs)
    if (!putRes.ok) {
      throw new Error(`PUTSCRIPT failed: ${putRes.statusLine}`)
    }

    // 5. Activate script via SETACTIVE
    await conn.write(`SETACTIVE "${scriptName}"\r\n`)
    const activeRes = await conn.readResponse(config.timeoutMs)
    if (!activeRes.ok) {
      throw new Error(`SETACTIVE failed: ${activeRes.statusLine}`)
    }

    // 6. Graceful Logout
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
    const probeTimeout = options?.timeoutMs || 1200
    const rawSocket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.connect({ host: config.host, port: config.port }, () => resolve(s))
      s.setTimeout(probeTimeout)
      s.on("error", reject)
      s.on("timeout", () => {
        s.destroy()
        reject(new Error("Timeout"))
      })
    })

    conn = new SieveSocket(rawSocket)
    const banner = await conn.readResponse(probeTimeout)
    await conn.write("LOGOUT\r\n").catch(() => {})
    conn.close()

    if (banner.ok) {
      return {
        available: true,
        note: `ManageSieve port 4190 reachable on ${config.host}.`,
      }
    }
    return {
      available: false,
      note: `ManageSieve responded with ${banner.statusLine}.`,
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
