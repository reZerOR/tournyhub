import { getTeamLogoKeyForUser } from "@/server/auction-query/teams";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";
import { getObject } from "@/server/storage/object-store";

/**
 * Serves a Team logo to the Auction's Organizer or the representing User.
 * Knowledge of the Auction or Team id alone never grants the bytes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 404 });

  const { id, teamId } = await params;
  const pool = getPool();
  const key = await getTeamLogoKeyForUser(pool, session.user.id, id, teamId);
  if (!key) return new Response(null, { status: 404 });

  const object = await getObject(pool, key);
  if (!object) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(object.bytes), {
    headers: {
      "Cache-Control": "private, max-age=60",
      "Content-Length": String(object.bytes.byteLength),
      "Content-Type": object.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
