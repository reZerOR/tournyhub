# Import and Export

Owns Player Entry import validation and authorized Auction Results generation.
It must not edit authoritative records itself; the import commit belongs to the
Auction Command module.

Results exports use the caller-filtered read model. `results-spreadsheet.ts`
groups CSV rows by Team and builds styled XLSX workbooks with literal string
cells, centered Team headings, and numeric Credits. Its Team filter may narrow
an export but cannot grant access to another Team's contact roster. PDFs and
clipboard roster text never include phone numbers. The export route records
counts for CSV, XLSX, and PDF downloads without storing contact values.

`player-import-file.ts` reads an uploaded CSV or XLSX into plain string
worksheets. It decides the format from the file name and confirms it against
the bytes, so a renamed file cannot pick a different parser: a CSV must be
UTF-8 text, an XLSX must be a zip, and a workbook whose entry table names a VBA
project is refused. It also refuses legacy `.xls` files and enforces the byte,
worksheet, row, column, and cell-length limits before anything is normalized.
Formula and link cells are only ever their stored text.

`player-import.ts` builds the authorized preview: it parses the file, loads the
Auction's Custom Player Fields and existing entries, and suggests a column
mapping the Organizer can change.

The pure normalization and validation rules live in
`src/domain/player-import.ts` so the browser preview and the server commit
agree, and so they can be unit tested without a database. The all-or-nothing,
idempotent commit is `commitPlayerImport` in
`src/server/auction-command/player-import.ts`.
