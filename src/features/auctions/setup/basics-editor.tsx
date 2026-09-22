"use client";

import { useEffect, useRef, useState } from "react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
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
import {
  SaveReadout,
  type SaveState,
} from "@/features/auctions/setup/save-readout";
import type { SerializedAuction } from "@/features/auctions/setup/serialize-auction";

const AUTOSAVE_DELAY_MS = 600;

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
    <StationPlate
      label="Basics"
      stat={
        <>
          <span className="text-muted-foreground/70">autosaves</span>
          <SaveReadout message={errorMessage} state={saveState} />
        </>
      }
    >
      <StationGroup label="Identity">
        <div className="grid gap-5 sm:grid-cols-2">
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
        </div>
      </StationGroup>

      <StationGroup label="Rules">
        <RulesModeField onChange={setRulesMode} value={rulesMode} />
      </StationGroup>

      <StationGroup label="Close">
        <CloseModeField onChange={setCloseMode} value={closeMode} />
      </StationGroup>
    </StationPlate>
  );
}
