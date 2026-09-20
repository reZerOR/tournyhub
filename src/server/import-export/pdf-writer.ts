/**
 * A minimal, dependency-free PDF writer for text-only documents.
 *
 * TournyHub generates Results PDFs server-side. The beta pins its dependencies,
 * so rather than add a PDF library this builds a valid single-font document
 * directly: one A4 page per slice of lines, with a correct cross-reference
 * table so any reader (and the tests) can parse it.
 *
 * The content is deliberately plain. Every line is sanitized to printable
 * ASCII, so a Player name with characters outside Latin-1 cannot corrupt the
 * file, and callers never pass a phone number here.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - MARGIN * 2) / LINE_HEIGHT);

/** Printable ASCII only: a non-Latin character would need a wider font encoding. */
function toAscii(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

function escapeText(value: string): string {
  return toAscii(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pageContent(lines: readonly string[]): string {
  const parts = [
    "BT",
    `/F1 ${FONT_SIZE} Tf`,
    `${LINE_HEIGHT} TL`,
    `${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`,
  ];
  lines.forEach((line, index) => {
    if (index > 0) parts.push("T*");
    parts.push(`(${escapeText(line)}) Tj`);
  });
  parts.push("ET");
  return parts.join("\n");
}

/**
 * Builds a PDF whose body is the supplied lines, paginated automatically. The
 * returned buffer is a complete document.
 */
export function createTextPdf(lines: readonly string[]): Buffer {
  const flattened = lines.flatMap((line) => String(line).split("\n"));
  const pageCount = Math.max(1, Math.ceil(flattened.length / LINES_PER_PAGE));
  const pages: string[][] = [];
  for (let index = 0; index < pageCount; index += 1) {
    pages.push(
      flattened.slice(index * LINES_PER_PAGE, (index + 1) * LINES_PER_PAGE),
    );
  }

  const fontObject = 3;
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const contentObjectIds = pages.map((_, index) => 5 + index * 2);
  const objectCount = 3 + pages.length * 2;

  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`,
  );
  objects.set(
    fontObject,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  pages.forEach((lines, index) => {
    const content = pageContent(lines);
    objects.set(
      pageObjectIds[index]!,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontObject} 0 R >> >> ` +
        `/Contents ${contentObjectIds[index]} 0 R >>`,
    );
    objects.set(
      contentObjectIds[index]!,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
  });

  let document = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = Buffer.byteLength(document, "latin1");
    document += `${id} 0 obj\n${objects.get(id) ?? "<< >>"}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(document, "latin1");
  const xref = [
    "xref",
    `0 ${objectCount + 1}`,
    "0000000000 65535 f ",
    ...Array.from(
      { length: objectCount },
      (_, index) => `${String(offsets[index + 1]!).padStart(10, "0")} 00000 n `,
    ),
  ];
  document += `${xref.join("\n")}\n`;
  document += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`;
  document += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(document, "latin1");
}
