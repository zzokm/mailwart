import type { DataSource } from "@/lib/stalwart/types"

export function DataSourceBanner({ source }: { source: DataSource }) {
  if (source === "live") return null
  return (
    <div
      role="status"
      className="mb-5 rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-sm text-warn"
    >
      Showing sample directory. Set{" "}
      <code className="font-mono text-[12px]">STALWART_JMAP_URL</code>,{" "}
      <code className="font-mono text-[12px]">STALWART_ADMIN_USER</code>, and{" "}
      <code className="font-mono text-[12px]">STALWART_ADMIN_PASSWORD</code> in{" "}
      <code className="font-mono text-[12px]">.env.local</code> for live JMAP.
    </div>
  )
}
