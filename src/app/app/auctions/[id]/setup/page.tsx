import { redirect } from "next/navigation";

export default async function AuctionSetupIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/auctions/${id}/setup/basics`);
}
