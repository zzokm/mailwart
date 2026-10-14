import "server-only"

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  getDbLatestDeliverabilityReport,
  saveDbDeliverabilityReport,
} from "@/lib/db"
import type { DeliverabilitySuiteReport } from "./types"

function getReportFilePath(): string {
  if (process.env.DELIVERABILITY_REPORT_PATH) {
    return process.env.DELIVERABILITY_REPORT_PATH
  }
  if (existsSync("/data")) {
    return "/data/deliverability-latest.json"
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "deliverability-latest.json")
}

export async function getLatestDeliverabilityReport(): Promise<DeliverabilitySuiteReport | null> {
  // 1. Try PostgreSQL first
  try {
    const dbReport = await getDbLatestDeliverabilityReport()
    if (dbReport) return dbReport
  } catch (err) {
    console.warn("[deliverability] Failed to read report from PostgreSQL:", err)
  }

  // 2. Fallback to file if exists, and backfill into DB
  try {
    const filePath = getReportFilePath()
    const content = await readFile(/*turbopackIgnore: true*/ filePath, "utf-8")
    const parsed = JSON.parse(content) as DeliverabilitySuiteReport
    if (parsed) {
      saveDbDeliverabilityReport(parsed).catch(() => {})
      return parsed
    }
  } catch {
    // File not found or unreadable
  }
  return null
}

export async function saveDeliverabilityReport(
  report: DeliverabilitySuiteReport,
  userId?: string
): Promise<void> {
  // 1. Save to PostgreSQL
  try {
    await saveDbDeliverabilityReport(report, userId)
  } catch (err) {
    console.error("[deliverability] DB save failed:", err)
  }

  // 2. Best-effort fallback file write (never fatal on EACCES)
  try {
    const filePath = getReportFilePath()
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(/*turbopackIgnore: true*/ filePath, JSON.stringify(report, null, 2), "utf-8")
  } catch (err) {
    console.warn("[deliverability] Disk report backup skipped:", err instanceof Error ? err.message : err)
  }
}
