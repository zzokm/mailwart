"use client"

import { useState } from "react"
import { Eye, EyeOff, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CopyButton } from "@/components/mail/copy-button"
import { generatePassword } from "@/lib/format"

export function PasswordField({
  id = "password",
  value,
  onChange,
  label = "Password",
  disabled,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
}) {
  const [visible, setVisible] = useState(true)

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Input
            id={id}
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            autoComplete="new-password"
            className="pr-10 font-mono text-[13px]"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => setVisible((v) => !v)}
            disabled={disabled}
          >
            {visible ? <EyeOff /> : <Eye />}
            <span className="sr-only">Toggle visibility</span>
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange(generatePassword())
            setVisible(true)
          }}
        >
          <RefreshCw data-icon="inline-start" />
          Generate
        </Button>
        <CopyButton value={value} disabled={!value} label="Copy" />
      </div>
    </div>
  )
}
