"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { CloseMode, RulesMode } from "@/domain/auction";
import {
  createDraftAuctionAction,
  type CreateDraftAuctionState,
} from "@/features/auctions/setup/actions";
import {
  CloseModeField,
  RulesModeField,
} from "@/features/auctions/setup/basics-fields";

const INITIAL_STATE: CreateDraftAuctionState = { error: null, fieldErrors: {} };

export function NewAuctionForm() {
  const [state, formAction, pending] = useActionState<
    CreateDraftAuctionState,
    FormData
  >(createDraftAuctionAction, INITIAL_STATE);
  const [rulesMode, setRulesMode] = useState<RulesMode>("simple");
  const [closeMode, setCloseMode] = useState<CloseMode>("manual");

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle aria-level={1} role="heading">
          New Auction
        </CardTitle>
        <CardDescription>
          Set the Basics. You can revisit every setup section before the Auction
          starts.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(state.fieldErrors.title)}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                aria-invalid={Boolean(state.fieldErrors.title)}
                id="title"
                maxLength={200}
                name="title"
                required
              />
              {state.fieldErrors.title && (
                <FieldError>{state.fieldErrors.title}</FieldError>
              )}
            </Field>
            <Field data-invalid={Boolean(state.fieldErrors.game)}>
              <FieldLabel htmlFor="game">Game</FieldLabel>
              <Input
                aria-invalid={Boolean(state.fieldErrors.game)}
                id="game"
                maxLength={100}
                name="game"
                required
              />
              {state.fieldErrors.game && (
                <FieldError>{state.fieldErrors.game}</FieldError>
              )}
            </Field>
            <input name="rulesMode" type="hidden" value={rulesMode} />
            <RulesModeField onChange={setRulesMode} value={rulesMode} />
            <input name="closeMode" type="hidden" value={closeMode} />
            <CloseModeField onChange={setCloseMode} value={closeMode} />
            {state.error && <FieldError>{state.error}</FieldError>}
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button disabled={pending} type="submit">
            {pending && <Spinner data-icon="inline-start" />}
            Create Draft Auction
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
