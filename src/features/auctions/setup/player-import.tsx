"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLAYER_ENTRY_LIMITS } from "@/domain/player-entry";
import {
  CUSTOM_IMPORT_PREFIX,
  formatImportErrorsCsv,
  normalizePlayerImport,
  PLAYER_IMPORT_LIMITS,
  PLAYER_IMPORT_MAX_MEGABYTES,
  STANDARD_IMPORT_TARGET_LABELS,
  STANDARD_IMPORT_TARGETS,
  type ImportTarget,
  type PlayerImportEntry,
  type PlayerImportPreview,
  type PlayerImportPreviewData,
} from "@/domain/player-import";
import {
  commitPlayerImportAction,
  previewPlayerImportAction,
} from "@/features/auctions/setup/player-import-actions";

const MAX_PREVIEW_ROWS = 50;

function statusLabel(status: PlayerImportPreview["results"][number]["status"]) {
  if (status === "error") return "Error";
  if (status === "warning") return "Warning";
  return "Accepted";
}

/** What this row would store, with phone numbers shown as presence only. */
function describeEntry(
  entry: PlayerImportEntry,
  customFields: { id: string; label: string }[],
): string {
  const parts: string[] = [];
  if (entry.role) parts.push(`Role: ${entry.role}`);
  if (entry.externalPlayerId) parts.push(`ID: ${entry.externalPlayerId}`);
  if (entry.startingPriceOverride !== null) {
    parts.push(`Price: ${entry.startingPriceOverride}`);
  }
  for (const field of customFields) {
    const value = entry.customValues[field.id];
    if (value) parts.push(`${field.label}: ${value}`);
  }
  parts.push(entry.phoneNumber ? "Phone provided" : "No phone");
  return parts.join(" · ");
}

export function PlayerImport({
  auctionId,
  onImported,
}: {
  auctionId: string;
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] =
    useState<null | PlayerImportPreviewData>(null);
  // One command ID per attempted commit. Reusing it across a retry, so a lost
  // response cannot import the same file twice, but a changed mapping or
  // worksheet is a new command.
  const [commandId, setCommandId] = useState<null | string>(null);
  const [worksheetName, setWorksheetName] = useState("");
  const [mapping, setMapping] = useState<ImportTarget[]>([]);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [resultMessage, setResultMessage] = useState<null | string>(null);

  const worksheet = useMemo(
    () =>
      previewData?.worksheets.find(
        (candidate) => candidate.name === worksheetName,
      ) ?? null,
    [previewData, worksheetName],
  );

  const preview = useMemo<null | PlayerImportPreview>(() => {
    if (!previewData || !worksheet) return null;
    return normalizePlayerImport({
      columns: worksheet.columns,
      customFieldIds: previewData.customFields.map((field) => field.id),
      existingDisplayNames: previewData.existingDisplayNames,
      existingExternalPlayerIds: previewData.existingExternalPlayerIds,
      mapping,
      rows: worksheet.rows,
    });
  }, [mapping, previewData, worksheet]);

  const targetOptions = useMemo(() => {
    if (!previewData) return [];
    return [
      ...STANDARD_IMPORT_TARGETS.map((target) => ({
        label: STANDARD_IMPORT_TARGET_LABELS[target],
        value: target as string,
      })),
      ...previewData.customFields.map((field) => ({
        label: field.label,
        value: `${CUSTOM_IMPORT_PREFIX}${field.id}`,
      })),
    ];
  }, [previewData]);

  const resultingPlayerCount =
    (previewData?.existingDisplayNames.length ?? 0) +
    (preview?.acceptedCount ?? 0);

  function applyWorksheet(name: string) {
    if (!previewData) return;
    const next = previewData.worksheets.find(
      (candidate) => candidate.name === name,
    );
    if (!next) return;
    setWorksheetName(name);
    setMapping(
      previewData.suggestedMappings[name] ??
        next.columns.map<ImportTarget>(() => "ignore"),
    );
    setCommandId(crypto.randomUUID());
    setResultMessage(null);
  }

  async function requestPreview(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setErrorMessage("Choose a CSV or XLSX file to preview.");
      return;
    }

    setPending(true);
    setErrorMessage(null);
    setResultMessage(null);

    const formData = new FormData();
    formData.set("file", file);
    const result = await previewPlayerImportAction(auctionId, formData);

    setPending(false);
    if (result.status !== "preview") {
      setPreviewData(null);
      setErrorMessage(result.message);
      return;
    }

    const first = result.data.worksheets[0]!;
    setPreviewData(result.data);
    setWorksheetName(first.name);
    setMapping(
      result.data.suggestedMappings[first.name] ??
        first.columns.map<ImportTarget>(() => "ignore"),
    );
    setCommandId(crypto.randomUUID());
  }

  async function commit(event: FormEvent) {
    event.preventDefault();
    if (!file || !worksheet) return;

    setPending(true);
    setErrorMessage(null);
    setResultMessage(null);

    const id = commandId ?? crypto.randomUUID();
    setCommandId(id);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("commandId", id);
    formData.set("worksheetName", worksheet.name);
    formData.set("mapping", JSON.stringify(mapping));

    const result = await commitPlayerImportAction(auctionId, formData);
    setPending(false);

    if (result.status !== "saved") {
      // The command ID is kept so a retry after a lost response is idempotent.
      setErrorMessage(result.message);
      return;
    }

    setFile(null);
    setPreviewData(null);
    setCommandId(null);
    setWorksheetName("");
    setMapping([]);
    setResultMessage(
      `Imported ${result.importedCount} Player ${result.importedCount === 1 ? "Entry" : "Entries"}${
        result.warningCount > 0
          ? ` with ${result.warningCount} duplicate-name ${result.warningCount === 1 ? "warning" : "warnings"}`
          : ""
      }.`,
    );
    await onImported();
  }

  function downloadErrors() {
    if (!preview) return;
    const url = URL.createObjectURL(
      new Blob([formatImportErrorsCsv(preview)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "player-import-errors.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const blocking = preview
    ? preview.mappingProblems.length > 0 || preview.errorCount > 0
    : true;

  return (
    <StationPlate
      label="Import Player Entries"
      stat={
        <>
          csv · xlsx · ≤{PLAYER_IMPORT_MAX_MEGABYTES} MB · ≤
          {PLAYER_IMPORT_LIMITS.maxRows.toLocaleString()} rows · ≤
          {PLAYER_IMPORT_LIMITS.maxWorksheets} sheets · ≤
          {PLAYER_IMPORT_LIMITS.maxColumns} columns
        </>
      }
      variant="section"
    >
      <StationGroup label="Source file">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={requestPreview}
        >
          <Field className="max-w-sm">
            <FieldLabel htmlFor="player-import-file">Import file</FieldLabel>
            <Input
              accept=".csv,.xlsx"
              id="player-import-file"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreviewData(null);
                setCommandId(null);
                setErrorMessage(null);
                setResultMessage(null);
              }}
              type="file"
            />
          </Field>
          <Button disabled={pending || !file} type="submit">
            <FileSpreadsheet aria-hidden className="size-4" />
            Preview import
          </Button>
        </form>

        <p
          aria-live="polite"
          className="font-mono text-xs text-muted-foreground"
          role="status"
        >
          {pending
            ? "Reading the file…"
            : errorMessage
              ? `Import failed: ${errorMessage}`
              : (resultMessage ?? "")}
        </p>
      </StationGroup>

      {previewData && worksheet && preview && (
        <>
          {previewData.worksheets.length > 1 && (
            <StationGroup label="Worksheet">
              <Field className="max-w-sm">
                <FieldLabel htmlFor="player-import-worksheet">
                  Worksheet
                </FieldLabel>
                <Select
                  onValueChange={(val) => val && applyWorksheet(val)}
                  value={worksheetName}
                >
                  <SelectTrigger className="w-full" id="player-import-worksheet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {previewData.worksheets.map((candidate) => (
                        <SelectItem
                          key={candidate.name}
                          value={candidate.name}
                        >
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </StationGroup>
          )}

          <StationGroup
            hint={`${worksheet.columns.length} columns`}
            label="Column mapping"
          >
            <ul className="flex flex-col divide-y divide-border/60">
              {worksheet.columns.map((column, index) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0"
                  key={`${column}-${index}`}
                >
                  <span className="min-w-40 font-mono text-xs">
                    {column || `Column ${index + 1}`}
                  </span>
                  <Select
                    items={[
                      { label: "Do not import", value: "ignore" },
                      ...targetOptions.map((option) => ({
                        label: option.label,
                        value: option.value,
                      })),
                    ]}
                    onValueChange={(val) => {
                      if (!val) return;
                      setMapping((previous) =>
                        previous.map((value, position) =>
                          position === index
                            ? (val as ImportTarget)
                            : value,
                        ),
                      );
                      setCommandId(crypto.randomUUID());
                    }}
                    value={mapping[index] ?? "ignore"}
                  >
                    <SelectTrigger
                      aria-label={`Map column ${column || index + 1}`}
                      className="w-56"
                    >
                      <SelectValue>
                        {(val: string | null) =>
                          val === "ignore"
                            ? "Do not import"
                            : (targetOptions.find((o) => o.value === val)?.label ??
                              val)
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="ignore">
                          Do not import
                        </SelectItem>
                        {targetOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>

            {preview.mappingProblems.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Fix the column mapping</AlertTitle>
                <AlertDescription>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    {preview.mappingProblems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </StationGroup>

          <StationGroup
            hint={`${preview.acceptedCount} accepted · ${preview.warningCount} warnings · ${preview.errorCount} errors`}
            label="Review"
          >
            <p className="text-sm" role="status">
              {preview.acceptedCount} Player{" "}
              {preview.acceptedCount === 1 ? "Entry" : "Entries"} accepted,{" "}
              {preview.warningCount} with warnings, {preview.errorCount} with
              errors. This Auction would then hold {resultingPlayerCount} of{" "}
              {PLAYER_ENTRY_LIMITS.maxEntriesPerAuction.toLocaleString()} Player
              Entries.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || blocking}
                onClick={commit}
                type="button"
              >
                Import {preview.acceptedCount} Players
              </Button>
              <Button
                disabled={preview.errorCount === 0}
                onClick={downloadErrors}
                type="button"
                variant="outline"
              >
                <Download aria-hidden className="size-4" />
                Download errors
              </Button>
            </div>

            {preview.results.length > 0 && (
              <Table>
                <TableCaption className="sr-only">
                  Normalized Player import preview
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-right">Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Values</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.results.slice(0, MAX_PREVIEW_ROWS).map((row) => (
                    <TableRow key={row.sourceRow}>
                      <TableCell className="text-right font-mono tabular-nums">
                        {row.sourceRow}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === "error" ? "destructive" : "outline"
                          }
                        >
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.entry?.displayName ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {row.entry
                          ? describeEntry(row.entry, previewData.customFields)
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {row.messages.length === 0
                          ? "—"
                          : row.messages.join(" ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {preview.results.length > MAX_PREVIEW_ROWS && (
              <p className="text-sm text-muted-foreground">
                Showing the first {MAX_PREVIEW_ROWS} of {preview.results.length}{" "}
                rows.
              </p>
            )}
          </StationGroup>
        </>
      )}
    </StationPlate>
  );
}
