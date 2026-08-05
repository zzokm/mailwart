import type { DataSource } from "@/lib/stalwart/types"

export function DataSourceBanner({ source }: { source: DataSource }) {
  if (source === "live") return null
  return (
    <div
      role="status"
      className="mb-5 rounded-lg border border-[oklch(0.65_0.1_85/0.35)] bg-[oklch(0.28_0.04_85/0.15)] px-3 py-2 text-sm text-[oklch(0.88_0.06_85)]"
    >
      Showing sample directory. Set{" "}
      <code className="font-mono text-[12px]">STALWART_JMAP_URL</code>,{" "}
      <code className="font-mono text-[12px]">STALWART_ADMIN_USER</code>, and{" "}
      <code className="font-mono text-[12px]">STALWART_ADMIN_PASSWORD</code> in{" "}
      <code className="font-mono text-[12px]">.env.local</code> for live JMAP.
    </div>
  )
}
