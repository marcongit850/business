import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APPLICATION_SENDERS } from "../src/application-email.js";
import {
  FLAG_EMAIL_LIMIT,
  ISSUE_NOTICE_TO,
  MAX_ISSUE_FILE_BYTES,
  buildFlagNotice,
  createFlaggedIssue,
  listFlaggedIssues,
  listMemberIssues,
  readIssueFile,
  sniffIssueFile,
  updateIssueStatus,
} from "../src/issues.js";
import { renderFlagForm, renderFlaggedIssue, renderNetworkHub } from "../src/hub-pages.js";
import { openHubDb } from "./d1.js";

const NOW = "2026-11-15T18:00:00.000Z";
const ADA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function pdf(extra = "hello") {
  return new Uint8Array(Buffer.from(`%PDF-1.4 ${extra}`));
}

function docx() {
  return new Uint8Array(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("word/document.xml")]));
}

function memoryMedia() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, options) {
      objects.set(key, { bytes, type: options.httpMetadata.contentType });
    },
    async get(key) {
      const item = objects.get(key);
      return item ? { body: item.bytes } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

async function member(db, id, email, networks, status = "approved") {
  await db.prepare(
    "INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, email, email === "ada@example.com" ? "Ada Example" : "Bea Example", NOW, NOW).run();
  for (const network of networks) {
    await db.prepare(
      "INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, ?, 'member', ?, ?, ?)",
    ).bind(id, network, status, NOW, NOW).run();
  }
}

function issueInput(extra = {}) {
  return {
    title: "Parking fees on 30A",
    body: "The county posted a new fee schedule.",
    where_text: "County Road 30A",
    deadline: "2026-12-01",
    link_url: "https://example.com/agenda",
    effect: "It raises costs for shops.",
    contact_ok: true,
    ...extra,
  };
}

test("file sniff accepts pdf images and docx only", () => {
  assert.equal(sniffIssueFile(pdf()), "application/pdf");
  assert.equal(sniffIssueFile(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), "image/jpeg");
  assert.equal(sniffIssueFile(docx()), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(sniffIssueFile(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])), "");
  assert.equal(sniffIssueFile(new Uint8Array(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("xl/workbook.xml")]))), "");
  const huge = new Uint8Array(MAX_ISSUE_FILE_BYTES + 1);
  huge.set(pdf(), 0);
  assert.equal(sniffIssueFile(huge), "");
});

test("members create issues only on approved networks and cannot see each other's", async () => {
  const db = openHubDb();
  const media = memoryMedia();
  await member(db, ADA, "ada@example.com", ["business"]);
  await member(db, BEA, "bea@example.com", ["business", "tourism"]);

  const created = await createFlaggedIssue(db, media, {
    memberId: ADA,
    network: "business",
    issue: issueInput(),
    files: [{ filename: "../notes.pdf", bytes: pdf("ada") }],
    now: NOW,
  });
  assert.equal(created.ok, true);
  assert.equal(created.files[0].filename.includes("/"), false);
  assert.equal(media.objects.size, 1);

  const denied = await createFlaggedIssue(db, media, {
    memberId: ADA,
    network: "tourism",
    issue: issueInput({ title: "Should not save" }),
    files: [],
    now: NOW,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 404);

  const beaTourism = await createFlaggedIssue(db, media, {
    memberId: BEA,
    network: "tourism",
    issue: issueInput({ title: "Bed tax draft", contact_ok: false, link_url: "" }),
    files: [{ filename: "letter.docx", bytes: docx() }],
    now: "2026-11-15T19:00:00.000Z",
  });
  assert.equal(beaTourism.ok, true);

  const adaBusiness = await listMemberIssues(db, ADA, "business");
  const adaTourism = await listMemberIssues(db, ADA, "tourism");
  const beaBusiness = await listMemberIssues(db, BEA, "business");
  const beaTourismList = await listMemberIssues(db, BEA, "tourism");
  assert.deepEqual(adaBusiness.map((row) => row.title), ["Parking fees on 30A"]);
  assert.deepEqual(adaTourism, []);
  assert.deepEqual(beaBusiness, []);
  assert.deepEqual(beaTourismList.map((row) => row.title), ["Bed tax draft"]);

  const stored = await db.prepare("SELECT title, contact_ok, link_url, where_text FROM flagged_issues WHERE id = ?").bind(created.issue.id).first();
  assert.equal(stored.contact_ok, 1);
  assert.equal(stored.link_url, "https://example.com/agenda");
  assert.equal(stored.where_text, "County Road 30A");

  const files = await db.prepare("SELECT id, issue_id FROM flagged_issue_files WHERE issue_id = ?").bind(created.issue.id).all();
  const file = await readIssueFile(db, media, created.issue.id, files.results[0].id);
  assert.equal(Buffer.from(file.body).includes(Buffer.from("ada")), true);
  assert.equal(await readIssueFile(db, media, beaTourism.issue.id, files.results[0].id), null);

  const badFile = await createFlaggedIssue(db, media, {
    memberId: ADA,
    network: "business",
    issue: issueInput({ title: "Bad file" }),
    files: [{ filename: "run.exe", bytes: new Uint8Array([0x4d, 0x5a, 0x00, 0x00]) }],
    now: NOW,
  });
  assert.equal(badFile.ok, false);
  assert.match(badFile.error, /PDF, an image, or a Word document/);
  assert.equal((await listMemberIssues(db, ADA, "business")).length, 1);

  const tooMany = await createFlaggedIssue(db, media, {
    memberId: ADA,
    network: "business",
    issue: issueInput({ title: "Too many" }),
    files: [1, 2, 3, 4, 5, 6].map((n) => ({ filename: `${n}.pdf`, bytes: pdf(String(n)) })),
    now: NOW,
  });
  assert.match(tooMany.error, /5 files/);

  const noBucket = await createFlaggedIssue(db, null, {
    memberId: ADA,
    network: "business",
    issue: issueInput({ title: "No bucket" }),
    files: [{ filename: "a.pdf", bytes: pdf() }],
    now: NOW,
  });
  assert.equal(noBucket.status, 503);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM flagged_issues WHERE title = 'No bucket'").bind().first()).n, 0);

  db.close();
});

test("a denied membership cannot flag, and a failed upload does not keep the issue", async () => {
  const db = openHubDb();
  const deniedId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await member(db, deniedId, "cy@example.com", ["builders"], "denied");
  const denied = await createFlaggedIssue(db, memoryMedia(), {
    memberId: deniedId,
    network: "builders",
    issue: issueInput(),
    files: [],
    now: NOW,
  });
  assert.equal(denied.status, 404);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM flagged_issues").bind().first()).n, 0);

  await member(db, ADA, "ada@example.com", ["business"]);
  const media = {
    async put() {
      throw new Error("bucket down");
    },
    async delete() {},
  };
  await assert.rejects(createFlaggedIssue(db, media, {
    memberId: ADA,
    network: "business",
    issue: issueInput({ title: "Upload failed" }),
    files: [{ filename: "a.pdf", bytes: pdf() }],
    now: NOW,
  }));
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM flagged_issues").bind().first()).n, 0);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM flagged_issue_files").bind().first()).n, 0);
  db.close();
});

test("admin status update accepts the four statuses and leaves other issues alone", async () => {
  const db = openHubDb();
  await member(db, ADA, "ada@example.com", ["business"]);
  await member(db, BEA, "bea@example.com", ["tourism"]);
  const first = await createFlaggedIssue(db, memoryMedia(), {
    memberId: ADA, network: "business", issue: issueInput({ title: "First" }), files: [], now: NOW,
  });
  const second = await createFlaggedIssue(db, memoryMedia(), {
    memberId: BEA, network: "tourism", issue: issueInput({ title: "Second" }), files: [], now: NOW,
  });
  const updated = await updateIssueStatus(db, first.issue.id, "looking", "2026-11-15T20:00:00.000Z");
  assert.equal(updated.ok, true);
  assert.equal((await updateIssueStatus(db, first.issue.id, "approved", NOW)).ok, false);
  assert.equal((await db.prepare("SELECT status FROM flagged_issues WHERE id = ?").bind(first.issue.id).first()).status, "looking");
  assert.equal((await updateIssueStatus(db, first.issue.id, "action", NOW)).ok, true);
  assert.equal((await updateIssueStatus(db, first.issue.id, "closed", NOW)).ok, true);
  assert.equal((await db.prepare("SELECT status FROM flagged_issues WHERE id = ?").bind(second.issue.id).first()).status, "new");
  const adminRows = await listFlaggedIssues(db);
  assert.deepEqual(adminRows.map((row) => row.display_name).sort(), ["Ada Example", "Bea Example"]);
  assert.equal((await updateIssueStatus(db, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "new", NOW)).ok, false);
  db.close();
});

test("flag notice goes to Marc from the network hello address and replies to the member", () => {
  for (const network of ["business", "builders", "tourism"]) {
    const sender = APPLICATION_SENDERS[network];
    const message = buildFlagNotice({
      network,
      memberEmail: "ada@example.com",
      memberName: "Ada Example",
      issue: { id: "11111111-1111-4111-8111-111111111111", title: "Parking fees", body: "Details", where_text: "", deadline: "", link_url: "", effect: "", contact_ok: 1 },
      files: [{ filename: "agenda.pdf" }],
      origin: "https://waltonleaders.org",
    });
    assert.equal(message.from, sender.email);
    assert.equal(message.to, ISSUE_NOTICE_TO);
    assert.equal(message.replyTo, "ada@example.com");
    assert.match(message.raw, new RegExp(`From: ${sender.name} <${sender.email.replace(".", "\\.")}>`));
    assert.match(message.raw, /^To: marc@whpinc\.com$/m);
    assert.match(message.raw, /^Reply-To: ada@example\.com$/m);
    assert.equal(/^To: ada@example\.com$/m.test(message.raw), false);
    assert.match(message.raw, /https:\/\/waltonleaders\.org\/admin\/issues\/11111111-1111-4111-8111-111111111111/);
    assert.match(message.raw, /agenda\.pdf/);
    assert.equal(/[—–]/.test(message.raw), false);
  }
  assert.equal(buildFlagNotice({ network: "business", memberEmail: "not-an-email", issue: { id: "1", title: "X" } }), null);
  assert.equal(FLAG_EMAIL_LIMIT >= 1, true);
});

test("flag routes stay behind member network checks and admin status stays in admin", () => {
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  const memberRoutes = hub.slice(hub.indexOf("async function memberRoutes"), hub.indexOf("async function networkHome"));
  const gate = memberRoutes.indexOf("if (!memberships.includes(network))");
  const flag = memberRoutes.indexOf('slug === "flag"');
  assert.ok(gate !== -1 && flag > gate);
  const flagFn = hub.slice(hub.indexOf("async function flagRoute"), hub.indexOf("async function profileRoute"));
  assert.match(flagFn, /memberEmail: member\.email/);
  assert.equal(flagFn.includes('form.get("email")'), false);
  assert.equal(flagFn.includes('form.get("member")'), false);
  assert.match(flagFn, /new EmailMessage\(notice\.from, notice\.to, notice\.raw\)/);
  assert.match(flagFn, /flag-email:\$\{session\.email\}/);
  assert.match(flagFn, /flag-ip:/);
  assert.match(flagFn, /name="csrf"|form\.get\("csrf"\)|csrfOk/);
  assert.equal(memberRoutes.includes("/admin/issues"), false);
  const admin = hub.slice(hub.indexOf("async function adminRoutes"), hub.indexOf("async function listApplications"));
  assert.match(admin, /\/admin\/issues/);
  assert.match(admin, /issueAdminRoute/);
  assert.ok(admin.indexOf("if (!admin)") < admin.indexOf("/admin/issues"));
  const approve = hub.slice(hub.indexOf("async function approveApplication"), hub.indexOf("async function denyApplication"));
  const deny = hub.slice(hub.indexOf("async function denyApplication"), hub.indexOf("async function listMembers"));
  const profile = hub.slice(hub.indexOf("async function profileView"), hub.indexOf("async function serveMedia"));
  assert.match(approve, /fillProfileFromApplications\(db, memberId, existingProfile, \[application\], now\)/);
  assert.equal(deny.includes("fillProfileFromApplications"), false);
  assert.match(profile, /fillProfileFromApplications/);
  assert.equal(profile.includes("application_notes"), false);
  assert.match(profile, /status = 'approved'/);
});

test("flag form and admin detail escape answers and keep the network brand", () => {
  const form = renderFlagForm({
    session: { csrf: "csrf-token" },
    admin: false,
    network: "builders",
    draft: { title: "Fee <draft>", body: "Line", contact_ok: true },
    message: "",
  });
  assert.match(form, /data-network="builders"/);
  assert.match(form, /What's the issue\?/);
  assert.match(form, /What's happening\?/);
  assert.match(form, /Where is it\?/);
  assert.match(form, /Is there a meeting or deadline coming up\?/);
  assert.match(form, /Links or documents/);
  assert.match(form, /How does it affect you or your business\?/);
  assert.match(form, /OK to contact me about this/);
  assert.match(form, /name="csrf" value="csrf-token"/);
  assert.match(form, /action="\/hub\/builders\/flag"/);
  assert.match(form, /enctype="multipart\/form-data"/);
  assert.match(form, /Fee &lt;draft&gt;/);
  assert.match(form, /Something the county is doing that affects your business\? Tell us\./);
  assert.equal(form.includes("Walton County Tourism Network"), false);
  const detail = renderFlaggedIssue({
    session: { csrf: "csrf-token" },
    issue: {
      id: "11111111-1111-4111-8111-111111111111",
      network: "tourism",
      title: "Tax <item>",
      body: "Body",
      where_text: "",
      deadline: "",
      link_url: "javascript:alert(1)",
      effect: "",
      contact_ok: 0,
      status: "new",
      created_at: "2026-11-15T15:24:00.000Z",
      display_name: "Ada",
      email: "ada@example.com",
    },
    files: [{ id: "22222222-2222-4222-8222-222222222222", filename: "a.pdf" }],
  });
  assert.match(detail, /Tax &lt;item&gt;/);
  assert.equal(detail.includes("<item>"), false);
  assert.equal(detail.includes("javascript:"), false);
  assert.match(detail, /href="\/admin\/issues\/11111111-1111-4111-8111-111111111111\/files\/22222222-2222-4222-8222-222222222222"/);
  assert.match(detail, /value="looking"/);
  assert.match(detail, /Looking into it/);
  assert.match(detail, /Taking action/);
  assert.match(detail, /name="csrf" value="csrf-token"/);
  const hub = renderNetworkHub({
    session: { email: "ada@example.com", csrf: "csrf" },
    admin: false,
    network: "business",
    top: [],
    resources: [],
    stories: [],
    issues: [{ id: "1", title: "My fee issue", status: "action", created_at: "2026-11-15T15:24:00.000Z" }],
    flagged: true,
  });
  assert.match(hub, /Issues you've flagged/);
  assert.match(hub, /My fee issue/);
  assert.match(hub, /Taking action/);
  assert.match(hub, /Thanks, we&#39;ll look into it\./);
  assert.equal(/[—–]/.test(hub), false);
  assert.equal(/[—–]/.test(form), false);
  assert.equal(/[—–]/.test(detail), false);
});
