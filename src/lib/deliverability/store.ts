import "server-only"

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import type { DeliverabilitySuiteReport } from "./types"

function getReportFilePath(): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "deliverability-latest.json")
}

export async function getLatestDeliverabilityReport(): Promise<DeliverabilitySuiteReport | null> {
  try {
    const filePath = getReportFilePath()
    const content = await readFile(filePath, "utf-8")
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
    await writeFile(filePath, JSON.stringify(report, null, 2), "utf-8")
  } catch (err) {
    console.error("Failed to save deliverability report:", err)
  }
}
