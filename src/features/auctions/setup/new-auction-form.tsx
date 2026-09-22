"use client";

import { useActionState, useState } from "react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <form action={formAction}>
      <StationPlate
        footer={
          <>
            <p className="font-mono text-xs text-muted-foreground">
              creates a Draft · nothing goes Live yet
            </p>
            <Button disabled={pending} type="submit" variant="neon">
              {pending && <Spinner data-icon="inline-start" />}
              Create Draft Auction
            </Button>
          </>
        }
        label="Start a fresh Draft"
        stat={<Badge variant="outline">Draft</Badge>}
      >
        <FieldGroup>
          <StationGroup label="Identity">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(state.fieldErrors.title)}>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input
                  aria-invalid={Boolean(state.fieldErrors.title)}
                  id="title"
                  maxLength={200}
                  name="title"
                  placeholder="Sunday Showdown"
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
                  placeholder="Valorant"
                  required
                />
                {state.fieldErrors.game && (
                  <FieldError>{state.fieldErrors.game}</FieldError>
                )}
              </Field>
            </div>
          </StationGroup>

          <input name="rulesMode" type="hidden" value={rulesMode} />
          <input name="closeMode" type="hidden" value={closeMode} />

          <StationGroup label="Rules">
            <RulesModeField onChange={setRulesMode} value={rulesMode} />
          </StationGroup>

          <StationGroup label="Close">
            <CloseModeField onChange={setCloseMode} value={closeMode} />
          </StationGroup>

          {state.error && <FieldError>{state.error}</FieldError>}
        </FieldGroup>
      </StationPlate>
    </form>
  );
}
