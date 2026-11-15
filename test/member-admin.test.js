import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";
import { createFlaggedIssue } from "../src/issues.js";
import { openHubDb } from "./d1.js";

if (typeof crypto.subtle.timingSafeEqual !== "function") {
  Object.defineProperty(crypto.subtle, "timingSafeEqual", {
    value: (left, right) => timingSafeEqual(Buffer.from(left), Buffer.from(right)),
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:email") {
      return {
        url: new URL("./cloudflare-email-mock.js", import.meta.url).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { handleHub } = await import("../src/hub.js");

const NOW = "2026-11-15T18:00:00.000Z";
const ADA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MARC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const APP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ADMIN_TOKEN = "admin-session-token-admin-session-token-123456";
const MEMBER_TOKEN = "member-session-token-member-session-token-1234";
const ADMIN_CSRF = "admin-csrf-token";
const MEMBER_CSRF = "member-csrf-token";

function ui() {
  return {
    html: (body) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } }),
    text: (status, body) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } }),
  };
}

function memoryMedia() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, options) {
      objects.set(key, { bytes, type: options?.httpMetadata?.contentType || "" });
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

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function count(db, sql, ...params) {
  const row = await db.prepare(sql).bind(...params).first();
  return row.n;
}

async function seed(db) {
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(ADA, "ada@example.com", "Ada Example", NOW, NOW).run();
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(MARC, "marc@whpinc.com", "Marc", NOW, NOW).run();
  for (const [id, network] of [[ADA, "business"], [ADA, "builders"], [MARC, "business"]]) {
    await db.prepare("INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, ?, 'member', 'approved', ?, ?)").bind(id, network, NOW, NOW).run();
  }
  await db.prepare(`INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at)
    VALUES (?, 'Ada Example', 'Harbor Co', 'Owner', '8505550199', '', '', '', ?)`).bind(ADA, NOW).run();
  await db.prepare(`INSERT INTO member_profile_fields (id, member_id, label, value, sort_order, created_at, updated_at)
    VALUES ('field-1', ?, 'Slip', '12', 0, ?, ?)`).bind(ADA, NOW, NOW).run();
  await db.prepare(`INSERT INTO member_admin_notes (member_id, body, updated_at) VALUES (?, 'private', ?)`).bind(ADA, NOW).run();
  await db.prepare(`INSERT INTO applications
    (id, network, name, email, submitted_at, source_url, fields_json, status, reviewed_at, reviewed_by, created_at)
    VALUES (?, 'business', 'Ada Example', 'ada@example.com', ?, 'https://waltonleaders.org/join', '{}', 'approved', ?, 'marc@whpinc.com', ?)`).bind(APP, NOW, NOW, NOW).run();
  await db.prepare(`INSERT INTO application_notes (id, application_id, author_email, body, created_at)
    VALUES ('note-1', ?, 'marc@whpinc.com', 'Approved for Business Leaders.', ?)`).bind(APP, NOW).run();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-admin', ?, 'marc@whpinc.com', ?, '2099-01-01T00:00:00.000Z', ?)`).bind(await sha256(ADMIN_TOKEN), ADMIN_CSRF, NOW).run();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-ada', ?, 'ada@example.com', ?, '2099-01-01T00:00:00.000Z', ?)`).bind(await sha256(MEMBER_TOKEN), MEMBER_CSRF, NOW).run();
  await db.prepare(`INSERT INTO magic_links (id, email, token_hash, expires_at, created_at, request_ip)
    VALUES ('link-ada', 'ada@example.com', 'hash-ada', '2099-01-01T00:00:00.000Z', ?, '')`).bind(NOW).run();
}

function envFor(db, media) {
  return {
    DB: db,
    ADMIN_EMAILS: "marc@whpinc.com",
    MAILERLITE_API_KEY: "test-key",
    MAILERLITE_GROUP_MASTER: "master-group",
    MAILERLITE_GROUP_BUSINESS: "business-group",
    MAILERLITE_GROUP_BUSINESS_APPROVED: "business-approved",
    MAILERLITE_GROUP_BUILDERS: "builders-group",
    MAILERLITE_GROUP_BUILDERS_APPROVED: "builders-approved",
    HUB_MEDIA: media,
  };
}

function call(env, path, { method = "GET", token = "", form } = {}) {
  const headers = {};
  if (token) headers.cookie = `wl_session=${token}`;
  let body;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = form.toString();
  }
  return handleHub(new Request(`https://waltonleaders.org${path}`, { method, headers, body }), env, ui());
}

test("admin can edit a member and delete only after confirmation", async () => {
  const db = openHubDb();
  const media = memoryMedia();
  await seed(db);
  const created = await createFlaggedIssue(db, media, {
    memberId: ADA,
    network: "business",
    issue: {
      title: "Parking fees",
      body: "A new fee schedule.",
      where_text: "30A",
      deadline: "",
      link_url: "",
      effect: "",
      contact_ok: false,
    },
    files: [{ filename: "notes.pdf", bytes: new Uint8Array(Buffer.from("%PDF-1.4 ada")) }],
    now: NOW,
  });
  assert.equal(created.ok, true);
  assert.equal(media.objects.size, 1);
  const env = envFor(db, media);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", auth: init?.headers?.Authorization || "" });
    if (String(url).includes("/subscribers/ada%40example.com")) {
      return new Response(JSON.stringify({ data: { id: "sub-ada" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(null, { status: 200 });
  };

  try {
    for (const path of [`/admin/members/${ADA}/edit`, `/admin/members/${ADA}/delete`]) {
      const forbidden = await call(env, path, { token: MEMBER_TOKEN });
      assert.equal(forbidden.status, 404);
      assert.match(await forbidden.text(), /That page is not available/);
    }
    const forbiddenPost = await call(env, `/admin/members/${ADA}/edit`, {
      method: "POST",
      token: MEMBER_TOKEN,
      form: new URLSearchParams({ csrf: MEMBER_CSRF, name: "Stolen", company: "Nope" }),
    });
    assert.equal(forbiddenPost.status, 404);
    assert.equal((await db.prepare("SELECT company FROM member_profiles WHERE member_id = ?").bind(ADA).first()).company, "Harbor Co");

    const editor = await call(env, `/admin/members/${ADA}/edit`, { token: ADMIN_TOKEN });
    assert.equal(editor.status, 200);
    const editorHtml = await editor.text();
    assert.match(editorHtml, /action="\/admin\/members\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\/edit"/);
    assert.match(editorHtml, /name="csrf" value="admin-csrf-token"/);
    assert.match(editorHtml, /value="Harbor Co"/);
    assert.match(editorHtml, /Email stays as it is/);

    const badSite = await call(env, `/admin/members/${ADA}/edit`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({
        csrf: ADMIN_CSRF,
        name: "Ada Example",
        website: "javascript:alert(1)",
      }),
    });
    assert.equal(badSite.status, 400);
    assert.match(await badSite.text(), /Website must be an http or https link/);
    assert.equal((await db.prepare("SELECT website FROM member_profiles WHERE member_id = ?").bind(ADA).first()).website, "");

    const saved = await call(env, `/admin/members/${ADA}/edit`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({
        csrf: ADMIN_CSRF,
        name: "Ada <Example>",
        company: "Blue Harbor",
        role_title: "Captain",
        phone: "3524940644",
        location: "Santa Rosa Beach",
        website: "https://example.com/ada",
        bio: "Line one.\nLine two.",
        field_id: "field-1",
        field_label: "Slip",
        field_value: "A <4>",
        field_remove: "",
      }),
    });
    assert.equal(saved.status, 303);
    assert.match(saved.headers.get("location"), /\/admin\/members\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\?saved=profile$/);
    const profile = await db.prepare("SELECT name, company, role_title, phone, location, website, bio FROM member_profiles WHERE member_id = ?").bind(ADA).first();
    assert.equal(profile.phone, "3524940644");
    assert.equal(profile.company, "Blue Harbor");
    assert.equal(profile.website, "https://example.com/ada");
    assert.equal(profile.bio, "Line one.\nLine two.");
    assert.equal(profile.name, "Ada <Example>");
    const field = await db.prepare("SELECT label, value FROM member_profile_fields WHERE member_id = ?").bind(ADA).first();
    assert.equal(field.label, "Slip");
    assert.equal(field.value, "A <4>");

    const expired = await call(env, `/admin/members/${ADA}/edit`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: "nope", name: "Ada" }),
    });
    assert.equal(expired.status, 403);

    const confirm = await call(env, `/admin/members/${ADA}/delete`, { token: ADMIN_TOKEN });
    assert.equal(confirm.status, 200);
    const confirmHtml = await confirm.text();
    assert.match(confirmHtml, /Type the email address to confirm/);
    assert.match(confirmHtml, /name="confirm_email"/);
    assert.match(confirmHtml, /button class="button danger"/);
    assert.match(confirmHtml, /marked denied so they no longer grant membership/);

    const wrong = await call(env, `/admin/members/${ADA}/delete`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF, confirm_email: "someone@example.com" }),
    });
    assert.equal(wrong.status, 400);
    assert.match(await wrong.text(), /Type the email address to confirm/);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM members WHERE id = ?", ADA), 1);

    const self = await call(env, `/admin/members/${MARC}/delete`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF, confirm_email: "marc@whpinc.com" }),
    });
    assert.equal(self.status, 403);
    assert.match(await self.text(), /You cannot remove your own admin account/);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM members WHERE id = ?", MARC), 1);
    const selfPage = await call(env, `/admin/members/${MARC}`, { token: ADMIN_TOKEN });
    assert.equal((await selfPage.text()).includes("Delete member"), false);

    const removed = await call(env, `/admin/members/${ADA}/delete`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF, confirm_email: "Ada@Example.com" }),
    });
    assert.equal(removed.status, 303);
    const location = removed.headers.get("location");
    assert.match(location, /\/admin\/members\?/);
    assert.match(location, /removed=ada%40example\.com/);
    assert.match(location, /mailer=removed/);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM members WHERE id = ?", ADA), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM member_profiles WHERE member_id = ?", ADA), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM member_profile_fields WHERE member_id = ?", ADA), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM member_admin_notes WHERE member_id = ?", ADA), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM memberships WHERE member_id = ?", ADA), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM sessions WHERE email = ?", "ada@example.com"), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM sessions WHERE email = ?", "marc@whpinc.com"), 1);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM magic_links WHERE email = ?", "ada@example.com"), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM flagged_issues WHERE member_id = ?", ADA), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM flagged_issue_files"), 0);
    assert.equal(media.objects.size, 0);
    const application = await db.prepare("SELECT status, email FROM applications WHERE id = ?").bind(APP).first();
    assert.equal(application.status, "denied");
    assert.equal(application.email, "ada@example.com");
    const note = await db.prepare("SELECT body FROM application_notes WHERE application_id = ? AND body LIKE 'Member account removed%'").bind(APP).first();
    assert.match(note.body, /no longer grants membership/);
    assert.equal(calls.some((item) => item.url.endsWith("/subscribers/ada%40example.com") && item.auth === "Bearer test-key"), true);
    assert.equal(calls.some((item) => item.method === "DELETE" && item.url.includes("/subscribers/sub-ada/groups/business-group")), true);
    assert.equal(calls.some((item) => item.method === "DELETE" && item.url.includes("/groups/builders-approved")), true);
    assert.equal(calls.filter((item) => item.method === "DELETE" && item.url.includes("/groups/master-group")).length, 1);

    await db.prepare(`INSERT INTO applications
      (id, network, name, email, submitted_at, source_url, fields_json, status, created_at)
      VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'business', 'Ada Example', 'ada@example.com', ?, 'https://waltonleaders.org/join', '{}', 'pending', ?)`).bind(NOW, NOW).run();
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM applications WHERE email = ? AND status = 'pending'", "ada@example.com"), 1);

    const list = await call(env, new URL(location).pathname + new URL(location).search, { token: ADMIN_TOKEN });
    assert.equal(list.status, 200);
    assert.match(await list.text(), /Removed ada@example.com\. Profile, memberships, sign-in sessions, and flagged issues were deleted/);

    globalThis.fetch = async () => {
      throw new Error("mailerlite down");
    };
    const again = openHubDb();
    const againMedia = memoryMedia();
    await seed(again);
    const failed = await call(envFor(again, againMedia), `/admin/members/${ADA}/delete`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF, confirm_email: "ada@example.com" }),
    });
    assert.equal(failed.status, 303);
    assert.match(failed.headers.get("location"), /mailer=failed/);
    assert.equal(await count(again, "SELECT COUNT(*) AS n FROM members WHERE id = ?", ADA), 0);
    assert.equal((await again.prepare("SELECT status FROM applications WHERE id = ?").bind(APP).first()).status, "denied");
    again.close();
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("a valid session skips the login form for that member's network", async () => {
  const db = openHubDb();
  const env = envFor(db, memoryMedia());
  await seed(db);
  const guest = "guest-session-token-guest-session-token-123456";
  const solo = "solo-session-token-solo-session-token-1234567";
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-guest', ?, 'guest@example.com', 'guest-csrf', '2099-01-01T00:00:00.000Z', ?)`).bind(await sha256(guest), NOW).run();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-solo', ?, 'solo@example.com', 'solo-csrf', '2099-01-01T00:00:00.000Z', ?)`).bind(await sha256(solo), NOW).run();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-old', ?, 'ada@example.com', 'old-csrf', '2020-01-01T00:00:00.000Z', ?)`).bind(await sha256("expired-session-token-expired-session-token-12"), NOW).run();
  const worker = (await import("../src/index.js")).default;
  const visit = (path, token, siteEnv = env) => {
    const headers = token ? { cookie: `wl_session=${token}` } : {};
    return worker.fetch(new Request(`https://waltonleaders.org${path}`, { headers }), siteEnv, {});
  };
  const landed = async (response) => new URL(response.headers.get("location")).pathname;

  try {
    const anon = await visit("/login/builders");
    assert.equal(anon.status, 200);
    assert.match(await anon.text(), /Email me a sign-in link/);

    const builders = await visit("/login/builders", MEMBER_TOKEN);
    assert.equal(builders.status, 303);
    assert.equal(await landed(builders), "/hub/builders");

    const adaTourism = await visit("/login/tourism", MEMBER_TOKEN);
    assert.equal(adaTourism.status, 200);
    assert.match(await adaTourism.text(), /action="\/login\/tourism"/);

    const adminHub = await visit("/login/business", ADMIN_TOKEN);
    assert.equal(adminHub.status, 303);
    assert.equal(await landed(adminHub), "/hub/business");

    const adminOther = await visit("/login/tourism", ADMIN_TOKEN);
    assert.equal(adminOther.status, 303);
    assert.equal(await landed(adminOther), "/admin");

    const chooser = await visit("/login", MEMBER_TOKEN);
    assert.equal(chooser.status, 303);
    assert.equal(await landed(chooser), "/hub");

    const queryNetwork = await visit("/login?network=builders", MEMBER_TOKEN);
    assert.equal(queryNetwork.status, 303);
    assert.equal(await landed(queryNetwork), "/hub/builders");

    const guestForm = await visit("/login/business", guest);
    assert.equal(guestForm.status, 200);
    assert.match(await guestForm.text(), /Email me a sign-in link/);

    const soloEnv = { ...env, ADMIN_EMAILS: "marc@whpinc.com,solo@example.com" };
    const soloNetwork = await visit("/login/tourism", solo, soloEnv);
    assert.equal(soloNetwork.status, 303);
    assert.equal(await landed(soloNetwork), "/admin");
    const soloChooser = await visit("/login", solo, soloEnv);
    assert.equal(soloChooser.status, 303);
    assert.equal(await landed(soloChooser), "/admin");

    const expired = await visit("/login/builders", "expired-session-token-expired-session-token-12");
    assert.equal(expired.status, 200);
    assert.match(await expired.text(), /Email me a sign-in link/);

    const noDb = await visit("/login/builders", MEMBER_TOKEN, {});
    assert.equal(noDb.status, 200);
    assert.match(await noDb.text(), /Email me a sign-in link/);

    const hidden = await visit("/api/hub/nav");
    assert.equal(hidden.status, 200);
    assert.equal(hidden.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await hidden.json(), { hub: false });
    const shown = await visit("/api/hub/nav", MEMBER_TOKEN);
    assert.deepEqual(await shown.json(), { hub: true });
    const stale = await visit("/api/hub/nav", "expired-session-token-expired-session-token-12");
    assert.deepEqual(await stale.json(), { hub: false });

    const home = await visit("/");
    const homeHtml = await home.text();
    assert.equal(home.headers.get("cache-control"), "no-store");
    assert.match(homeHtml, /<a class="nav-login" href="\/login\/business">Login<\/a>/);
    assert.match(homeHtml, /fetch\("\/api\/hub\/nav"/);
    assert.match(homeHtml, /Member Hub/);
    assert.match(homeHtml, /header a\[href='\/login\/business'\]/);
  } finally {
    db.close();
  }
});
