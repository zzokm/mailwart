"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true,
  className,
}: OtpInputProps) {
  const inputsRef = React.useRef<(HTMLInputElement | null)[]>([])

  // Ensure digits array matches length
  const digits = React.useMemo(() => {
    const valDigits = value.split("").slice(0, length)
    while (valDigits.length < length) {
      valDigits.push("")
    }
    return valDigits
  }, [value, length])

  React.useEffect(() => {
    if (autoFocus && inputsRef.current[0] && !disabled) {
      inputsRef.current[0].focus()
    }
  }, [autoFocus, disabled])

  function handleInputChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const inputVal = e.target.value
    // If user typed a single character or multiple
    const cleanChars = inputVal.replace(/\D/g, "")

    if (!cleanChars) {
      const next = [...digits]
      next[index] = ""
      const joined = next.join("")
      onChange(joined)
      return
    }

    if (cleanChars.length > 1) {
      // Multiple digits entered (or mobile autofill)
      handlePasteString(cleanChars, index)
      return
    }

    // Single digit
    const char = cleanChars.charAt(cleanChars.length - 1)
    const next = [...digits]
    next[index] = char
    const joined = next.join("")
    onChange(joined)

    if (joined.length === length && onComplete) {
      onComplete(joined)
    }

    // Auto advance to next box
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus()
      inputsRef.current[index + 1]?.select()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        // Current box is empty, jump to previous and delete it
        const next = [...digits]
        next[index - 1] = ""
        onChange(next.join(""))
        inputsRef.current[index - 1]?.focus()
      } else {
        const next = [...digits]
        next[index] = ""
        onChange(next.join(""))
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault()
      inputsRef.current[index - 1]?.focus()
      inputsRef.current[index - 1]?.select()
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault()
      inputsRef.current[index + 1]?.focus()
      inputsRef.current[index + 1]?.select()
    }
  }

  function handlePasteString(pasted: string, startIndex = 0) {
    const clean = pasted.replace(/\D/g, "")
    if (!clean) return

    const next = [...digits]
    let targetIndex = startIndex
    for (let i = 0; i < clean.length && targetIndex < length; i++) {
      next[targetIndex] = clean[i]
      targetIndex++
    }

    const joined = next.join("").slice(0, length)
    onChange(joined)

    if (joined.length === length && onComplete) {
      onComplete(joined)
    }

    const focusIdx = Math.min(targetIndex, length - 1)
    inputsRef.current[focusIdx]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData("text")
    handlePasteString(text, 0)
  }

  return (
    <div
      className={cn("flex items-center justify-between gap-1.5 sm:gap-2.5", className)}
      role="group"
      aria-label="6-digit verification code"
    >
      {digits.map((digit, index) => {
        const isFilled = Boolean(digit)
        return (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6} // Allow paste detection
            value={digit}
            disabled={disabled}
            onChange={(e) => handleInputChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            className={cn(
              "h-12 w-10 sm:h-14 sm:w-12 rounded-lg border text-center font-mono text-xl sm:text-2xl font-bold outline-none transition-all",
              "bg-background/60 shadow-xs",
              isFilled
                ? "border-primary/60 text-foreground bg-primary/5"
                : "border-border/80 text-foreground/80 hover:border-border",
              "focus:border-primary focus:ring-2 focus:ring-primary/25 focus:bg-background",
              disabled && "opacity-50 cursor-not-allowed bg-muted/40"
            )}
            aria-label={`Digit ${index + 1}`}
          />
        )
      })}
    </div>
  )
}
