import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { normalizeEmail } from "@/domain/invitation";
import { AcceptInvitation } from "@/features/invitations/accept-invitation";
import { getInvitationForToken } from "@/server/auction-query/team-invitations";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

function InvitationShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      {children}
    </main>
  );
}

function NoticeCard({ children, title }: { children: string; title: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle aria-level={1} role="heading">
          {title}
        </CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationForToken(getPool(), token);

  if (!invitation) {
    return (
      <InvitationShell>
        <NoticeCard title="Invitation not found">
          This invitation link is not valid. Ask the Organizer for a new one.
        </NoticeCard>
      </InvitationShell>
    );
  }

  if (invitation.status === "accepted") {
    return (
      <InvitationShell>
        <NoticeCard title="Invitation already accepted">
          This invitation has already been used.
        </NoticeCard>
      </InvitationShell>
    );
  }
  if (invitation.status !== "pending") {
    return (
      <InvitationShell>
        <NoticeCard title="Invitation no longer valid">
          A newer invitation replaced this one. Ask the Organizer to send a new
          link.
        </NoticeCard>
      </InvitationShell>
    );
  }
  if (invitation.expired) {
    return (
      <InvitationShell>
        <NoticeCard title="Invitation expired">
          This invitation has expired. Ask the Organizer to send a new one.
        </NoticeCard>
      </InvitationShell>
    );
  }

  const session = await getCurrentSession();
  const teamName = invitation.teamName ?? "an unnamed Team";
  const heading = `Represent ${teamName}`;
  const description = `You have been invited to represent ${teamName} in ${invitation.auctionTitle}.`;

  if (!session) {
    return (
      <InvitationShell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle aria-level={1} role="heading">
              {heading}
            </CardTitle>
            <CardDescription>
              {description} Sign in, or create an account with{" "}
              {invitation.invitedEmail}, then accept.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`}
              className={buttonVariants()}
            >
              Sign in to accept
            </Link>
          </CardContent>
        </Card>
      </InvitationShell>
    );
  }

  if (normalizeEmail(session.user.email) !== invitation.invitedEmail) {
    return (
      <InvitationShell>
        <NoticeCard title="Wrong account">
          {`This invitation was sent to ${invitation.invitedEmail}. Sign in with that email to accept it.`}
        </NoticeCard>
      </InvitationShell>
    );
  }

  return (
    <InvitationShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle aria-level={1} role="heading">
            {heading}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInvitation token={token} />
        </CardContent>
      </Card>
    </InvitationShell>
  );
}
