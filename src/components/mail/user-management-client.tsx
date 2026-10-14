"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  UserPlus,
  Trash2,
  ShieldAlert,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  UserCheck,
  LogIn,
  Pencil,
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
import {
  impersonateUserAction,
  adminUpdateUserPasswordAction,
  adminUpdateUserEmailAction,
} from "@/lib/actions/users"

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
  const router = useRouter()
  const [users, setUsers] = useState<SafeUser[]>(initialUsers)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

  // Primary admin password change modal states
  const [userForPassword, setUserForPassword] = useState<SafeUser | null>(null)
  const [adminNewPassword, setAdminNewPassword] = useState("")
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false)

  // Primary admin email change modal states
  const [userForEmail, setUserForEmail] = useState<SafeUser | null>(null)
  const [adminNewEmail, setAdminNewEmail] = useState("")
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false)

  // Delete confirmation modal states
  const [userToDelete, setUserToDelete] = useState<SafeUser | null>(null)
  const [confirmEmailInput, setConfirmEmailInput] = useState("")
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  // Form states
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"admin" | "user">("user")
  const [showPassword, setShowPassword] = useState(false)

  const isAdmin = currentUserRole === "admin"
  const isPrimaryAdmin =
    currentUsername === "yehia" ||
    (initialUsers.find((u) => u.username === currentUsername)?.isPrimary ?? false)

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

  async function handleImpersonate(user: SafeUser) {
    setImpersonatingId(user.id)
    try {
      const res = await impersonateUserAction(user.id)
      if (!res.ok) {
        toast.error(res.error || "Failed to switch account.")
        setImpersonatingId(null)
        return
      }
      toast.success(`Switched session to ${user.username}.`)
      router.push("/dashboard")
      router.refresh()
    } catch {
      toast.error("An unexpected error occurred while switching account.")
      setImpersonatingId(null)
    }
  }

  function openDeleteModal(user: SafeUser) {
    setUserToDelete(user)
    setConfirmEmailInput("")
    setIsDeleteModalOpen(true)
  }

  async function handleConfirmDelete() {
    if (!userToDelete) return
    if (
      confirmEmailInput.trim().toLowerCase() !==
      userToDelete.email.trim().toLowerCase()
    ) {
      toast.error("The entered email address does not match.")
      return
    }

    setDeletingId(userToDelete.id)
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userToDelete.id }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Failed to delete user.")
        return
      }

      toast.success(`User '${userToDelete.username}' has been removed.`)
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id))
      setIsDeleteModalOpen(false)
      setUserToDelete(null)
      setConfirmEmailInput("")
    } catch {
      toast.error("An unexpected error occurred while deleting user.")
    } finally {
      setDeletingId(null)
    }
  }

  async function handleAdminUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!userForPassword || !adminNewPassword) {
      toast.error("Please enter a new password.")
      return
    }

    setIsPasswordSubmitting(true)
    try {
      const res = await adminUpdateUserPasswordAction(
        userForPassword.id,
        adminNewPassword
      )
      if (!res.ok) {
        toast.error(res.error || "Failed to update password.")
        return
      }

      toast.success(
        `Password for '${userForPassword.username}' updated successfully!`
      )
      setIsPasswordModalOpen(false)
      setUserForPassword(null)
      setAdminNewPassword("")
    } catch {
      toast.error("An unexpected error occurred while updating password.")
    } finally {
      setIsPasswordSubmitting(false)
    }
  }

  async function handleAdminUpdateEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!userForEmail || !adminNewEmail.trim()) {
      toast.error("Please enter a valid email address.")
      return
    }

    setIsEmailSubmitting(true)
    try {
      const res = await adminUpdateUserEmailAction(
        userForEmail.id,
        adminNewEmail.trim()
      )
      if (!res.ok) {
        toast.error(res.error || "Failed to update email.")
        return
      }

      toast.success(
        `Email for '${userForEmail.username}' updated to '${adminNewEmail.trim()}'.`
      )
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userForEmail.id ? { ...u, email: adminNewEmail.trim() } : u
        )
      )
      setIsEmailModalOpen(false)
      setUserForEmail(null)
      setAdminNewEmail("")
    } catch {
      toast.error("An unexpected error occurred while updating email.")
    } finally {
      setIsEmailSubmitting(false)
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
              <TableHead className="w-[150px] text-right">Actions</TableHead>
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
                      <div className="flex items-center justify-end gap-1.5">
                        {isPrimaryAdmin && (
                          <>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title={`Directly set password for ${u.username}`}
                              onClick={() => {
                                setUserForPassword(u)
                                setAdminNewPassword("")
                                setShowAdminNewPassword(false)
                                setIsPasswordModalOpen(true)
                              }}
                              className="text-muted-foreground hover:text-primary"
                            >
                              <KeyRound className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              title={`Change email for ${u.username}`}
                              onClick={() => {
                                setUserForEmail(u)
                                setAdminNewEmail(u.email)
                                setIsEmailModalOpen(true)
                              }}
                              className="text-muted-foreground hover:text-primary"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </>
                        )}
                        {isAdmin && !isSelf && (
                          <Button
                            size="xs"
                            variant="outline"
                            title={`Log in as ${u.username}`}
                            disabled={impersonatingId === u.id}
                            onClick={() => handleImpersonate(u)}
                            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground hover:border-primary/50"
                          >
                            {impersonatingId === u.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <LogIn className="size-3" />
                            )}
                            <span>Log in</span>
                          </Button>
                        )}
                        {canDelete ? (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title={`Delete account ${u.username}`}
                            disabled={deletingId === u.id}
                            onClick={() => openDeleteModal(u)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {deletingId === u.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        ) : !isAdmin || (isSelf && !isPrimaryAdmin) ? (
                          <span className="text-[11px] text-muted-foreground/40 px-1">
                            —
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete User Confirmation Modal */}
      <Dialog
        open={isDeleteModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDeleteModalOpen(false)
            setUserToDelete(null)
            setConfirmEmailInput("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="size-4" />
              Confirm User Account Deletion
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All access, domains, and mailboxes associated with this user will be removed.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3 text-xs">
            <p className="text-muted-foreground">
              To permanently delete user account <strong className="font-mono text-foreground font-semibold">{userToDelete?.username}</strong>, please enter their exact email address below:
            </p>
            <div className="rounded-md border border-border/80 bg-muted/40 p-2 font-mono text-center text-xs select-all text-foreground">
              {userToDelete?.email}
            </div>
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="confirm-user-email">Enter email address to confirm</Label>
              <Input
                id="confirm-user-email"
                type="email"
                placeholder={userToDelete?.email}
                value={confirmEmailInput}
                onChange={(e) => setConfirmEmailInput(e.target.value)}
                disabled={Boolean(deletingId)}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(deletingId)}
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                Boolean(deletingId) ||
                !userToDelete ||
                confirmEmailInput.trim().toLowerCase() !==
                  userToDelete.email.trim().toLowerCase()
              }
              onClick={handleConfirmDelete}
            >
              {deletingId ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Delete Account"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Primary Admin Direct Password Change Modal */}
      <Dialog
        open={isPasswordModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsPasswordModalOpen(false)
            setUserForPassword(null)
            setAdminNewPassword("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAdminUpdatePassword}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                Change Password for {userForPassword?.username}
              </DialogTitle>
              <DialogDescription>
                As primary administrator, you can directly override this account&apos;s password to any password you want.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-new-password">New Password</Label>
                <button
                  type="button"
                  onClick={() => {
                    const chars =
                      "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*"
                    let res = ""
                    for (let i = 0; i < 16; i++) {
                      res += chars.charAt(Math.floor(Math.random() * chars.length))
                    }
                    setAdminNewPassword(res)
                    setShowAdminNewPassword(true)
                  }}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <KeyRound className="size-3" />
                  Generate
                </button>
              </div>
              <div className="relative">
                <Input
                  id="admin-new-password"
                  type={showAdminNewPassword ? "text" : "password"}
                  placeholder="Enter any password"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  disabled={isPasswordSubmitting}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminNewPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAdminNewPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isPasswordSubmitting}
                onClick={() => setIsPasswordModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPasswordSubmitting || !adminNewPassword}
              >
                {isPasswordSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Update Password"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Primary Admin Direct Email Change Modal */}
      <Dialog
        open={isEmailModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEmailModalOpen(false)
            setUserForEmail(null)
            setAdminNewEmail("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAdminUpdateEmail}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="size-4 text-primary" />
                Change Email for {userForEmail?.username}
              </DialogTitle>
              <DialogDescription>
                As primary administrator, you can directly update the email address for this user.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <Label htmlFor="admin-new-email">New Email Address</Label>
              <Input
                id="admin-new-email"
                type="email"
                placeholder="user@domain.com"
                value={adminNewEmail}
                onChange={(e) => setAdminNewEmail(e.target.value)}
                disabled={isEmailSubmitting}
                required
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isEmailSubmitting}
                onClick={() => setIsEmailModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isEmailSubmitting || !adminNewEmail.trim()}
              >
                {isEmailSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Update Email"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

