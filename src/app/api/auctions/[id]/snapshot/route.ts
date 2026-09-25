import { getLiveRevision } from "@/server/auction-query/live-revision";
import { getLiveSnapshot } from "@/server/auction-query/live-snapshot";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session)
    return Response.json({ status: "unauthorized" }, { status: 401, headers });

  const { id } = await context.params;
  const pool = getPool();
  const current = await getLiveRevision(pool, session.user.id, id);
  if (!current)
    return Response.json({ status: "not_found" }, { status: 404, headers });

  const since = new URL(request.url).searchParams.get("since");
  if (
    since !== null &&
    /^\d+$/.test(since) &&
    Number(since) === current.revision
  ) {
    return Response.json({ status: "unchanged", ...current }, { headers });
  }

  const access = await getLiveSnapshot(pool, session.user.id, id);
  if (!access)
    return Response.json({ status: "not_found" }, { status: 404, headers });
  return Response.json(
    { status: "snapshot", snapshot: access.snapshot },
    { headers },
  );
}
