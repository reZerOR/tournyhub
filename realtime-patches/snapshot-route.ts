// -> src/app/api/auctions/[id]/snapshot/route.ts   (adjust to your app directory)
import { NextResponse } from "next/server";

import { getLiveRevision } from "@/server/auction-query/live-revision";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/auctions/:id/snapshot?since=<revision>
 *
 * Unlike a Server Action, a route handler is not queued behind the browser's
 * bid/host actions. When the caller already has the current revision this is
 * one tiny query and a ~100-byte answer; the full snapshot is built only when
 * something actually changed.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { status: "unauthorized" },
      { headers: NO_STORE, status: 401 },
    );
  }

  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam === null ? null : Number(sinceParam);

  const pool = getPool();
  const current = await getLiveRevision(pool, session.user.id, id);
  if (!current) {
    return NextResponse.json(
      { status: "gone" },
      { headers: NO_STORE, status: 404 },
    );
  }

  if (since !== null && Number.isInteger(since) && since === current.revision) {
    return NextResponse.json(
      {
        revision: current.revision,
        serverTime: current.serverTime,
        status: "unchanged",
      },
      { headers: NO_STORE },
    );
  }

  const access = await getLiveSnapshot(pool, session.user.id, id);
  if (!access) {
    return NextResponse.json(
      { status: "gone" },
      { headers: NO_STORE, status: 404 },
    );
  }
  return NextResponse.json(
    { snapshot: access.snapshot, status: "snapshot" },
    { headers: NO_STORE },
  );
}
