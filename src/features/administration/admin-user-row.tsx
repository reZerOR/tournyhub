"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminUserRow } from "@/server/auction-query/administration";
import {
  restoreUserAction,
  revokeSessionsAction,
  suspendUserAction,
} from "@/features/administration/administration-actions";

/**
 * One User's moderation controls. Every action requires a reason, and the
 * controls touch access only: they cannot change an Auction's content or
 * outcome.
 */
export function AdminUserRowView({ user }: { user: AdminUserRow }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [notice, setNotice] = useState<null | string>(null);

  async function run(
    action: () => Promise<{ message?: string; status: string }>,
    done: string,
  ) {
    setPending(true);
    setMessage(null);
    setNotice(null);
    const result = await action();
    setPending(false);
    if (result.status === "error") {
      setMessage(result.message ?? "The action failed.");
      return;
    }
    setNotice(done);
  }

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {user.name || "Unnamed"} · {user.email}
        </span>
        <Badge variant={user.suspended ? "destructive" : "secondary"}>
          {user.suspended ? "Suspended" : "Active"}
        </Badge>
      </div>

      <Field className="max-w-md">
        <FieldLabel htmlFor={`reason-${user.id}`}>Reason</FieldLabel>
        <Input
          id={`reason-${user.id}`}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        {user.suspended ? (
          <Button
            disabled={pending || reason.trim() === ""}
            onClick={() =>
              run(
                () => restoreUserAction({ reason, userId: user.id }),
                "User restored.",
              )
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            Restore User
          </Button>
        ) : (
          <Button
            disabled={pending || reason.trim() === ""}
            onClick={() =>
              run(
                () => suspendUserAction({ reason, userId: user.id }),
                "User suspended and sessions revoked.",
              )
            }
            size="sm"
            type="button"
            variant="destructive"
          >
            Suspend User
          </Button>
        )}
        <Button
          disabled={pending || reason.trim() === ""}
          onClick={() =>
            run(
              () => revokeSessionsAction({ reason, userId: user.id }),
              "Sessions revoked.",
            )
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Revoke sessions
        </Button>
      </div>

      {message && <FieldError>{message}</FieldError>}
      {notice && (
        <p aria-live="polite" className="text-sm" role="status">
          {notice}
        </p>
      )}
    </li>
  );
}
