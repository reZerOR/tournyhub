import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FeedbackForm } from "@/features/feedback/feedback-form";
import { getCurrentSession } from "@/server/auth/session";

export default async function FeedbackPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle aria-level={1} role="heading">
            Beta feedback
          </CardTitle>
          <CardDescription>
            Tell the beta operator what happened. The report records this page,
            your account, and what you write here — never Auction data, phone
            numbers, codes, or invitation links.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeedbackForm page="/app/feedback" />
        </CardContent>
      </Card>
    </div>
  );
}
