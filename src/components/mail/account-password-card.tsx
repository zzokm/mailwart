"use client"

import { useState, useEffect } from "react"
import {
  KeyRound,
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
  Mail,
  CheckCircle2,
  XCircle,
  Lock,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OtpInput } from "@/components/ui/otp-input"
import { checkPasswordStrength } from "@/lib/validations/auth"
import {
  primaryAdminSelfUpdatePasswordAction,
  requestInAccountPasswordChangeOtpAction,
  verifyInAccountPasswordChangeOtpAction,
  completeInAccountPasswordChangeAction,
} from "@/lib/actions/users"

interface AccountPasswordCardProps {
  isPrimaryAdmin: boolean
  userEmail: string
}

export function AccountPasswordCard({
  isPrimaryAdmin,
  userEmail,
}: AccountPasswordCardProps) {


  // Primary Admin direct password state
  const [directPassword, setDirectPassword] = useState("")
  const [showDirectPassword, setShowDirectPassword] = useState(false)
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false)

  // Secondary admin / standard user OTP flow state
  // Steps: "idle" | "otp" | "new-password"
  const [otpStep, setOtpStep] = useState<"idle" | "otp" | "new-password">("idle")
  const [isOtpSending, setIsOtpSending] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState("")
  const [countdown, setCountdown] = useState(0)
  const [otpCode, setOtpCode] = useState("")
  const [isOtpVerifying, setIsOtpVerifying] = useState(false)
  const [resetToken, setResetToken] = useState("")

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // Primary Admin: Direct password update
  async function handleDirectUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!directPassword) {
      toast.error("Please enter a new password.")
      return
    }

    setIsDirectSubmitting(true)
    try {
      const res = await primaryAdminSelfUpdatePasswordAction(directPassword)
      if (!res.ok) {
        toast.error(res.error || "Failed to update password.")
        return
      }

      toast.success("Password updated successfully!")
      setDirectPassword("")
    } catch {
      toast.error("An unexpected error occurred.")
    } finally {
      setIsDirectSubmitting(false)
    }
  }

  // OTP Flow Step 1: Send OTP
  async function handleSendOtp() {
    setIsOtpSending(true)
    try {
      const res = await requestInAccountPasswordChangeOtpAction()
      if (!res.ok) {
        toast.error(res.error || "Failed to send verification code.")
        return
      }
      if (!res.data) {
        toast.error("Failed to receive verification details.")
        return
      }

      setMaskedEmail(res.data.maskedEmail)
      setCountdown(res.data.cooldownSeconds || 60)
      setOtpCode("")
      setOtpStep("otp")
      toast.success("A 6-digit verification code has been dispatched to your email.")
    } catch {
      toast.error("An unexpected error occurred while sending code.")
    } finally {
      setIsOtpSending(false)
    }
  }

  // OTP Flow Step 2: Verify OTP
  async function handleVerifyOtp(codeToVerify?: string) {
    const code = (codeToVerify || otpCode).trim()
    if (code.length !== 6) {
      toast.error("Please enter the complete 6-digit verification code.")
      return
    }

    setIsOtpVerifying(true)
    try {
      const res = await verifyInAccountPasswordChangeOtpAction(code)
      if (!res.ok) {
        toast.error(res.error || "Invalid or expired verification code.")
        return
      }
      if (!res.data) {
        toast.error("Verification session failed.")
        return
      }

      setResetToken(res.data.resetToken)
      setOtpStep("new-password")

      toast.success("Code verified! Set your new password below.")
    } catch {
      toast.error("Failed to verify code.")
    } finally {
      setIsOtpVerifying(false)
    }
  }

  // OTP Flow Step 3: Complete Password Change
  async function handleCompleteOtpChange(e: React.FormEvent) {
    e.preventDefault()
    const strength = checkPasswordStrength(newPassword)
    if (!strength.valid) {
      toast.error("Password does not meet complexity requirements.")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.")
      return
    }

    setIsCompleting(true)
    try {
      const res = await completeInAccountPasswordChangeAction(
        resetToken,
        newPassword,
        confirmPassword
      )
      if (!res.ok) {
        toast.error(res.error || "Failed to update password.")
        return
      }

      toast.success("Your password has been changed successfully!")
      // Reset state back to idle
      setOtpStep("idle")
      setOtpCode("")
      setResetToken("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      toast.error("Failed to complete password change.")
    } finally {
      setIsCompleting(false)
    }
  }

  const strength = checkPasswordStrength(newPassword)
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword

  return (
    <div className="rounded-xl border border-border/80 bg-card/40 p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h2 className="text-sm font-medium">Password Management</h2>
        </div>
        {isPrimaryAdmin ? (
          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            Primary Administrator Mode
          </span>
        ) : (
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
            OTP Verified
          </span>
        )}
      </div>

      {/* CASE 1: PRIMARY ADMIN - DIRECT OVERRIDE */}
      {isPrimaryAdmin ? (
        <form onSubmit={handleDirectUpdate} className="space-y-4 max-w-md">
          <p className="text-xs text-muted-foreground">
            As the primary administrator, you can directly set your password to any string you want without OTP verification.
          </p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="admin-direct-password">New Password</Label>
              <button
                type="button"
                onClick={() => {
                  const chars =
                    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*"
                  let res = ""
                  for (let i = 0; i < 16; i++) {
                    res += chars.charAt(Math.floor(Math.random() * chars.length))
                  }
                  setDirectPassword(res)
                  setShowDirectPassword(true)
                }}
                className="text-[11px] text-primary hover:underline font-mono"
              >
                Generate Secure
              </button>
            </div>
            <div className="relative">
              <Input
                id="admin-direct-password"
                type={showDirectPassword ? "text" : "password"}
                placeholder="Enter any password"
                value={directPassword}
                onChange={(e) => setDirectPassword(e.target.value)}
                disabled={isDirectSubmitting}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowDirectPassword((p) => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showDirectPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={isDirectSubmitting || !directPassword}
          >
            {isDirectSubmitting ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <Lock className="size-3.5 mr-1.5" />
            )}
            Update Password
          </Button>
        </form>
      ) : (
        /* CASE 2: SECONDARY ADMIN & REGULAR USERS - OTP VERIFIED FLOW */
        <div className="space-y-4 max-w-md">
          {otpStep === "idle" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                To change your password, a 6-digit verification code will be sent to your registered email address (<span className="font-mono text-foreground font-medium">{userEmail}</span>).
              </p>
              <Button
                type="button"
                size="sm"
                onClick={handleSendOtp}
                disabled={isOtpSending}
                className="gap-1.5"
              >
                {isOtpSending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Mail className="size-3.5" />
                )}
                Send Verification Code
              </Button>
            </div>
          )}

          {otpStep === "otp" && (
            <div className="space-y-4 rounded-lg border border-border/80 bg-background/50 p-4">
              <div>
                <h4 className="text-xs font-semibold text-foreground">Enter 6-Digit Code</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Code sent to <span className="font-mono text-foreground">{maskedEmail || userEmail}</span>.
                </p>
              </div>

              <OtpInput
                length={6}
                value={otpCode}
                onChange={setOtpCode}
                onComplete={(val) => handleVerifyOtp(val)}
                disabled={isOtpVerifying}
                autoFocus
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>Didn&apos;t receive it?</span>
                {countdown > 0 ? (
                  <span className="font-mono text-muted-foreground">
                    Resend in {countdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isOtpSending || isOtpVerifying}
                    className="text-primary hover:underline font-medium"
                  >
                    Resend code
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleVerifyOtp()}
                  disabled={isOtpVerifying || otpCode.length !== 6}
                >
                  {isOtpVerifying ? (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Verify Code
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setOtpStep("idle")}
                  disabled={isOtpVerifying}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {otpStep === "new-password" && (
            <form onSubmit={handleCompleteOtpChange} className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-foreground">Set New Password</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Verification verified. Enter your new strong password below.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inaccount-new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="inaccount-new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isCompleting}
                    required
                    autoFocus
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inaccount-confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="inaccount-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isCompleting}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Password strength checklist */}
              <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5 text-xs space-y-1.5">
                <div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider mb-1">
                  Security Criteria
                </div>
                <div className="flex items-center gap-1.5">
                  {strength.hasMinLength ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                  )}
                  <span className={strength.hasMinLength ? "text-foreground" : "text-muted-foreground"}>
                    At least 8 characters
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {strength.hasUpper && strength.hasLower ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                  )}
                  <span className={strength.hasUpper && strength.hasLower ? "text-foreground" : "text-muted-foreground"}>
                    Uppercase and lowercase characters
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {strength.hasNumberOrSpecial ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                  )}
                  <span className={strength.hasNumberOrSpecial ? "text-foreground" : "text-muted-foreground"}>
                    At least one number or symbol
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {passwordsMatch ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                  )}
                  <span className={passwordsMatch ? "text-foreground" : "text-muted-foreground"}>
                    Passwords match
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isCompleting || !strength.valid || !passwordsMatch}
                >
                  {isCompleting ? (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  ) : (
                    <ShieldCheck className="size-3.5 mr-1.5" />
                  )}
                  Save New Password
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setOtpStep("idle")}
                  disabled={isCompleting}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
