import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { hasPngSignature, TeamLogoError } from "@/domain/team-logo";
import { reencodePng } from "@/server/images/png";

/**
 * A 5x5 RGBA PNG generated outside this codebase, with one row for each PNG
 * filter type (0-4). Its pixels are `[x*40, y*40, (x+y)*20, 255]`, so the
 * re-encoded, filter-0 output can be checked against a known pattern.
 */
const KNOWN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAO0lEQVR4nF3JMRWAMBAE0YFEwopYERFxciiRgtPlkSqk+M0MQIxSOBcjD5UD64usTix2jfItiVWfl78X1G0NKcru2FAAAAAASUVORK5CYII=",
  "base64",
);
const KNOWN_WIDTH = 5;
const KNOWN_HEIGHT = 5;

function expectedPixels(): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < KNOWN_HEIGHT; y += 1) {
    for (let x = 0; x < KNOWN_WIDTH; x += 1) {
      pixels.push(x * 40, y * 40, (x + y) * 20, 255);
    }
  }
  return pixels;
}

function decodeFilterZeroRows(bytes: Buffer): number[] {
  const values: number[] = [];
  let offset = 8;
  let compressed = Buffer.alloc(0);
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      compressed = Buffer.concat([
        compressed,
        bytes.subarray(offset + 8, offset + 8 + length),
      ]);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(compressed);
  const stride = KNOWN_WIDTH * 4 + 1;
  for (let row = 0; row < KNOWN_HEIGHT; row += 1) {
    if (raw[row * stride] !== 0) throw new Error("expected a filter-0 row");
    for (let index = 1; index < stride; index += 1) {
      values.push(raw[row * stride + index]!);
    }
  }
  return values;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function ihdr({
  bitDepth = 8,
  colorType = 6,
  height = 2,
  interlace = 0,
  width = 2,
}: Partial<{
  bitDepth: number;
  colorType: number;
  height: number;
  interlace: number;
  width: number;
}> = {}): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = bitDepth;
  data[9] = colorType;
  data[10] = 0;
  data[11] = 0;
  data[12] = interlace;
  return data;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunkTypes(bytes: Buffer): string[] {
  const types: string[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    types.push(bytes.toString("ascii", offset + 4, offset + 8));
    offset += 12 + length;
  }
  return types;
}

describe("hasPngSignature", () => {
  it("recognizes the PNG signature", () => {
    expect(hasPngSignature(KNOWN_PNG)).toBe(true);
    expect(hasPngSignature(Buffer.from("not a png"))).toBe(false);
    expect(hasPngSignature(Buffer.alloc(0))).toBe(false);
  });
});

describe("reencodePng", () => {
  it("decodes every filter type and re-encodes the same pixels", () => {
    const result = reencodePng(KNOWN_PNG);

    expect(result.width).toBe(KNOWN_WIDTH);
    expect(result.height).toBe(KNOWN_HEIGHT);
    expect(hasPngSignature(result.bytes)).toBe(true);
    expect(chunkTypes(result.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(decodeFilterZeroRows(result.bytes)).toEqual(expectedPixels());
  });

  it("strips ancillary chunks such as comments", () => {
    const withComment = Buffer.concat([
      SIGNATURE,
      chunk("IHDR", ihdr()),
      chunk("tEXt", Buffer.from("Comment\0hidden payload")),
      chunk("IDAT", deflateSync(Buffer.alloc(2 * (2 * 4 + 1)))),
      chunk("IEND", Buffer.alloc(0)),
    ]);

    const result = reencodePng(withComment);

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(chunkTypes(result.bytes)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(result.bytes.toString("latin1")).not.toContain("hidden payload");
  });

  it("is deterministic", () => {
    expect(
      reencodePng(KNOWN_PNG).bytes.equals(reencodePng(KNOWN_PNG).bytes),
    ).toBe(true);
  });

  it("rejects a file that is not a PNG", () => {
    expect(() => reencodePng(Buffer.from("GIF89a not png"))).toThrow(
      TeamLogoError,
    );
  });

  it("rejects a truncated PNG", () => {
    expect(() => reencodePng(KNOWN_PNG.subarray(0, 20))).toThrow(TeamLogoError);
  });

  it("rejects a palette image", () => {
    const palette = Buffer.concat([
      SIGNATURE,
      chunk("IHDR", ihdr({ colorType: 3 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);

    expect(() => reencodePng(palette)).toThrow(/palette/);
  });

  it("rejects an interlaced image", () => {
    const interlaced = Buffer.concat([
      SIGNATURE,
      chunk("IHDR", ihdr({ interlace: 1 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);

    expect(() => reencodePng(interlaced)).toThrow(/Interlaced/);
  });

  it("rejects an image that is too large", () => {
    const tooLarge = Buffer.concat([
      SIGNATURE,
      chunk("IHDR", ihdr({ height: 4096, width: 4096 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);

    expect(() => reencodePng(tooLarge)).toThrow(/pixels/);
  });

  it("rejects a file over the byte limit", () => {
    const oversized = Buffer.concat([SIGNATURE, Buffer.alloc(1_000_000, 1)]);

    expect(() => reencodePng(oversized)).toThrow(/under 1 MB/);
  });
});
