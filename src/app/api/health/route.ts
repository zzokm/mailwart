import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  const memoryUsage = process.memoryUsage()
  
  return NextResponse.json(
    {
      status: "healthy",
      service: "email-manager",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
    },
    { status: 200 }
  )
}
