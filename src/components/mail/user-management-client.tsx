"use client"

import { useState } from "react"
import {
  UserPlus,
  Trash2,
  ShieldAlert,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SafeUser } from "@/lib/db/users"

interface UserManagementClientProps {
  initialUsers: SafeUser[]
  currentUserId?: string
  currentUsername?: string
  currentUserRole?: string
}

export function UserManagementClient({
  initialUsers,
  currentUserId,
  currentUsername,
  currentUserRole,
}: UserManagementClientProps) {
  const [users, setUsers] = useState<SafeUser[]>(initialUsers)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form states
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"admin" | "user">("user")
  const [showPassword, setShowPassword] = useState(false)

  const isAdmin = currentUserRole === "admin"

  function resetForm() {
    setUsername("")
    setEmail("")
    setPassword("")
    setRole("user")
    setShowPassword(false)
  }

  function handleGeneratePassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*"
    let res = ""
    for (let i = 0; i < 16; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setPassword(res)
    setShowPassword(true)
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !email.trim() || !password) {
      toast.error("Please fill in all required fields.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          role,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Failed to create user.")
        return
      }

      toast.success(`Account '${username}' created successfully!`)
      if (data.user) {
        setUsers((prev) => [...prev, data.user])
      }
      setIsDialogOpen(false)
      resetForm()
    } catch {
      toast.error("An unexpected error occurred while creating user.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteUser(user: SafeUser) {
    if (!confirm(`Are you sure you want to delete user account '${user.username}'?`)) {
      return
    }

    setDeletingId(user.id)
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Failed to delete user.")
        return
      }

      toast.success(`User '${user.username}' has been removed.`)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
    } catch {
      toast.error("An unexpected error occurred while deleting user.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">User Accounts</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {users.length} {users.length === 1 ? "user" : "users"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage authorized console accounts and permissions. Only administrators can create or revoke access.
          </p>
        </div>

        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger
              render={
                <Button size="sm" className="gap-1.5 self-start sm:self-auto">
                  <UserPlus className="size-4" />
                  Add User
                </Button>
              }
            />
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleCreateUser}>
                <DialogHeader>
                  <DialogTitle>Create New User Account</DialogTitle>
                  <DialogDescription>
                    Provide credentials for the new console user. Public registration is disabled.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="create-username">Username</Label>
                    <Input
                      id="create-username"
                      placeholder="e.g. operator"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Letters, numbers, underscores, and hyphens (3-32 characters).
                    </p>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="create-email">Email Address</Label>
                    <Input
                      id="create-email"
                      type="email"
                      placeholder="e.g. user@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="create-password">Password</Label>
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        <KeyRound className="size-3" />
                        Generate Secure
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="create-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Hashed securely with scrypt before storing in PostgreSQL.
                    </p>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="create-role">Access Role</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                          role === "user"
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value="user"
                          checked={role === "user"}
                          onChange={() => setRole("user")}
                          className="sr-only"
                        />
                        <UserCheck className="size-4 text-muted-foreground" />
                        <div>
                          <div>User</div>
                          <div className="text-[10px] text-muted-foreground">
                            Standard access
                          </div>
                        </div>
                      </label>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                          role === "admin"
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value="admin"
                          checked={role === "admin"}
                          onChange={() => setRole("admin")}
                          className="sr-only"
                        />
                        <ShieldAlert className="size-4 text-emerald-500" />
                        <div>
                          <div>Admin</div>
                          <div className="text-[10px] text-muted-foreground">
                            Full management
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Create Account"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-lg border border-border/70 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[180px]">User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[100px]">Role</TableHead>
              <TableHead className="w-[150px]">Created</TableHead>
              <TableHead className="w-[70px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-xs text-muted-foreground"
                >
                  No users found in database.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf =
                  u.id === currentUserId || u.username === currentUsername
                const isYehiaAdmin = u.username === "yehia"
                const canDelete = isAdmin && !isSelf && !isYehiaAdmin

                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{u.username}</span>
                        {isSelf && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            You
                          </span>
                        )}
                        {isYehiaAdmin && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            Primary
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium"
                        >
                          admin
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-normal"
                        >
                          user
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {u.createdAt
                        ? new Date(u.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Initial Seed"}
                    </TableCell>
                    <TableCell className="text-right">
                      {canDelete ? (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title={`Delete account ${u.username}`}
                          disabled={deletingId === u.id}
                          onClick={() => handleDeleteUser(u)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {deletingId === u.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/40">
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
