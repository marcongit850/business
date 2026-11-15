const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function concat(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32le(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function ascii(bytes, offset, length) {
  let text = "";
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(bytes[offset + i]);
  return text;
}

export function sniffImage(bytes) {
  if (!bytes || bytes.length < 12 || bytes.length > MAX_IMAGE_BYTES) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return "";
}

function stripJpeg(bytes) {
  const parts = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i += 1;
    if (marker === 0xd9) {
      parts.push(Uint8Array.of(0xff, 0xd9));
      return concat(parts);
    }
    if (marker === 0xda) {
      if (i + 2 > bytes.length) return null;
      const length = u16(bytes, i);
      if (length < 2 || i + length > bytes.length) return null;
      const header = [0xff, 0xda];
      parts.push(Uint8Array.from(header));
      parts.push(bytes.subarray(i, i + length));
      i += length;
      let j = i;
      while (j + 1 < bytes.length) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          parts.push(bytes.subarray(i, j + 2));
          return concat(parts);
        }
        j += bytes[j] === 0xff && bytes[j + 1] === 0x00 ? 2 : 1;
      }
      return null;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(Uint8Array.of(0xff, marker));
      continue;
    }
    if (i + 2 > bytes.length) return null;
    const length = u16(bytes, i);
    if (length < 2 || i + length > bytes.length) return null;
    const drop = marker === 0xfe || (marker >= 0xe1 && marker <= 0xef);
    if (!drop) {
      const segment = new Uint8Array(2 + length);
      segment[0] = 0xff;
      segment[1] = marker;
      segment.set(bytes.subarray(i, i + length), 2);
      parts.push(segment);
    }
    i += length;
  }
  return null;
}

function stripPng(bytes) {
  const signature = bytes.subarray(0, 8);
  const parts = [signature];
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= bytes.length) {
    const length = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 0 || i + 12 + length > bytes.length) return null;
    const type = ascii(bytes, i + 4, 4);
    const end = i + 12 + length;
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd || i !== bytes.length) return null;
  return concat(parts);
}

function stripWebp(bytes) {
  const declared = u32le(bytes, 4);
  if (declared + 8 !== bytes.length) return null;
  const chunks = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const fourcc = ascii(bytes, i, 4);
    const length = u32le(bytes, i + 4);
    const dataEnd = i + 8 + length;
    if (dataEnd > bytes.length) return null;
    const pad = length % 2;
    chunks.push({ fourcc, start: i, dataStart: i + 8, dataEnd, next: dataEnd + (dataEnd + pad <= bytes.length ? pad : 0) });
    i = chunks[chunks.length - 1].next;
  }
  if (i !== bytes.length) return null;
  const drop = new Set(["EXIF", "XMP "]);
  const kept = chunks.filter((chunk) => !drop.has(chunk.fourcc));
  if (kept.length === chunks.length) return bytes;
  const parts = [bytes.subarray(0, 12)];
  for (const chunk of kept) {
    if (chunk.fourcc === "VP8X") {
      const payloadLength = chunk.dataEnd - chunk.dataStart;
      if (payloadLength < 1) return null;
      const block = bytes.slice(chunk.start, chunk.next);
      const flags = block[8];
      block[8] = flags & ~0x0c;
      parts.push(block);
    } else {
      parts.push(bytes.subarray(chunk.start, chunk.next));
    }
  }
  const out = concat(parts);
  const size = out.length - 8;
  out[4] = size & 0xff;
  out[5] = (size >> 8) & 0xff;
  out[6] = (size >> 16) & 0xff;
  out[7] = (size >> 24) & 0xff;
  return out;
}

export function stripImageMetadata(bytes) {
  const type = sniffImage(bytes);
  if (!type) return null;
  const stripped = type === "image/jpeg" ? stripJpeg(bytes) : type === "image/png" ? stripPng(bytes) : stripWebp(bytes);
  if (!stripped || stripped.length > MAX_IMAGE_BYTES || sniffImage(stripped) !== type) return null;
  return { bytes: stripped, type };
}

export { MAX_IMAGE_BYTES };
