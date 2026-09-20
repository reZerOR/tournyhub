"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { acceptInvitationAction } from "@/features/invitations/actions";

export function AcceptInvitation({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);

  async function accept() {
    setPending(true);
    setErrorMessage(null);
    const result = await acceptInvitationAction(token);
    setPending(false);
    if (result.status === "error") setErrorMessage(result.message);
  }

  return (
    <div className="flex flex-col gap-3">
      <Button disabled={pending} onClick={accept} type="button">
        {pending && <Spinner data-icon="inline-start" />}
        Accept invitation
      </Button>
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
    </div>
  );
}
