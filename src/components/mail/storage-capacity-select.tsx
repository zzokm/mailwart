"use client"

import { useState } from "react"
import { Infinity as InfinityIcon } from "lucide-react"
import { formatBytes } from "@/lib/format"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type StorageUnit = "KB" | "MB" | "GB"

export const PRESETS: Array<{ key: string; label: string; bytes: number | null }> = [
  { key: "64mb", label: "64 MB", bytes: 64 * 1024 * 1024 },
  { key: "128mb", label: "128 MB", bytes: 128 * 1024 * 1024 },
  { key: "256mb", label: "256 MB", bytes: 256 * 1024 * 1024 },
  { key: "512mb", label: "512 MB", bytes: 512 * 1024 * 1024 },
  { key: "1gb", label: "1 GB", bytes: 1 * 1024 * 1024 * 1024 },
  { key: "2gb", label: "2 GB", bytes: 2 * 1024 * 1024 * 1024 },
  { key: "5gb", label: "5 GB", bytes: 5 * 1024 * 1024 * 1024 },
  { key: "10gb", label: "10 GB", bytes: 10 * 1024 * 1024 * 1024 },
  { key: "infinite", label: "Infinite", bytes: null },
  { key: "custom", label: "Custom capacity…", bytes: -1 },
]

export function StorageCapacitySelect({
  value,
  onChange,
  disabled,
  id,
  className,
}: {
  value: number | null | undefined
  onChange: (bytes: number | null) => void
  disabled?: boolean
  id?: string
  className?: string
}) {
  const [prevValue, setPrevValue] = useState<number | null | undefined>(value)
  const initialPreset =
    value == null || value <= 0
      ? "infinite"
      : PRESETS.find((p) => p.bytes === value)?.key ?? "custom"

  const [selectedKey, setSelectedKey] = useState<string>(initialPreset)
  const [customAmount, setCustomAmount] = useState<string>(() => {
    if (value != null && value > 0 && initialPreset === "custom") {
      if (value % (1024 * 1024 * 1024) === 0) return String(value / (1024 * 1024 * 1024))
      if (value % (1024 * 1024) === 0) return String(value / (1024 * 1024))
      if (value % 1024 === 0) return String(value / 1024)
      return String(value)
    }
    return "500"
  })
  const [customUnit, setCustomUnit] = useState<StorageUnit>(() => {
    if (value != null && value > 0 && initialPreset === "custom") {
      if (value % (1024 * 1024 * 1024) === 0) return "GB"
      if (value % (1024 * 1024) === 0) return "MB"
      return "KB"
    }
    return "MB"
  })

  // Adjust state during render when prop changes
  if (value !== prevValue) {
    setPrevValue(value)
    const matchingKey =
      value == null || value <= 0
        ? "infinite"
        : PRESETS.find((p) => p.bytes === value)?.key ?? "custom"
    setSelectedKey(matchingKey)
    if (matchingKey === "custom" && value != null && value > 0) {
      if (value % (1024 * 1024 * 1024) === 0) {
        setCustomAmount(String(value / (1024 * 1024 * 1024)))
        setCustomUnit("GB")
      } else if (value % (1024 * 1024) === 0) {
        setCustomAmount(String(value / (1024 * 1024)))
        setCustomUnit("MB")
      } else {
        setCustomAmount(String(Math.round(value / 1024)))
        setCustomUnit("KB")
      }
    }
  }

  function handlePresetChange(key: string | null) {
    if (!key) return
    setSelectedKey(key)
    if (key === "custom") {
      applyCustom(customAmount, customUnit)
    } else {
      const preset = PRESETS.find((p) => p.key === key)
      onChange(preset?.bytes ?? null)
    }
  }

  function applyCustom(amountStr: string, unit: StorageUnit) {
    const num = parseFloat(amountStr)
    if (Number.isNaN(num) || num <= 0) {
      onChange(null)
      return
    }
    const multiplier =
      unit === "GB"
        ? 1024 * 1024 * 1024
        : unit === "MB"
          ? 1024 * 1024
          : 1024
    const totalBytes = Math.round(num * multiplier)
    onChange(totalBytes)
  }

  function handleAmountChange(newAmount: string) {
    setCustomAmount(newAmount)
    applyCustom(newAmount, customUnit)
  }

  function handleUnitChange(newUnit: StorageUnit | null) {
    if (!newUnit) return
    setCustomUnit(newUnit)
    applyCustom(customAmount, newUnit)
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-col gap-2">
        <Select
          items={Object.fromEntries(PRESETS.map((p) => [p.key, p.label]))}
          value={selectedKey}
          onValueChange={handlePresetChange}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full">
            {selectedKey === "infinite" ? (
              <span data-slot="select-value" className="flex flex-1 items-center gap-2 text-left">
                <InfinityIcon className="size-6 shrink-0 text-foreground" strokeWidth={2.5} />
                <span>Infinite</span>
              </span>
            ) : (
              <SelectValue placeholder="Select storage limit…" />
            )}
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.key === "infinite" ? (
                  <span className="flex items-center gap-2">
                    <InfinityIcon className="size-6 shrink-0 text-foreground" strokeWidth={2.5} />
                    <span>Infinite</span>
                  </span>
                ) : (
                  p.label
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedKey === "custom" ? (
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              min="1"
              step="any"
              placeholder="e.g. 500"
              value={customAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              disabled={disabled}
              className="flex-1 font-mono text-[13px]"
            />
            <Select
              items={{
                MB: "MB",
                GB: "GB",
                KB: "KB",
              }}
              value={customUnit}
              onValueChange={(val) => handleUnitChange(val as StorageUnit)}
              disabled={disabled}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KB">KB</SelectItem>
                <SelectItem value="MB">MB</SelectItem>
                <SelectItem value="GB">GB</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {selectedKey === "infinite" ? (
          <span className="text-muted-foreground font-medium">
            ✓ Storage is infinite. Mailbox can grow without quota restrictions.
          </span>
        ) : (
          <span>
            Storage limit:{" "}
            <span className="font-mono font-medium text-foreground">
              {formatBytes(value)}
            </span>
            . Messages exceeding quota will bounce with 552 storage limit exceeded.
          </span>
        )}
      </p>
    </div>
  )
}
