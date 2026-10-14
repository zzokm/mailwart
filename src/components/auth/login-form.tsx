"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Lock, Loader2, Eye, EyeOff } from "lucide-react"

import { loginAction } from "@/lib/actions/auth"
import { toastActionResult } from "@/lib/action-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { loginSchema, type LoginInput } from "@/lib/validations/auth"

type LoginValues = LoginInput

export function LoginForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  })

  async function onSubmit(values: LoginValues) {
    setPending(true)
    let result: Awaited<ReturnType<typeof loginAction>>
    try {
      result = await loginAction(values)
    } catch {
      // Fallback to direct HTTP endpoint if server action ID is mismatched across deploys
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })
        result = (await res.json()) as Awaited<ReturnType<typeof loginAction>>
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : "Sign in failed." }
      }
    }

    if (!toastActionResult(result, { success: "Signed in." })) {
      setPending(false)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-5"
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
              <FormLabel>Password</FormLabel>
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
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
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Lock data-icon="inline-start" />
          )}
          Sign in
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Use your mailwart console account credentials.{" "}
          <Link
            href="/"
            className="text-foreground/80 underline-offset-4 hover:underline"
          >
            Back to home
          </Link>
        </p>
      </form>
    </Form>
  )
}
