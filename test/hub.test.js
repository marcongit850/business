import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import test from "node:test";
import { sniffImage, stripImageMetadata } from "../src/images.js";
import {
  applicationNoteText,
  buildSignInEmail,
  externalUrl,
  loginPath,
  mergeAdminNotes,
  phoneDisplay,
  phoneHref,
  safeReturnPath,
  signInDestination,
  verifyLinkPath,
  renderMarkdown,
} from "../src/text.js";
import { renderApplicationDetail, renderMemberDetail, renderNetworkHub, renderProfile } from "../src/hub-pages.js";
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

test("photo credits and caret lines render as small print", () => {
  const credit = "Photo: [The Bushranger](https://commons.wikimedia.org/wiki/File:Shops_in_Seaside.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)";
  const html = renderMarkdown([
    "The shops are open.",
    credit,
    "",
    "photo: lower case still counts",
    "",
    "^ Filed in the public record.",
    "and the next line stays with it",
    "",
    "^ <small>no html</small> [bad](javascript:alert)",
    "",
    "A normal Photo: mention stays full size.",
    "",
    "# Photo: not a caption",
    "",
    "- Photo: list item",
  ].join("\n"));
  assert.match(html, /<p>The shops are open\.<\/p>/);
  assert.match(html, /<p class="fine-print">Photo: <a href="https:\/\/commons\.wikimedia\.org\/wiki\/File:Shops_in_Seaside\.jpg" rel="noopener noreferrer">The Bushranger<\/a>, <a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/" rel="noopener noreferrer">CC BY-SA 4\.0<\/a><\/p>/);
  assert.match(html, /<p class="fine-print">photo: lower case still counts<\/p>/);
  assert.match(html, /<p class="fine-print">Filed in the public record\. and the next line stays with it<\/p>/);
  assert.match(html, /<p class="fine-print">&lt;small&gt;no html&lt;\/small&gt; bad<\/p>/);
  assert.match(html, /<p>A normal Photo: mention stays full size\.<\/p>/);
  assert.match(html, /<h2>Photo: not a caption<\/h2>/);
  assert.match(html, /<li>Photo: list item<\/li>/);
  assert.equal(html.includes("<small>"), false);
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("javascript:"), false);
  assert.equal(html.includes("^"), false);
  const blocks = html.split("\n");
  assert.equal(blocks.some((line) => line.startsWith("<h2>") && line.includes("fine-print")), false);
  assert.equal(blocks.some((line) => line.startsWith("<ul>") && line.includes("fine-print")), false);
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
  const groups = {
    MAILERLITE_GROUP_MASTER: "204225136696493336",
    MAILERLITE_GROUP_BUSINESS: "204225137081320769",
    MAILERLITE_GROUP_BUILDERS: "204225138229511712",
    MAILERLITE_GROUP_TOURISM: "204225138526258910",
    MAILERLITE_GROUP_BUSINESS_APPROVED: "204225138578687754",
    MAILERLITE_GROUP_BUILDERS_APPROVED: "204225138819860402",
    MAILERLITE_GROUP_TOURISM_APPROVED: "204225140788037399",
  };
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const [key, value] of Object.entries(groups)) {
    assert.match(wrangler, new RegExp(`${key} = "${value}"`));
    assert.equal(wrangler.includes(`${key} = ""`), false);
  }
  assert.equal(wrangler.includes("MAILERLITE_API_KEY"), false);
  assert.deepEqual(groupIdsForApproval(groups, "builders"), [
    groups.MAILERLITE_GROUP_MASTER,
    groups.MAILERLITE_GROUP_BUILDERS,
    groups.MAILERLITE_GROUP_BUILDERS_APPROVED,
  ]);
  assert.deepEqual(groupIdsForApproval(groups, "tourism"), [
    groups.MAILERLITE_GROUP_MASTER,
    groups.MAILERLITE_GROUP_TOURISM,
    groups.MAILERLITE_GROUP_TOURISM_APPROVED,
  ]);
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
  const memberFacing = hub.slice(hub.indexOf("async function memberRoutes"), profileStart);
  assert.equal(hub.slice(profileStart, profileEnd).includes("member_admin_notes"), false);
  assert.equal(hub.slice(profileStart, profileEnd).includes("application_notes"), false);
  assert.equal(memberFacing.includes("application_notes"), false);
  assert.match(hub.slice(hub.indexOf("async function addToMailerLite"), hub.indexOf("function parseFields")), /mailerLitePayload\(email, name, groups\)/);
  assert.match(hub, /signInDestination\(isAdmin, next, requested, memberships\)/);
  assert.match(hub, /carryApplicationNotes\(db, application, memberId\)/);
});

test("application responses use labels, links, and escaped answers", () => {
  const html = renderApplicationDetail({
    session: { email: "marc@whpinc.com", csrf: "csrf-token" },
    application: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ada <Example>",
      email: "ada@example.com",
      network: "builders",
      status: "pending",
      submitted_at: "2026-11-15T15:24:00.000Z",
      source_url: "https://waltonbuildersnetwork.org/join",
      mailerlite_detail: "",
    },
    fields: {
      about: "Line one.\nLine two stays.",
      website: "",
      years_in_walton: "60 years",
      phone: "3058987233",
      email: "ada@example.com",
      name: "Ada <Example>",
      company: "Blue Harbor Builders",
      role: "Owner",
      industry: "General residential.",
      license_no: "CBC <045601>",
      weird_note: "Kept as typedd",
    },
    notes: [{
      author_email: "marc@whpinc.com",
      body: "Called <b>twice</b>",
      created_at: "2026-11-15T15:24:00.000Z",
    }],
    noteDraft: "Draft <note>",
  });
  assert.match(html, /<h1>Ada &lt;Example&gt;<\/h1>/);
  assert.equal(html.includes("<Example>"), false);
  assert.match(html, /pill-pending">Pending</);
  assert.match(html, />Builders</);
  assert.match(html, /Submitted Nov 15, 2026, 9:24 AM/);
  assert.match(html, /href="mailto:ada@example\.com"/);
  assert.match(html, /<dt>Years in Walton<\/dt>/);
  assert.equal(html.includes(">years_in_walton<"), false);
  assert.match(html, /href="tel:\+13058987233"/);
  assert.match(html, /\(305\) 898-7233/);
  assert.match(html, /General residential\./);
  assert.match(html, /class="response-empty">Not provided</);
  assert.match(html, /response-wide[\s\S]*<dt>About<\/dt><dd>Line one\.\nLine two stays\.<\/dd>/);
  assert.match(html, /<dt>License No<\/dt><dd>CBC &lt;045601&gt;<\/dd>/);
  assert.match(html, /Kept as typedd/);
  assert.match(html, /action="\/admin\/applications\/11111111-1111-4111-8111-111111111111\/approve"/);
  assert.match(html, /action="\/admin\/applications\/11111111-1111-4111-8111-111111111111\/deny"/);
  assert.match(html, /action="\/admin\/applications\/11111111-1111-4111-8111-111111111111\/notes"/);
  assert.match(html, /name="csrf" value="csrf-token"/);
  assert.match(html, /<button class="button" type="submit">Save<\/button>/);
  assert.match(html, /Called &lt;b&gt;twice&lt;\/b&gt;/);
  assert.equal(html.includes("<b>twice</b>"), false);
  assert.match(html, /Draft &lt;note&gt;/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /@media \(min-width: 800px\)[\s\S]*\.response-grid \{ grid-template-columns: 1fr 1fr; \}/);
  assert.match(html, /\.response-wide \{ grid-column: 1 \/ -1; \}/);
  const aboutAt = html.indexOf("<dt>About</dt>");
  const yearsAt = html.indexOf("<dt>Years in Walton</dt>");
  const extraAt = html.indexOf("<dt>License No</dt>");
  assert.ok(yearsAt < extraAt && extraAt < aboutAt);

  const linked = renderApplicationDetail({
    session: { email: "marc@whpinc.com", csrf: "csrf-token" },
    application: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ada Example",
      email: "not-an-email",
      network: "business",
      status: "approved",
      submitted_at: "2026-11-15T15:24:00.000Z",
      source_url: "javascript:alert(1)",
      reviewed_at: "2026-11-15T16:00:00.000Z",
      reviewed_by: "marc@whpinc.com",
    },
    fields: {
      phone: "555-0100",
      website: "blueharbor.example/work",
      odd_site: "javascript:alert(1)",
    },
  });
  assert.match(linked, /pill-approved">Approved</);
  assert.match(linked, /Reviewed Nov 15, 2026, 10:00 AM by marc@whpinc\.com/);
  assert.match(linked, />555-0100</);
  assert.equal(linked.includes('href="tel:+1555'), false);
  assert.match(linked, /href="tel:555-0100"/);
  assert.match(linked, /href="https:\/\/blueharbor\.example\/work"/);
  assert.match(linked, /rel="noopener noreferrer"/);
  assert.match(linked, />blueharbor\.example\/work</);
  assert.equal(linked.includes('href="javascript:'), false);
  assert.match(linked, /No notes yet/);
  const waiting = renderApplicationDetail({
    session: { email: "marc@whpinc.com", csrf: "csrf-token" },
    application: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ada Example",
      email: "ada@example.com",
      network: "business",
      status: "pending",
      submitted_at: "2026-11-15T15:24:00.000Z",
    },
    fields: { name: "Ada Example" },
    notesReady: false,
  });
  assert.match(waiting, /latest database migration/);
  assert.equal(waiting.includes('action="/admin/applications/11111111-1111-4111-8111-111111111111/notes"'), false);
  assert.match(waiting, /action="\/admin\/applications\/11111111-1111-4111-8111-111111111111\/approve"/);
});

test("member pages escape application notes and keep them off the hub", () => {
  const detail = renderMemberDetail({
    session: { email: "marc@whpinc.com", csrf: "csrf" },
    member: { id: "55555555-5555-4555-8555-555555555555", email: "ada@example.com", display_name: "Ada Example", networks: ["builders"] },
    profile: { name: "Ada Example", company: "", role_title: "", phone: "", location: "", website: "", bio: "" },
    fields: [],
    applications: [{
      id: "11111111-1111-4111-8111-111111111111",
      network: "builders",
      status: "approved",
      submitted_at: "2026-11-15T15:24:00.000Z",
      fields: { years_in_walton: "4 years", website: "", phone: "8505550199" },
    }],
    notes: "Scratchpad",
    applicationNotes: [{
      author_email: "marc@whpinc.com",
      body: "<i>from the application</i>",
      created_at: "2026-11-15T15:24:00.000Z",
      network: "builders",
    }],
  });
  assert.match(detail, /From applications/);
  assert.match(detail, /&lt;i&gt;from the application&lt;\/i&gt;/);
  assert.equal(detail.includes("<i>from the application</i>"), false);
  assert.match(detail, /<dt>Years in Walton<\/dt><dd>4 years<\/dd>/);
  assert.match(detail, /<dt>Phone<\/dt><dd>8505550199<\/dd>/);
  assert.match(detail, /<details class="app-answers"><summary>Answers<\/summary>/);
  assert.equal(/<details[^>]*\sopen/.test(detail), false);
  assert.equal(detail.includes(">Not provided<"), false);
  assert.equal(detail.includes('href="tel:+18505550199"'), false);
  assert.match(detail, /href="mailto:ada@example.com"/);
  assert.match(detail, /Not provided: Business or company, Role or title, Phone, Location, Website, Bio/);
  assert.equal(detail.includes("No custom fields yet."), false);
  assert.equal(detail.includes("<h2>Custom fields</h2>"), false);
  assert.match(detail, /pill-approved">Approved</);
  assert.match(detail, /class="container hub-main member-view"/);
  assert.match(detail, /Edit profile/);
  assert.match(detail, /Delete member/);
  assert.match(detail, /Open application/);
  const hub = renderNetworkHub({
    session: { email: "ada@example.com", csrf: "csrf" },
    admin: false,
    network: "builders",
    top: [],
    resources: [],
    stories: [],
  });
  const profile = renderProfile({
    session: { email: "ada@example.com", csrf: "csrf" },
    admin: false,
    profile: { name: "Ada", company: "", role_title: "", phone: "", location: "", website: "", bio: "" },
    fields: [],
  });
  assert.equal(hub.includes("From applications"), false);
  assert.equal(profile.includes("From applications"), false);
  assert.equal(profile.includes("from the application"), false);
  assert.match(profile, /action="\/hub\/profile"/);
  assert.equal(profile.includes("/admin/members/"), false);
});

test("admin member detail is a compact profile and collapsed answers", () => {
  const detail = renderMemberDetail({
    session: { email: "marc@whpinc.com", csrf: "csrf" },
    member: {
      id: "55555555-5555-4555-8555-555555555555",
      email: "352marc@gmail.com",
      display_name: "Marc Douglass",
      networks: ["builders", "business", "tourism"],
    },
    profile: {
      name: "Marc Douglass",
      company: "Misc",
      role_title: "Owner",
      phone: "3524940644",
      location: "",
      website: "https://example.com/marc",
      bio: "",
    },
    fields: [{ id: "field-1", label: "Slip", value: "A <12>" }],
    applications: [{
      id: "11111111-1111-4111-8111-111111111111",
      network: "business",
      status: "approved",
      submitted_at: "2026-11-15T21:58:00.000Z",
      fields: { name: "Marc Douglass", phone: "3524940644", about: "Line one.\nLine two." },
    }],
    notes: "",
  });
  assert.match(detail, /href="mailto:352marc@gmail.com"/);
  assert.match(detail, /href="tel:\+13524940644"/);
  assert.match(detail, /\(352\) 494-0644/);
  assert.match(detail, /href="https:\/\/example\.com\/marc" target="_blank" rel="noopener"/);
  assert.match(detail, /Not provided: Location, Bio/);
  assert.equal(detail.includes("<dt>Location</dt>"), false);
  assert.equal(detail.includes("<dt>Bio</dt>"), false);
  assert.equal(detail.includes("No custom fields yet."), false);
  assert.match(detail, /<h2>Custom fields<\/h2>/);
  assert.match(detail, /Slip/);
  assert.match(detail, /A &lt;12&gt;/);
  assert.match(detail, /<details class="app-answers"><summary>Answers<\/summary>[\s\S]*<dt>About<\/dt><dd>Line one\.\nLine two\.<\/dd>/);
  assert.match(detail, /details\.app-answers:not\(\[open\]\) > :not\(summary\) \{ display: none; \}/);
  assert.match(detail, /@media \(min-width: 800px\)[\s\S]*\.kv-row \{ grid-template-columns: minmax\(148px, 210px\)/);
  assert.match(detail, /\.kv-row \{ display: grid; grid-template-columns: 1fr;/);
  const own = renderMemberDetail({
    session: { email: "352marc@gmail.com", csrf: "csrf" },
    member: {
      id: "55555555-5555-4555-8555-555555555555",
      email: "352marc@gmail.com",
      display_name: "Marc Douglass",
      networks: ["business"],
    },
    profile: { name: "Marc Douglass", company: "Misc", role_title: "Owner", phone: "3524940644", location: "Seaside", website: "https://example.com", bio: "Here." },
    fields: [],
    applications: [],
    notes: "",
  });
  assert.match(own, /Edit profile/);
  assert.equal(own.includes("Delete member"), false);
  assert.equal(own.includes("Not provided:"), false);
  assert.equal(/[—–]/.test(detail + own), false);
});

test("phones, websites, return paths, and note copies stay safe", () => {
  assert.equal(phoneDisplay("3058987233"), "(305) 898-7233");
  assert.equal(phoneDisplay("850-555-0199"), "(850) 555-0199");
  assert.equal(phoneDisplay("555-0100"), "555-0100");
  assert.equal(phoneDisplay("+1 305 898 7233"), "+1 305 898 7233");
  assert.equal(phoneHref("3058987233"), "tel:+13058987233");
  assert.equal(phoneHref("555-0100"), "tel:555-0100");
  assert.equal(phoneHref("call me"), "");
  assert.equal(externalUrl("blueharbor.example/work"), "https://blueharbor.example/work");
  assert.equal(externalUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(externalUrl("javascript:alert(1)"), "");
  assert.equal(externalUrl("n/a"), "");
  assert.equal(externalUrl(""), "");
  assert.equal(safeReturnPath("/admin?status=pending"), "/admin?status=pending");
  assert.equal(safeReturnPath("/hub/profile"), "/hub/profile");
  assert.equal(safeReturnPath("/admin/"), "/admin");
  assert.equal(safeReturnPath("https://evil.com"), "");
  assert.equal(safeReturnPath("//evil.com"), "");
  assert.equal(safeReturnPath("/\\evil.com"), "");
  assert.equal(safeReturnPath("/admin/../../etc"), "");
  assert.equal(safeReturnPath("/login"), "");
  assert.equal(signInDestination(true, ""), "/admin");
  assert.equal(signInDestination(false, ""), "/hub");
  assert.equal(signInDestination(true, "/hub/business"), "/hub/business");
  assert.equal(signInDestination(false, "https://evil.com/admin"), "/hub");
  assert.equal(signInDestination(true, "/admin?network=builders"), "/admin?network=builders");
  assert.match(loginPath({ next: "/admin/applications/abc" }), /next=%2Fadmin%2Fapplications%2Fabc/);
  assert.match(verifyLinkPath("token", "/hub"), /\/login\/verify\?token=token&next=%2Fhub/);
  assert.equal(verifyLinkPath("token", "https://evil.com"), "/login/verify?token=token");
  const block = applicationNoteText({
    author_email: "marc@whpinc.com",
    body: "Called twice",
    created_at: "2026-11-15T15:24:00.000Z",
  }, "builders");
  assert.match(block, /Nov 15, 2026, 9:24 AM · marc@whpinc\.com · Builders application\nCalled twice/);
  const merged = mergeAdminNotes("Existing note", [block, block], 10000);
  assert.equal(merged.body, `Existing note\n\n${block}`);
  assert.deepEqual(merged.fitted, [0, 1]);
  const limited = mergeAdminNotes("x".repeat(20), ["y".repeat(20)], 30);
  assert.equal(limited.changed, false);
  assert.deepEqual(limited.fitted, []);
  const migration = readFileSync(new URL("../migrations/0002_application_notes.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE application_notes/);
  assert.match(migration, /copied_at/);
  assert.equal(/[—–]/.test(migration), false);
});

test("sign-in mail goes to the member from hello@waltonleaders.org", () => {
  const url = "https://waltonleaders.org/login/verify?token=abc&next=/hub";
  const message = buildSignInEmail("ada@example.com", url, undefined, "Walton County Builders Network");
  assert.equal(message.from, "hello@waltonleaders.org");
  assert.equal(message.to, "ada@example.com");
  assert.match(message.raw, /From: Walton County Builders Network <hello@waltonleaders\.org>/);
  assert.match(message.raw, /Subject: Sign in to Walton County Builders Network/);
  assert.match(message.raw, /Sign in to Walton County Builders Network/);
  assert.equal(message.raw.includes("Business Leaders"), false);
  assert.equal(message.raw.includes("Walton County Networks"), false);
  assert.match(message.raw, /To: ada@example\.com/);
  assert.match(message.raw, /Reply-To: hello@waltonleaders\.org/);
  assert.equal(message.raw.includes("Reply-To: ada@example.com"), false);
  assert.match(message.raw, /multipart\/alternative/);
  assert.match(message.raw, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(message.raw, /Content-Type: text\/html; charset=utf-8/);
  const [textPart, htmlPart] = message.raw.split("Content-Type: text/html");
  assert.match(textPart, /https:\/\/waltonleaders\.org\/login\/verify\?token=abc&next=\/hub/);
  assert.match(htmlPart, /href="https:\/\/waltonleaders\.org\/login\/verify\?token=abc&amp;next=\/hub"/);
  assert.equal(htmlPart.includes("<script>"), false);
  assert.equal(/[—–]/.test(message.raw), false);

  const hostile = buildSignInEmail("ada@example.com", "https://waltonleaders.org/x?q=1\"><script>alert(1)</script>");
  const hostileHtml = hostile.raw.slice(hostile.raw.indexOf("Content-Type: text/html"));
  assert.equal(hostileHtml.includes("<script>"), false);
  assert.match(hostileHtml, /&lt;script&gt;/);

  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.equal(hub.includes("marc@2911studio.com"), false);
  assert.equal(hub.includes("VERIFIED_DESTINATION"), false);
  assert.match(hub, /const FROM = "hello@waltonleaders\.org"/);
  assert.match(hub, /new EmailMessage\(message\.from, message\.to, message\.raw\)/);
  assert.match(index, /const FROM = "hello@waltonleaders\.org"/);
  assert.match(index, /const TO = "marc@whpinc\.com"/);
  assert.match(index, /Reply-To: " \+ replyTo/);
  assert.match(wrangler, /allowed_sender_addresses/);
  for (const address of ["hello@waltonleaders.org", "hello@waltonbuildersnetwork.org", "hello@waltontourism.org", "marc@2911studio.com"]) {
    assert.ok(wrangler.includes(address), address);
  }
  assert.equal(wrangler.includes("destination_address"), false);
  const docs = readFileSync(new URL("../docs/member-hub.md", import.meta.url), "utf8");
  assert.match(docs, /hello@waltonleaders\.org/);
  assert.match(docs, /still go to marc@whpinc\.com/);
  assert.equal(docs.includes("only to marc@whpinc.com"), false);
});

test("site copy in the hub does not use em or en dashes", () => {
  for (const file of ["../src/hub-pages.js", "../src/hub.js", "../src/hub-share.js", "../src/hub-home-script.js", "../src/pwa.js", "../src/application-email.js", "../docs/welcome-emails.md", "../docs/member-hub.md"]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(/[—–]/.test(text), false, file);
  }
});
