import { deflateSync, inflateSync } from "node:zlib";

import {
  hasPngSignature,
  PNG_SIGNATURE_BYTES,
  TEAM_LOGO_LIMITS,
  TeamLogoError,
} from "@/domain/team-logo";

/**
 * A minimal PNG decoder and re-encoder. Logos are decoded to raw pixels and
 * written back out with only IHDR/IDAT/IEND, so every ancillary chunk —
 * including metadata and any trailing payload — is discarded before the
 * bytes are stored.
 */
const CHANNELS_BY_COLOR_TYPE: Record<number, number> = {
  0: 1,
  2: 3,
  4: 2,
  6: 4,
};

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
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

interface PngChunk {
  data: Buffer;
  type: string;
}

function readChunks(bytes: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new TeamLogoError("The PNG logo is truncated.");
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) {
      throw new TeamLogoError("The PNG logo is truncated.");
    }
    chunks.push({ data: bytes.subarray(start, end), type });
    offset = end + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

export interface ReencodedPng {
  bytes: Buffer;
  height: number;
  width: number;
}

/**
 * Validates a PNG logo, decodes it, and re-encodes it as a fresh 8-bit PNG.
 * Throws `TeamLogoError` for anything a PNG-only, non-interlaced decoder
 * cannot safely read, including palette images and oversized or interlaced
 * files.
 */
export function reencodePng(input: Uint8Array): ReencodedPng {
  if (!hasPngSignature(input)) {
    throw new TeamLogoError("Upload a PNG logo.");
  }
  if (input.length > TEAM_LOGO_LIMITS.maxBytes) {
    throw new TeamLogoError(
      "Keep the logo file under 1 MB. Resize it and try again.",
    );
  }

  const bytes = Buffer.from(input);
  const chunks = readChunks(bytes);
  const header = chunks.find((chunk) => chunk.type === "IHDR");
  if (!header || header.data.length !== 13) {
    throw new TeamLogoError("The PNG logo has no valid header.");
  }

  const width = header.data.readUInt32BE(0);
  const height = header.data.readUInt32BE(4);
  const bitDepth = header.data[8];
  const colorType = header.data[9];
  const compressionMethod = header.data[10];
  const filterMethod = header.data[11];
  const interlaceMethod = header.data[12];

  if (bitDepth !== 8) {
    throw new TeamLogoError("Logos must be 8-bit PNG images.");
  }
  if (interlaceMethod !== 0) {
    throw new TeamLogoError("Interlaced PNG logos are not supported.");
  }
  if (compressionMethod !== 0 || filterMethod !== 0) {
    throw new TeamLogoError("The PNG logo uses an unsupported encoding.");
  }
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels) {
    throw new TeamLogoError(
      "Logos must be PNG images without a color palette.",
    );
  }
  if (
    width === 0 ||
    height === 0 ||
    width > TEAM_LOGO_LIMITS.maxDimension ||
    height > TEAM_LOGO_LIMITS.maxDimension
  ) {
    throw new TeamLogoError(
      `Logos must be at most ${TEAM_LOGO_LIMITS.maxDimension} pixels on each side.`,
    );
  }

  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data),
  );
  if (compressed.length === 0) {
    throw new TeamLogoError("The PNG logo has no image data.");
  }

  const rowBytes = width * channels;
  const stride = rowBytes + 1;
  const expected = stride * height;

  let expanded: Buffer;
  try {
    expanded = inflateSync(compressed, { maxOutputLength: expected });
  } catch {
    throw new TeamLogoError("The PNG logo could not be read.");
  }
  if (expanded.length < expected) {
    throw new TeamLogoError("The PNG logo is truncated.");
  }

  const pixels = Buffer.alloc(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    const filterType = expanded[row * stride]!;
    const source = expanded.subarray(
      row * stride + 1,
      row * stride + 1 + rowBytes,
    );
    const target = pixels.subarray(row * rowBytes, (row + 1) * rowBytes);
    const previous =
      row > 0 ? pixels.subarray((row - 1) * rowBytes, row * rowBytes) : null;

    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= channels ? target[index - channels]! : 0;
      const up = previous ? previous[index]! : 0;
      const upLeft =
        previous && index >= channels ? previous[index - channels]! : 0;
      const value = source[index]!;

      let restored: number;
      switch (filterType) {
        case 0:
          restored = value;
          break;
        case 1:
          restored = value + left;
          break;
        case 2:
          restored = value + up;
          break;
        case 3:
          restored = value + ((left + up) >> 1);
          break;
        case 4:
          restored = value + paeth(left, up, upLeft);
          break;
        default:
          throw new TeamLogoError("The PNG logo uses an unknown filter.");
      }
      target[index] = restored & 0xff;
    }
  }

  const filtered = Buffer.alloc(expected);
  for (let row = 0; row < height; row += 1) {
    filtered[row * stride] = 0;
    pixels.copy(
      filtered,
      row * stride + 1,
      row * rowBytes,
      (row + 1) * rowBytes,
    );
  }

  const headerData = Buffer.alloc(13);
  headerData.writeUInt32BE(width, 0);
  headerData.writeUInt32BE(height, 4);
  headerData[8] = 8;
  headerData[9] = colorType;
  headerData[10] = 0;
  headerData[11] = 0;
  headerData[12] = 0;

  const output = Buffer.concat([
    Buffer.from(PNG_SIGNATURE_BYTES),
    encodeChunk("IHDR", headerData),
    encodeChunk("IDAT", deflateSync(filtered, { level: 9 })),
    encodeChunk("IEND", Buffer.alloc(0)),
  ]);

  return { bytes: output, height, width };
}
