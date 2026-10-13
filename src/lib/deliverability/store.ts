import "server-only"

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

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
  try {
    const filePath = getReportFilePath()
    const content = await readFile(/*turbopackIgnore: true*/ filePath, "utf-8")
    return JSON.parse(content) as DeliverabilitySuiteReport
  } catch {
    return null
  }
}

export async function saveDeliverabilityReport(
  report: DeliverabilitySuiteReport
): Promise<void> {
  try {
    const filePath = getReportFilePath()
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(/*turbopackIgnore: true*/ filePath, JSON.stringify(report, null, 2), "utf-8")
  } catch (err) {
    console.error("Failed to save deliverability report:", err)
  }
}
