import { NextResponse } from "next/server";

import { checkHealth } from "@/server/observability/health";
import { getPool } from "@/server/database/pool";

/**
 * A non-sensitive health check. It reports only dependency names and statuses,
 * so it is safe to call without authentication and cannot leak a connection
 * string, a secret, or a row.
 */
export async function GET() {
  const report = await checkHealth(getPool());
  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
    status: report.status === "ok" ? 200 : 503,
  });
}
