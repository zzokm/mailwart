"use server"

import { revalidatePath } from "next/cache"
import { getLatestDeliverabilityReport } from "@/lib/deliverability/store"
import { runComprehensiveDeliverabilityTest } from "@/lib/deliverability/engine"
import type { DeliverabilitySuiteReport, RunDeliverabilityOptions } from "@/lib/deliverability/types"
import { okResult, failResult } from "./result"
import type { ActionResult } from "@/lib/stalwart/types"

export async function getLatestDeliverabilityReportAction(): Promise<
  ActionResult<DeliverabilitySuiteReport | null>
> {
  try {
    const report = await getLatestDeliverabilityReport()
    return okResult(report)
  } catch (err) {
    return failResult(err)
  }
}

export async function runDeliverabilityCheckupAction(
  options: RunDeliverabilityOptions = {}
): Promise<ActionResult<DeliverabilitySuiteReport>> {
  try {
    const report = await runComprehensiveDeliverabilityTest(options)
    revalidatePath("/dashboard/settings")
    revalidatePath("/dashboard/settings/deliverability")
    revalidatePath("/dashboard/logs")
    return okResult(report)
  } catch (err) {
    return failResult(err)
  }
}
