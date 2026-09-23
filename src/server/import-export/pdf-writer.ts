/**
 * A4 roster sheets with explicit pagination and repeated Team/table headings.
 * The built-in Helvetica fonts retain the existing ASCII-only text contract.
 */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 42;
const MR = 42;
const MT = 48;
const MB = 48;
const CONTENT_W = PAGE_W - ML - MR;

// Helvetica advance widths, ASCII 32..126, in thousandths of an em.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
function toAscii(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}
function esc(value: string) {
  return toAscii(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
function width(value: string, size: number) {
  return (
    (Array.from(toAscii(value)).reduce(
      (sum, char) => sum + (WIDTHS[char.charCodeAt(0) - 32] ?? 556),
      0,
    ) *
      size) /
    1000
  );
}
function wrap(value: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of toAscii(value).split(/\s+/)) {
    const combined = line ? `${line} ${word}` : word;
    if (width(combined, size) <= maxWidth) {
      line = combined;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    for (const char of word) {
      if (line && width(line + char, size) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
function rgb(hex?: string | null): [number, number, number] {
  const valid = hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "64748b";
  return [0, 2, 4].map(
    (offset) => parseInt(valid.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number];
}
function fill(hex?: string | null) {
  return `${rgb(hex)
    .map((value) => value.toFixed(3))
    .join(" ")} rg`;
}
export type PdfBlock =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "rule" }
  | { kind: "blank" }
  | { kind: "pageBreak" }
  | {
      kind: "teamBanner";
      text: string;
      subtitle: string;
      color?: null | string;
    }
  | { kind: "columns"; hasTiers: boolean }
  | { kind: "heading"; text: string; color?: null | string }
  | { kind: "kv"; label: string; value: string }
  | { kind: "summary"; cols: string[]; row: string[] }
  | {
      kind: "player";
      index: number;
      name: string;
      source: string;
      amount: string;
      tier?: string;
    }
  | { kind: "unsold"; name: string; resolution: string }
  | { kind: "footer"; text: string };

function playerLines(block: Extract<PdfBlock, { kind: "player" }>) {
  return [
    wrap(block.name, 166, 10),
    wrap(block.source, block.tier !== undefined ? 112 : 210, 8),
    wrap(block.tier ?? "", 90, 8),
  ];
}
function blockHeight(block: PdfBlock): number {
  switch (block.kind) {
    case "pageBreak":
      return 0;
    case "title":
      return wrap(block.text, CONTENT_W - 20, 22).length * 28 + 10;
    case "subtitle":
      return wrap(block.text, CONTENT_W, 10).length * 14 + 8;
    case "teamBanner":
      return (
        wrap(block.text, CONTENT_W - 48, 20).length * 26 +
        wrap(block.subtitle, CONTENT_W - 48, 9).length * 12 +
        44
      );
    case "columns":
      return 28;
    case "heading":
      return wrap(block.text, CONTENT_W, 15).length * 20 + 12;
    case "summary":
      return 68;
    case "player":
      return (
        Math.max(...playerLines(block).map((lines) => lines.length)) * 14 + 20
      );
    case "unsold":
      return (
        Math.max(
          wrap(block.name, 280, 10).length,
          wrap(block.resolution, 180, 9).length,
        ) *
          14 +
        14
      );
    case "kv":
      return wrap(block.value, CONTENT_W - 80, 9).length * 13 + 10;
    case "blank":
      return 12;
    case "rule":
      return 10;
    case "footer":
      return wrap(block.text, CONTENT_W, 8).length * 12 + 14;
  }
}
function buildPageStream(
  blocks: readonly PdfBlock[],
  pageNum: number,
  totalPages: number,
): string {
  const ops: string[] = [];
  let y = PAGE_H - MT;
  const text = (
    x: number,
    top: number,
    value: string,
    size: number,
    bold = false,
    color = "0.08 0.12 0.20 rg",
  ) => {
    ops.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} ${x.toFixed(2)} ${(top - size).toFixed(2)} Td (${esc(value)}) Tj ET`,
    );
  };
  const centered = (
    value: string,
    top: number,
    size: number,
    bold: boolean,
    color?: string,
  ) => text((PAGE_W - width(value, size)) / 2, top, value, size, bold, color);
  const lines = (
    values: string[],
    x: number,
    top: number,
    size: number,
    bold = false,
  ) => values.forEach((value, i) => text(x, top - i * 14, value, size, bold));
  const rect = (top: number, height: number, color: string) =>
    ops.push(
      `${color} ${ML} ${(top - height).toFixed(2)} ${CONTENT_W} ${height.toFixed(2)} re f`,
    );
  const rule = (top: number) =>
    ops.push(
      `0.87 0.89 0.92 RG 0.5 w ${ML} ${top.toFixed(2)} m ${PAGE_W - MR} ${top.toFixed(2)} l S`,
    );

  for (const block of blocks) {
    const h = blockHeight(block);
    switch (block.kind) {
      case "pageBreak":
        break;
      case "title":
        wrap(block.text, CONTENT_W - 20, 22).forEach((value, i) =>
          text(ML, y - i * 28, value, 22, true),
        );
        break;
      case "subtitle":
        lines(wrap(block.text, CONTENT_W, 10), ML, y, 10);
        break;
      case "rule":
        rule(y - 4);
        break;
      case "blank":
        break;
      case "teamBanner": {
        const tint = rgb(block.color)
          .map((value) => (0.9 + value * 0.1).toFixed(3))
          .join(" ");
        rect(y, h - 12, `${tint} rg`);
        rect(y, 5, fill(block.color));
        let top = y - 20;
        for (const value of wrap(block.text, CONTENT_W - 48, 20)) {
          centered(value, top, 20, true);
          top -= 26;
        }
        for (const value of wrap(block.subtitle, CONTENT_W - 48, 9)) {
          centered(value, top - 5, 9, false, "0.28 0.34 0.42 rg");
          top -= 12;
        }
        break;
      }
      case "heading":
        lines(wrap(block.text, CONTENT_W, 15), ML, y, 15, true);
        break;
      case "summary": {
        const colWidth = CONTENT_W / block.cols.length;
        for (let i = 0; i < block.cols.length; i++) {
          text(
            ML + i * colWidth + 12,
            y - 10,
            block.cols[i]!,
            9,
            false,
            "0.28 0.34 0.42 rg",
          );
          text(ML + i * colWidth + 12, y - 29, block.row[i]!, 15, true);
        }
        rule(y - h + 5);
        break;
      }
      case "kv":
        text(ML + 10, y - 4, block.label, 9, true);
        lines(wrap(block.value, CONTENT_W - 80, 9), ML + 80, y - 4, 9);
        break;
      case "columns":
        rect(y, h, "0.08 0.12 0.20 rg");
        text(ML + 10, y - 8, "#", 8, true, "1 1 1 rg");
        text(ML + 32, y - 8, "PLAYER", 8, true, "1 1 1 rg");
        text(ML + 208, y - 8, "SOURCE", 8, true, "1 1 1 rg");
        if (block.hasTiers) text(ML + 330, y - 8, "TIER", 8, true, "1 1 1 rg");
        text(PAGE_W - MR - 51, y - 8, "CREDITS", 8, true, "1 1 1 rg");
        break;
      case "player": {
        if (block.index % 2 === 0) rect(y, h, "0.96 0.97 0.98 rg");
        const [names, sources, tiers] = playerLines(block);
        text(
          ML + 10,
          y - 10,
          String(block.index),
          8,
          false,
          "0.35 0.40 0.47 rg",
        );
        lines(names!, ML + 32, y - 9, 10);
        lines(sources!, ML + 208, y - 10, 8);
        if (block.tier !== undefined) lines(tiers!, ML + 330, y - 10, 8);
        text(
          PAGE_W - MR - 10 - width(block.amount, 9),
          y - 10,
          block.amount,
          9,
        );
        rule(y - h);
        break;
      }
      case "unsold":
        lines(wrap(block.name, 280, 10), ML + 10, y - 6, 10);
        lines(wrap(block.resolution, 180, 9), ML + 306, y - 6, 9);
        rule(y - h);
        break;
      case "footer":
        lines(wrap(block.text, CONTENT_W, 8), ML, y - 6, 8);
        break;
    }
    y -= h;
  }
  rule(MB - 8);
  text(ML, MB - 18, "TOURNYHUB / TEAM ROSTERS", 7, false, "0.35 0.40 0.47 rg");
  const pageLabel = `Page ${pageNum} of ${totalPages}`;
  text(PAGE_W - MR - width(pageLabel, 8), MB - 18, pageLabel, 8);
  return ops.join("\n");
}

function paginate(blocks: readonly PdfBlock[]): PdfBlock[][] {
  const usable = PAGE_H - MT - MB;
  const pages: PdfBlock[][] = [];
  let current: PdfBlock[] = [];
  let used = 0;
  let banner: Extract<PdfBlock, { kind: "teamBanner" }> | undefined;
  let columns: Extract<PdfBlock, { kind: "columns" }> | undefined;
  const flush = () => {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  };
  for (const block of blocks) {
    if (block.kind === "pageBreak") {
      flush();
      banner = undefined;
      columns = undefined;
      continue;
    }
    if (block.kind === "teamBanner") {
      banner = block;
      columns = undefined;
    }
    if (block.kind === "heading") {
      banner = undefined;
      columns = undefined;
    }
    if (block.kind === "columns") columns = block;
    const h = blockHeight(block);
    const keepWithNext =
      block.kind === "heading" || block.kind === "columns"
        ? 50
        : block.kind === "teamBanner"
          ? 150
          : 0;
    if (used + h + keepWithNext > usable && current.length) {
      flush();
      if (block.kind === "player" && banner) {
        const repeated = { ...banner, text: `${banner.text} (continued)` };
        current.push(repeated);
        used += blockHeight(repeated);
        if (columns) {
          current.push(columns);
          used += blockHeight(columns);
        }
      }
    }
    current.push(block);
    used += h;
  }
  flush();
  return pages.length ? pages : [[]];
}

export function createStyledPdf(blocks: readonly PdfBlock[]): Buffer {
  const pages = paginate(blocks);
  const totalPages = pages.length;

  // Object IDs:
  //  1 = Catalog
  //  2 = Pages
  //  3 = Font F1 (Helvetica)
  //  4 = Font F2 (Helvetica-Bold)
  //  5..4+N*2 = Page + Content object pairs

  const firstPageId = 5;
  const pageObjectIds = pages.map((_, i) => firstPageId + i * 2);
  const contentObjectIds = pages.map((_, i) => firstPageId + i * 2 + 1);
  const objectCount = 4 + pages.length * 2;

  const objects = new Map<number, string>();

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.set(
    3,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  objects.set(
    4,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  pages.forEach((pageBlocks, i) => {
    const stream = buildPageStream(pageBlocks, i + 1, totalPages);
    const streamBytes = Buffer.byteLength(stream, "latin1");

    objects.set(
      pageObjectIds[i]!,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
        `/Contents ${contentObjectIds[i]} 0 R >>`,
    );
    objects.set(
      contentObjectIds[i]!,
      `<< /Length ${streamBytes} >>\nstream\n${stream}\nendstream`,
    );
  });

  let doc = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id <= objectCount; id++) {
    offsets[id] = Buffer.byteLength(doc, "latin1");
    doc += `${id} 0 obj\n${objects.get(id) ?? "<< >>"}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(doc, "latin1");
  doc += `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objectCount; id++) {
    doc += `${String(offsets[id]!).padStart(10, "0")} 00000 n \n`;
  }
  doc += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`;
  doc += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(doc, "latin1");
}

/**
 * Legacy plain-text PDF — kept so existing call sites that haven't migrated
 * to createStyledPdf still compile. Prefer createStyledPdf for new code.
 * @deprecated Use createStyledPdf instead.
 */
export function createTextPdf(lines: readonly string[]): Buffer {
  const blocks: PdfBlock[] = lines.map((line) =>
    line === "" ? { kind: "blank" } : { kind: "kv", label: "", value: line },
  );
  return createStyledPdf(blocks);
}
