"use client";

import { useEffect, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
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
import type {
  AuctionBasicsInput,
  CloseMode,
  RulesMode,
} from "@/domain/auction";
import { updateAuctionBasicsAction } from "@/features/auctions/setup/actions";
import {
  CloseModeField,
  RulesModeField,
} from "@/features/auctions/setup/basics-fields";
import type { SerializedAuction } from "@/features/auctions/setup/serialize-auction";

const AUTOSAVE_DELAY_MS = 600;

type SaveState = "error" | "idle" | "saved" | "saving";

export function BasicsEditor({ auction }: { auction: SerializedAuction }) {
  const [title, setTitle] = useState(auction.title);
  const [game, setGame] = useState(auction.game);
  const [rulesMode, setRulesMode] = useState<RulesMode>(auction.rulesMode);
  const [closeMode, setCloseMode] = useState<CloseMode>(auction.closeMode);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<null | string>(null);

  const isFirstRender = useRef(true);
  const saveRequestId = useRef(0);
  // Values changed since the last time a save was actually sent. Flushed on
  // unmount so navigating away mid-debounce cannot silently drop an edit.
  const unsentValues = useRef<AuctionBasicsInput | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const values: AuctionBasicsInput = { closeMode, game, rulesMode, title };
    unsentValues.current = values;
    const requestId = ++saveRequestId.current;
    setSaveState("saving");

    const timeout = setTimeout(async () => {
      unsentValues.current = null;
      const result = await updateAuctionBasicsAction(auction.id, values);
      if (requestId !== saveRequestId.current) return;

      if (result.status === "saved") {
        setTitle(result.auction.title);
        setGame(result.auction.game);
        setRulesMode(result.auction.rulesMode);
        setCloseMode(result.auction.closeMode);
        setSaveState("saved");
        setErrorMessage(null);
      } else {
        setSaveState("error");
        setErrorMessage(result.message);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [auction.id, closeMode, game, rulesMode, title]);

  useEffect(() => {
    return () => {
      if (unsentValues.current) {
        void updateAuctionBasicsAction(auction.id, unsentValues.current);
      }
    };
  }, [auction.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Basics
        </CardTitle>
        <CardDescription>
          The Auction&apos;s title, Game, Rules, and closing mode.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={!title.trim()}>
            <FieldLabel htmlFor="basics-title">Title</FieldLabel>
            <Input
              aria-invalid={!title.trim()}
              id="basics-title"
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
            {!title.trim() && <FieldError>Enter a title.</FieldError>}
          </Field>
          <Field data-invalid={!game.trim()}>
            <FieldLabel htmlFor="basics-game">Game</FieldLabel>
            <Input
              aria-invalid={!game.trim()}
              id="basics-game"
              maxLength={100}
              onChange={(event) => setGame(event.target.value)}
              value={game}
            />
            {!game.trim() && <FieldError>Enter a Game.</FieldError>}
          </Field>
          <RulesModeField onChange={setRulesMode} value={rulesMode} />
          <CloseModeField onChange={setCloseMode} value={closeMode} />
          <p
            aria-live="polite"
            className="text-sm text-muted-foreground"
            role="status"
          >
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" &&
              `Failed to save${errorMessage ? `: ${errorMessage}` : ""}`}
          </p>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
