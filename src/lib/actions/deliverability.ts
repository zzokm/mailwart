"use server"

import { revalidatePath } from "next/cache"
import { getLatestDeliverabilityReport } from "@/lib/deliverability/store"
import { runComprehensiveDeliverabilityTest } from "@/lib/deliverability/engine"
import type { DeliverabilitySuiteReport, RunDeliverabilityOptions } from "@/lib/deliverability/types"
import { okResult, failResult } from "./result"
import type { ActionResult } from "@/lib/stalwart/types"

import { getSession } from "@/lib/auth/session"
import { getUserOwnedDomainNames } from "@/lib/db"

export async function getLatestDeliverabilityReportAction(): Promise<
  ActionResult<DeliverabilitySuiteReport | null>
> {
  try {
    const report = await getLatestDeliverabilityReport()
    if (!report) return okResult(null)

    const session = await getSession().catch(() => null)
    if (!session || session.role === "admin") {
      return okResult(report)
    }

    const ownedNames = await getUserOwnedDomainNames(session.userId || "")
    const ownedSet = new Set(ownedNames.map((n) => n.toLowerCase()))

    const scopedDomainReports = report.domainReports.filter((dr: { domain: string; score: number }) =>
      ownedSet.has(dr.domain.toLowerCase())
    )

    if (scopedDomainReports.length === 0) {
      return okResult(null)
    }

    const sumScore = scopedDomainReports.reduce((acc: number, curr: { score: number }) => acc + curr.score, 0)
    const overallScore = Math.round(sumScore / scopedDomainReports.length)

    const scopedReport: DeliverabilitySuiteReport = {
      ...report,
      overallScore,
      totalDomains: scopedDomainReports.length,
      domainReports: scopedDomainReports,
    }

    return okResult(scopedReport)
  } catch (err) {
    return failResult(err)
  }
}

export async function runDeliverabilityCheckupAction(
  options: RunDeliverabilityOptions = {}
): Promise<ActionResult<DeliverabilitySuiteReport>> {
  try {
    const session = await getSession().catch(() => null)
    let finalOptions = { ...options }

    if (session && session.role !== "admin") {
      const ownedNames = await getUserOwnedDomainNames(session.userId || "")
      if (ownedNames.length === 0) {
        return failResult(new Error("You do not own any domains to test."))
      }
      finalOptions = {
        ...options,
        domains: ownedNames,
      }
    }

    const report = await runComprehensiveDeliverabilityTest(finalOptions)
    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/settings/deliverability")
    revalidatePath("/dashboard/logs")

    if (session && session.role !== "admin") {
      const ownedNames = await getUserOwnedDomainNames(session.userId || "")
      const ownedSet = new Set(ownedNames.map((n) => n.toLowerCase()))
      const scopedReports = report.domainReports.filter((dr: { domain: string; score: number }) =>
        ownedSet.has(dr.domain.toLowerCase())
      )
      const sumScore = scopedReports.reduce((acc: number, curr: { score: number }) => acc + curr.score, 0)
      const overallScore = scopedReports.length > 0 ? Math.round(sumScore / scopedReports.length) : 0
      return okResult({
        ...report,
        overallScore,
        totalDomains: scopedReports.length,
        domainReports: scopedReports,
      })
    }

    return okResult(report)
  } catch (err) {
    return failResult(err)
  }
}
