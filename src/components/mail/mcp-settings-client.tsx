"use client"

import { useState, useTransition } from "react"
import {
  Bot,
  Check,
  Copy,
  Key,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Terminal,
  Zap,
  Globe,
  Mail,
} from "lucide-react"
import { toast } from "sonner"

import {
  createMcpApiKeyAction,
  listMcpApiKeysAction,
  revokeMcpApiKeyAction,
} from "@/lib/actions/mcp"
import type { GeneratedMcpApiKey, SafeMcpApiKey } from "@/lib/db/mcp-keys"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Props = {
  initialKeys: SafeMcpApiKey[]
}

export function McpSettingsClient({ initialKeys }: Props) {
  const [keys, setKeys] = useState<SafeMcpApiKey[]>(initialKeys)
  const [newKeyName, setNewKeyName] = useState("")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<GeneratedMcpApiKey | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)
  const [activeSnippetTab, setActiveSnippetTab] = useState<"claude" | "cursor" | "antigravity">("claude")
  const [pending, startTransition] = useTransition()

  const refreshKeys = () => {
    startTransition(async () => {
      const res = await listMcpApiKeysAction()
      if (res.ok) {
        setKeys(res.data)
      } else {
        toast.error(res.error || "Failed to refresh keys")
      }
    })
  }

  const handleCreate = () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for the key.")
      return
    }

    startTransition(async () => {
      const res = await createMcpApiKeyAction(newKeyName.trim())
      if (res.ok) {
        setNewlyCreatedKey(res.data)
        setIsCreateOpen(false)
        setNewKeyName("")
        refreshKeys()
        toast.success("MCP API key generated successfully.")
      } else {
        toast.error(res.error || "Failed to generate key.")
      }
    })
  }

  const handleRevoke = (id: string, name: string) => {
    if (!confirm(`Revoke MCP API key "${name}"? External agents using this key will immediately lose access.`)) {
      return
    }

    startTransition(async () => {
      const res = await revokeMcpApiKeyAction(id)
      if (res.ok) {
        toast.success(`Key "${name}" revoked.`)
        refreshKeys()
      } else {
        toast.error(res.error || "Failed to revoke key.")
      }
    })
  }

  const copyToClipboard = (text: string, type = "key") => {
    navigator.clipboard.writeText(text)
    if (type === "key") {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    } else {
      setCopiedSnippet(type)
      setTimeout(() => setCopiedSnippet(null), 2000)
    }
    toast.success("Copied to clipboard.")
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://email.yehia.dev"
  const sseUrl = `${origin}/api/mcp/sse`
  const jsonRpcUrl = `${origin}/api/mcp`

  const claudeConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        mailwart: {
          url: sseUrl,
          headers: {
            Authorization: newlyCreatedKey ? `Bearer ${newlyCreatedKey.rawKey}` : "Bearer <YOUR_MCP_API_KEY>",
          },
        },
      },
    },
    null,
    2
  )

  const cursorConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        mailwart: {
          url: sseUrl,
          headers: {
            Authorization: newlyCreatedKey ? `Bearer ${newlyCreatedKey.rawKey}` : "Bearer <YOUR_MCP_API_KEY>",
          },
        },
      },
    },
    null,
    2
  )

  const antigravitySnippet = `agy mcp add mailwart --url "${sseUrl}" --header "Authorization=Bearer ${
    newlyCreatedKey ? newlyCreatedKey.rawKey : "<YOUR_MCP_API_KEY>"
  }"`

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card className="border-border/60 bg-gradient-to-br from-card via-card to-emerald-950/10">
        <CardHeader className="flex flex-row items-start justify-between pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-xl">Model Context Protocol (MCP) Server</CardTitle>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 font-mono text-xs">
                56 Tools Active
              </Badge>
            </div>
            <CardDescription className="text-sm">
              Connect external AI agents (Claude Desktop, Cursor, Antigravity, Cline) to administer Mailwart and read/search/send mailbox emails.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Generate API Key
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-lg border border-border/50 bg-background/50 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Globe className="h-3.5 w-3.5 text-blue-400" />
                <span>HTTP SSE Transport</span>
              </div>
              <code className="text-xs font-mono break-all text-foreground">{sseUrl}</code>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-background/50 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span>JSON-RPC 2.0 Endpoint</span>
              </div>
              <code className="text-xs font-mono break-all text-foreground">{jsonRpcUrl}</code>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-background/50 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Mail className="h-3.5 w-3.5 text-purple-400" />
                <span>Mailbox JMAP Engine</span>
              </div>
              <div className="text-xs font-medium text-emerald-400">Direct Read, Search &amp; Send</div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-background/50 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                <span>Authentication</span>
              </div>
              <div className="text-xs font-mono text-muted-foreground">Bearer mw_mcp_...</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys Table */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4 text-emerald-400" />
              Active MCP API Keys
            </CardTitle>
            <CardDescription className="text-xs">
              Cryptographically hashed with SHA-256 and constant-time validated.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={refreshKeys}
            disabled={pending}
            title="Refresh API keys"
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                    No active MCP API keys. Generate one above to connect external AI agents.
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium text-foreground">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{k.prefix}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{k.createdBy}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {k.lastUsedAt ? (
                        <span className="text-emerald-400">{new Date(k.lastUsedAt).toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(k.id, k.name)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/20 h-7 px-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Revoke</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Client Configuration Snippets */}
      <Card className="border-border/60">
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-400" />
                Client Quick Connect Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                Copy and paste the configuration snippet directly into your agent or editor settings.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setActiveSnippetTab("claude")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeSnippetTab === "claude" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Claude Desktop
              </button>
              <button
                type="button"
                onClick={() => setActiveSnippetTab("cursor")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeSnippetTab === "cursor" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Cursor / Windsurf
              </button>
              <button
                type="button"
                onClick={() => setActiveSnippetTab("antigravity")}
                className={`px-2.5 py-1 rounded transition-colors ${
                  activeSnippetTab === "antigravity" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Antigravity CLI
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <pre className="p-4 rounded-lg bg-black/60 border border-border/40 font-mono text-xs overflow-x-auto text-emerald-300">
              {activeSnippetTab === "claude" && claudeConfigSnippet}
              {activeSnippetTab === "cursor" && cursorConfigSnippet}
              {activeSnippetTab === "antigravity" && antigravitySnippet}
            </pre>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                copyToClipboard(
                  activeSnippetTab === "claude"
                    ? claudeConfigSnippet
                    : activeSnippetTab === "cursor"
                    ? cursorConfigSnippet
                    : antigravitySnippet,
                  activeSnippetTab
                )
              }
              className="absolute top-2 right-2 h-7 gap-1 text-xs bg-background/80 hover:bg-background"
            >
              {copiedSnippet === activeSnippetTab ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generate Key Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate New MCP API Key</DialogTitle>
            <DialogDescription>
              Assign a descriptive name for the agent or environment that will use this key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. Claude Desktop Production, Cursor Agent"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={pending} className="bg-emerald-600 hover:bg-emerald-500">
              Generate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal Generated Key Modal */}
      <Dialog open={Boolean(newlyCreatedKey)} onOpenChange={(open) => !open && setNewlyCreatedKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <Key className="h-5 w-5" />
              MCP API Key Generated
            </DialogTitle>
            <DialogDescription>
              Copy this API key now. For your security, this key will <strong>never be shown again</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Key Label</Label>
              <div className="font-medium text-sm">{newlyCreatedKey?.name}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Secret Token</Label>
              <div className="relative">
                <Input
                  readOnly
                  value={newlyCreatedKey?.rawKey || ""}
                  className="font-mono text-xs pr-10 bg-black/40 text-emerald-400 border-emerald-500/50 selection:bg-emerald-800"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => newlyCreatedKey && copyToClipboard(newlyCreatedKey.rawKey, "key")}
                  className="absolute right-1 top-1 h-7 w-7 text-emerald-400 hover:text-emerald-300"
                >
                  {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setNewlyCreatedKey(null)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Done, I have saved my key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
