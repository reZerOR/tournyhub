import { BasicsEditor } from "@/features/auctions/setup/basics-editor";
import { requireDraftAuction } from "@/features/auctions/setup/data";
import { serializeAuction } from "@/features/auctions/setup/serialize-auction";

export default async function BasicsSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auction = await requireDraftAuction(id);

  return <BasicsEditor auction={serializeAuction(auction)} />;
}
