import { redirect } from "next/navigation"

export default function DeliverabilityPage() {
  redirect("/dashboard/settings?tab=deliverability")
}
