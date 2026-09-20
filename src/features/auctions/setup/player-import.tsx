"use client";

import { type FormEvent, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Import Player Entries
        </CardTitle>
        <CardDescription>
          Upload a CSV or XLSX file, map its columns, and review every row
          before anything is saved. Supported files are at most{" "}
          {PLAYER_IMPORT_MAX_MEGABYTES} MB,{" "}
          {PLAYER_IMPORT_LIMITS.maxRows.toLocaleString()} rows,{" "}
          {PLAYER_IMPORT_LIMITS.maxWorksheets} worksheets, and{" "}
          {PLAYER_IMPORT_LIMITS.maxColumns} columns.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
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
            Preview import
          </Button>
        </form>

        {previewData && worksheet && preview && (
          <section className="flex flex-col gap-4">
            {previewData.worksheets.length > 1 && (
              <Field className="max-w-sm">
                <FieldLabel htmlFor="player-import-worksheet">
                  Worksheet
                </FieldLabel>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  id="player-import-worksheet"
                  onChange={(event) => applyWorksheet(event.target.value)}
                  value={worksheetName}
                >
                  {previewData.worksheets.map((candidate) => (
                    <option key={candidate.name} value={candidate.name}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Column mapping</h3>
              <ul className="flex flex-col gap-2">
                {worksheet.columns.map((column, index) => (
                  <li
                    className="flex flex-wrap items-center gap-3"
                    key={`${column}-${index}`}
                  >
                    <span className="min-w-40 text-sm font-medium">
                      {column || `Column ${index + 1}`}
                    </span>
                    <select
                      aria-label={`Map column ${column || index + 1}`}
                      className="h-8 min-w-48 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      onChange={(event) => {
                        setMapping((previous) =>
                          previous.map((value, position) =>
                            position === index
                              ? (event.target.value as ImportTarget)
                              : value,
                          ),
                        );
                        setCommandId(crypto.randomUUID());
                      }}
                      value={mapping[index] ?? "ignore"}
                    >
                      <option value="ignore">Do not import</option>
                      {targetOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>

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
                Download errors
              </Button>
            </div>

            {preview.results.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Normalized Player import preview
                  </caption>
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium" scope="col">
                        Row
                      </th>
                      <th className="py-2 pr-3 font-medium" scope="col">
                        Status
                      </th>
                      <th className="py-2 pr-3 font-medium" scope="col">
                        Name
                      </th>
                      <th className="py-2 pr-3 font-medium" scope="col">
                        Values
                      </th>
                      <th className="py-2 font-medium" scope="col">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.results.slice(0, MAX_PREVIEW_ROWS).map((row) => (
                      <tr
                        className="border-b align-top last:border-0"
                        key={row.sourceRow}
                      >
                        <td className="py-2 pr-3 tabular-nums">
                          {row.sourceRow}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge
                            variant={
                              row.status === "error" ? "destructive" : "outline"
                            }
                          >
                            {statusLabel(row.status)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          {row.entry?.displayName ?? "—"}
                        </td>
                        <td className="py-2 pr-3">
                          {row.entry
                            ? describeEntry(row.entry, previewData.customFields)
                            : "—"}
                        </td>
                        <td className="py-2">
                          {row.messages.length === 0
                            ? "—"
                            : row.messages.join(" ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.results.length > MAX_PREVIEW_ROWS && (
                  <p className="pt-2 text-sm text-muted-foreground">
                    Showing the first {MAX_PREVIEW_ROWS} of{" "}
                    {preview.results.length} rows.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <p
          aria-live="polite"
          className="text-sm text-muted-foreground"
          role="status"
        >
          {pending
            ? "Working…"
            : errorMessage
              ? `Import failed: ${errorMessage}`
              : (resultMessage ?? "")}
        </p>
      </CardContent>
    </Card>
  );
}
