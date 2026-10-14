"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion, AnimatePresence } from "motion/react"
import {
  Lock,
  Loader2,
  Eye,
  EyeOff,
  Mail,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"

import { loginAction } from "@/lib/actions/auth"
import { toastActionResult } from "@/lib/action-toast"
import {
  requestPasswordResetAction,
  verifyPasswordResetAction,
  completePasswordResetAction,
} from "@/lib/actions/password-reset"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { OtpInput } from "@/components/ui/otp-input"
import {
  loginSchema,
  checkPasswordStrength,
  type LoginInput,
} from "@/lib/validations/auth"

type ViewState = "login" | "forgot-email" | "forgot-otp" | "forgot-password"

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? "100%" : "-100%",
    opacity: 0,
  }),
}

export function LoginForm() {
  const router = useRouter()

  // Navigation / Slide state
  const [view, setView] = useState<ViewState>("login")
  const [direction, setDirection] = useState<number>(1)

  // Login form state
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Forgot password flow state
  const [resetEmail, setResetEmail] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [emailPending, setEmailPending] = useState(false)

  const [otp, setOtp] = useState("")
  const [otpPending, setOtpPending] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const [resetToken, setResetToken] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordPending, setPasswordPending] = useState(false)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  })

  // Timer countdown for OTP resend
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  function goToView(target: ViewState, dir: number) {
    setDirection(dir)
    setView(target)
  }

  // 1. Standard Login submit
  async function onLoginSubmit(values: LoginInput) {
    setPending(true)
    let result: Awaited<ReturnType<typeof loginAction>>
    try {
      result = await loginAction(values)
    } catch {
      // Direct API fallback
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })
        result = (await res.json()) as Awaited<ReturnType<typeof loginAction>>
      } catch (err) {
        result = {
          ok: false,
          error: err instanceof Error ? err.message : "Sign in failed.",
        }
      }
    }

    if (!toastActionResult(result, { success: "Signed in." })) {
      setPending(false)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  // 2. Request OTP for Email
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    const clean = resetEmail.trim()
    if (!clean || !clean.includes("@")) {
      toast.error("Please enter a valid email address.")
      return
    }

    setEmailPending(true)
    try {
      const res = await requestPasswordResetAction(clean)
      if (!res.ok) {
        toast.error(res.error || "Failed to send verification code.")
        return
      }
      if (!res.data) {
        toast.error("Failed to retrieve verification details.")
        return
      }

      setMaskedEmail(res.data.maskedEmail)
      setCountdown(res.data.cooldownSeconds || 60)
      setOtp("")
      toast.success("A 6-digit verification code has been sent.")
      goToView("forgot-otp", 1)
    } catch {
      toast.error("An unexpected error occurred.")
    } finally {
      setEmailPending(false)
    }
  }

  // Resend OTP
  async function handleResendOtp() {
    if (countdown > 0 || emailPending) return
    setEmailPending(true)
    try {
      const res = await requestPasswordResetAction(resetEmail.trim())
      if (!res.ok) {
        toast.error(res.error || "Failed to resend code.")
        return
      }
      setCountdown(res.data?.cooldownSeconds || 60)
      setOtp("")
      toast.success("New 6-digit verification code sent.")
    } catch {
      toast.error("Failed to resend code.")
    } finally {
      setEmailPending(false)
    }
  }

  // 3. Verify OTP
  async function handleVerifyOtp(codeToVerify?: string) {
    const code = (codeToVerify || otp).trim()
    if (code.length !== 6) {
      toast.error("Please enter the full 6-digit code.")
      return
    }

    setOtpPending(true)
    try {
      const res = await verifyPasswordResetAction(resetEmail.trim(), code)
      if (!res.ok) {
        toast.error(res.error || "Invalid or expired verification code.")
        return
      }
      if (!res.data) {
        toast.error("Verification session failed.")
        return
      }

      setResetToken(res.data.resetToken)

      toast.success("Code verified successfully!")
      goToView("forgot-password", 1)
    } catch {
      toast.error("Verification failed.")
    } finally {
      setOtpPending(false)
    }
  }

  // 4. Complete Password Reset
  async function handleCompleteReset(e: React.FormEvent) {
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

    setPasswordPending(true)
    try {
      const res = await completePasswordResetAction(
        resetToken,
        newPassword,
        confirmPassword
      )
      if (!res.ok) {
        toast.error(res.error || "Failed to update password.")
        return
      }

      toast.success("Password updated successfully! Please sign in.")
      // Pre-fill username field in login form
      form.setValue("username", resetEmail.trim())
      form.setValue("password", "")
      setNewPassword("")
      setConfirmPassword("")
      setOtp("")
      goToView("login", -1)
    } catch {
      toast.error("An error occurred while resetting password.")
    } finally {
      setPasswordPending(false)
    }
  }

  const strength = checkPasswordStrength(newPassword)
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        {/* VIEW 1: SIGN IN */}
        {view === "login" && (
          <motion.div
            key="login"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="w-full"
          >
            <CardHeader className="space-y-1 pb-4 pt-2">
              <CardTitle className="text-xl font-semibold tracking-[-0.02em]">
                Sign in
              </CardTitle>
              <CardDescription>
                Enter your account credentials to access your console.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onLoginSubmit)}
                  className="grid gap-4"
                  noValidate
                >
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username or Email</FormLabel>
                        <FormControl>
                          <Input
                            autoComplete="username"
                            placeholder="username or user@domain.com"
                            disabled={pending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Password</FormLabel>
                          <button
                            type="button"
                            onClick={() => {
                              // If user already typed an email into username field, pre-populate resetEmail
                              const currentVal = form.getValues("username")
                              if (currentVal && currentVal.includes("@")) {
                                setResetEmail(currentVal)
                              }
                              goToView("forgot-email", 1)
                            }}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              placeholder="••••••••"
                              disabled={pending}
                              className="pr-10"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((prev) => !prev)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                              aria-label={
                                showPassword ? "Hide password" : "Show password"
                              }
                            >
                              {showPassword ? (
                                <EyeOff className="size-4" />
                              ) : (
                                <Eye className="size-4" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full mt-1"
                    disabled={pending}
                  >
                    {pending ? (
                      <Loader2
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <Lock data-icon="inline-start" />
                    )}
                    Sign in
                  </Button>
                  <div className="space-y-1.5 text-center text-xs text-muted-foreground pt-1">
                    <p>Use your mailwart console account credentials.</p>
                    <div>
                      <Link
                        href="/"
                        className="text-foreground/80 underline-offset-4 hover:underline"
                      >
                        Back to home
                      </Link>
                    </div>
                  </div>
                </form>
              </Form>
            </CardContent>
          </motion.div>
        )}

        {/* VIEW 2: FORGOT PASSWORD - EMAIL INPUT */}
        {view === "forgot-email" && (
          <motion.div
            key="forgot-email"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="w-full"
          >
            <CardHeader className="space-y-1 pb-4 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToView("login", -1)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -ml-1"
                  aria-label="Back to sign in"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <CardTitle className="text-xl font-semibold tracking-[-0.02em]">
                  Forgot Password
                </CardTitle>
              </div>
              <CardDescription>
                Enter the email address tied to your account. We will send you a
                6-digit verification code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendOtp} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="reset-email">Account Email</Label>
                  <div className="relative">
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="user@domain.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      disabled={emailPending}
                      required
                      autoFocus
                      className="pl-9"
                    />
                    <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full mt-1"
                  disabled={emailPending || !resetEmail.trim()}
                >
                  {emailPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Send Verification Code"
                  )}
                </Button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => goToView("login", -1)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Return to Sign in
                  </button>
                </div>
              </form>
            </CardContent>
          </motion.div>
        )}

        {/* VIEW 3: FORGOT PASSWORD - 6-DIGIT OTP */}
        {view === "forgot-otp" && (
          <motion.div
            key="forgot-otp"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="w-full"
          >
            <CardHeader className="space-y-1 pb-4 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToView("forgot-email", -1)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -ml-1"
                  aria-label="Back"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <CardTitle className="text-xl font-semibold tracking-[-0.02em]">
                  Verify Code
                </CardTitle>
              </div>
              <CardDescription>
                A 6-digit code was sent to{" "}
                <span className="font-mono font-medium text-foreground">
                  {maskedEmail || resetEmail}
                </span>
                . Enter it below to proceed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="py-1">
                <OtpInput
                  length={6}
                  value={otp}
                  onChange={setOtp}
                  onComplete={(val) => handleVerifyOtp(val)}
                  disabled={otpPending}
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                <span>Didn&apos;t receive it?</span>
                {countdown > 0 ? (
                  <span className="font-mono text-muted-foreground">
                    Resend in {countdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={emailPending || otpPending}
                    className="text-primary hover:underline font-medium"
                  >
                    Resend code
                  </button>
                )}
              </div>

              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={otpPending || otp.length !== 6}
                onClick={() => handleVerifyOtp()}
              >
                {otpPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Verify & Continue"
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => goToView("forgot-email", -1)}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Change email address
                </button>
              </div>
            </CardContent>
          </motion.div>
        )}

        {/* VIEW 4: FORGOT PASSWORD - NEW PASSWORD */}
        {view === "forgot-password" && (
          <motion.div
            key="forgot-password"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="w-full"
          >
            <CardHeader className="space-y-1 pb-4 pt-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                <CardTitle className="text-xl font-semibold tracking-[-0.02em]">
                  Create New Password
                </CardTitle>
              </div>
              <CardDescription>
                Choose a strong password for your mailwart console account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCompleteReset} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="reset-new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="reset-new-password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={passwordPending}
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

                <div className="grid gap-1.5">
                  <Label htmlFor="reset-confirm-password">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={passwordPending}
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
                    Password Requirements
                  </div>
                  <div className="flex items-center gap-1.5">
                    {strength.hasMinLength ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span
                      className={
                        strength.hasMinLength
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      At least 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {strength.hasUpper && strength.hasLower ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span
                      className={
                        strength.hasUpper && strength.hasLower
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      Uppercase and lowercase letters
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {strength.hasNumberOrSpecial ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span
                      className={
                        strength.hasNumberOrSpecial
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      At least one number or symbol
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {passwordsMatch ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span
                      className={
                        passwordsMatch
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      Passwords match
                    </span>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full mt-1"
                  disabled={
                    passwordPending || !strength.valid || !passwordsMatch
                  }
                >
                  {passwordPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4 mr-1.5" />
                  )}
                  Save New Password
                </Button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => goToView("login", -1)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    Cancel and return to Sign in
                  </button>
                </div>
              </form>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
