import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import test from "node:test";
import { sniffImage, stripImageMetadata } from "../src/images.js";
import { renderMarkdown } from "../src/text.js";
import { renderMemberDetail, renderProfile } from "../src/hub-pages.js";
import {
  firstPublishedAt,
  groupIdsForApproval,
  mailerLitePayload,
  validateContent,
  validateIngest,
  validateProfile,
} from "../src/validate.js";

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

function samplePng() {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 216, 64]);
  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", Buffer.from("Comment\0secret-note")),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("markdown keeps text and drops active content", () => {
  const html = renderMarkdown("# Hello\n\n<script>alert(1)</script>\n\n[ok](https://example.com)\n[bad](javascript:alert(1))\n");
  assert.match(html, /<h2>Hello<\/h2>/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /href="https:\/\/example.com\/"/);
  assert.equal(html.includes("javascript:"), false);
});

test("images accept jpeg png and webp and strip metadata", () => {
  const jpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x08, 0x45, 0x58, 0x49, 0x46, 0x00, 0x00,
    0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
    0xff, 0xda, 0x00, 0x02,
    0x00, 0xff, 0xd9,
  ]);
  const stripped = stripImageMetadata(jpeg);
  assert.equal(stripped.type, "image/jpeg");
  assert.equal(Buffer.from(stripped.bytes).includes(Buffer.from("EXIF")), false);
  assert.equal(Buffer.from(stripped.bytes).includes(Buffer.from("JFIF")), true);

  const png = stripImageMetadata(samplePng());
  assert.equal(png.type, "image/png");
  assert.equal(Buffer.from(png.bytes).includes(Buffer.from("secret-note")), false);
  assert.equal(Buffer.from(png.bytes).includes(Buffer.from("IDAT")), true);

  const exif = Buffer.from("EXIF-secret");
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08;
  const vp8 = Buffer.from([0, 1, 2, 3]);
  const chunk = (id, data) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 4, "ascii");
    head.writeUInt32LE(data.length, 4);
    const pad = data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
    return Buffer.concat([head, data, pad]);
  };
  const body = Buffer.concat([Buffer.from("WEBP"), chunk("VP8X", vp8x), chunk("EXIF", exif), chunk("VP8 ", vp8)]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, 4, "ascii");
  riff.writeUInt32LE(body.length, 4);
  const webp = Buffer.concat([riff, body]);
  const clean = stripImageMetadata(webp);
  assert.equal(clean.type, "image/webp");
  assert.equal(Buffer.from(clean.bytes).includes(Buffer.from("EXIF-secret")), false);
  assert.equal(clean.bytes[20] & 0x08, 0);

  assert.equal(sniffImage(Buffer.from("GIF89a-not-an-image")), "");
});

test("ingest accepts the builders contract and rejects bad input", () => {
  const good = validateIngest({
    network: "builders",
    name: "Ada Example",
    email: "Ada@Example.com",
    submitted_at: new Date().toISOString(),
    source_url: "https://waltonbuildersnetwork.org/join",
    fields: { phone: "555-0100" },
  });
  assert.equal(good.value.email, "ada@example.com");
  assert.equal(good.value.network, "builders");
  assert.equal(validateIngest({ ...good.value, network: "business", fields: {} }).error, "Invalid input");
  assert.equal(validateIngest({ ...good.value, fields: { phone: 5 } }).error, "Invalid input");
  assert.equal(validateIngest({ ...good.value, fields: { ["x".repeat(81)]: "y" } }).error, "Invalid input");
});

test("profile and content limits are enforced", () => {
  const fields = Array.from({ length: 21 }, (_, index) => ({ label: `Field ${index}`, value: "x" }));
  assert.match(validateProfile({ name: "Demo", website: "javascript:alert(1)" }, []).error, /Website/);
  assert.match(validateProfile({ name: "Demo" }, fields).error, /20/);
  assert.match(validateProfile({ name: "Demo" }, [{ label: "x".repeat(61), value: "y" }]).error, /label/);
  const post = validateContent({ network: "business", type: "post", title: "Hello hub", body: "<script>no</script>" });
  assert.equal(post.value.slug, "hello-hub");
  assert.equal(post.value.status, undefined);
  assert.match(validateContent({ network: "tourism", type: "resource", title: "Link" }).error, /link/);
});

test("mailerlite payload is only the subscriber and groups", () => {
  const payload = mailerLitePayload("ada@example.com", "Ada", ["10", "11"]);
  assert.deepEqual(Object.keys(payload).sort(), ["email", "fields", "groups", "status"]);
  assert.deepEqual(payload.fields, { name: "Ada" });
  assert.equal(JSON.stringify(payload).includes("note"), false);
  assert.deepEqual(groupIdsForApproval({ MAILERLITE_GROUP_MASTER: " 1 ", MAILERLITE_GROUP_BUSINESS_APPROVED: "2" }, "business"), ["1", "2"]);
});

test("published_at is set on the first publish and kept after unpublish", () => {
  assert.equal(firstPublishedAt(null, "2026-11-15T00:00:00.000Z", true), "2026-11-15T00:00:00.000Z");
  assert.equal(firstPublishedAt("2026-11-01T00:00:00.000Z", "2026-11-15T00:00:00.000Z", true), "2026-11-01T00:00:00.000Z");
  assert.equal(firstPublishedAt("2026-11-01T00:00:00.000Z", "2026-11-15T00:00:00.000Z", false), "2026-11-01T00:00:00.000Z");
});

test("member profile html does not render admin notes", () => {
  const html = renderProfile({
    session: { email: "demo.member@example.com", csrf: "csrf" },
    admin: false,
    profile: { name: "Demo Member", company: "Example Harbor Co", role_title: "Owner", phone: "850-555-0100", location: "Santa Rosa Beach", website: "https://example.com", bio: "A demo bio." },
    fields: [{ id: "1", label: "Boat slip", value: "Example marina, slip 12" }],
    message: "",
  });
  assert.equal(html.includes("Private notes"), false);
  assert.equal(html.includes("member_admin_notes"), false);
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /Boat slip/);
  const detail = renderMemberDetail({
    session: { email: "marc@whpinc.com", csrf: "csrf" },
    member: { id: "55555555-5555-4555-8555-555555555555", email: "demo.member@example.com", display_name: "Demo Member", networks: ["business"] },
    profile: { name: "Demo Member", company: "", role_title: "", phone: "", location: "", website: "", bio: "" },
    fields: [],
    applications: [],
    notes: "<script>secret note</script>",
    message: "",
  });
  assert.match(detail, /Private notes/);
  assert.match(detail, /&lt;script&gt;secret note&lt;\/script&gt;/);
  assert.equal(detail.includes("<script>secret note"), false);
});

test("member queries keep network and published scope", () => {
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  assert.match(hub, /WHERE network = \? AND slug = \? AND status = 'published'/);
  assert.match(hub, /WHERE network = \? AND status = 'published'/);
  const profileStart = hub.indexOf("async function profileView");
  const profileEnd = hub.indexOf("async function serveMedia");
  assert.equal(hub.slice(profileStart, profileEnd).includes("member_admin_notes"), false);
  assert.match(hub.slice(hub.indexOf("async function addToMailerLite"), hub.indexOf("function parseFields")), /mailerLitePayload\(email, name, groups\)/);
});

test("site copy in the hub does not use em or en dashes", () => {
  for (const file of ["../src/hub-pages.js", "../src/hub.js", "../docs/welcome-emails.md", "../docs/member-hub.md"]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(/[—–]/.test(text), false, file);
  }
});
