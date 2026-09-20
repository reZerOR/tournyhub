import { notFound } from "next/navigation";

import { exportFileName } from "@/domain/results";
import { getResultsForCaller } from "@/server/auction-query/results";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";
import {
  buildResultsCsv,
  buildResultsPdf,
  recordResultsExport,
} from "@/server/import-export/results-export";

/**
 * One authorized Results export. The caller's role is derived on the server, so
 * a forged Team or role in the URL cannot widen what an export contains. The
 * export is recorded as an Audit Entry that names the exposed phone-number
 * count without ever storing a phone number.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ format: string; id: string }> },
) {
  const { format, id } = await params;
  if (format !== "csv" && format !== "pdf") notFound();

  const session = await getCurrentSession();
  if (!session) {
    return new Response("Sign in to export Results.", { status: 401 });
  }

  const pool = getPool();
  const view = await getResultsForCaller(pool, session.user.id, id);
  if (!view) {
    // An unrelated User learns nothing about the Auction or its Results.
    return new Response("Not found.", { status: 404 });
  }

  const baseHeaders = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${exportFileName({
      auctionTitle: view.title,
      extension: format,
    })}"`,
    "X-Content-Type-Options": "nosniff",
  } as const;

  if (format === "csv") {
    const exported = buildResultsCsv(view);
    await recordResultsExport(pool, {
      actorUserId: session.user.id,
      auctionId: id,
      format,
      phoneNumberCount: exported.phoneNumberCount,
      rowCount: exported.rowCount,
      viewerRole: view.viewerRole,
    });
    return new Response(exported.csv, {
      headers: { ...baseHeaders, "Content-Type": "text/csv; charset=utf-8" },
    });
  }

  const exported = buildResultsPdf(view);
  await recordResultsExport(pool, {
    actorUserId: session.user.id,
    auctionId: id,
    format,
    phoneNumberCount: 0,
    rowCount: exported.lineCount,
    viewerRole: view.viewerRole,
  });
  return new Response(new Uint8Array(exported.pdf), {
    headers: { ...baseHeaders, "Content-Type": "application/pdf" },
  });
}
