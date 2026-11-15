import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";
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
const APP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ADMIN_TOKEN = "admin-session-token-admin-session-token-123456";
const MEMBER_TOKEN = "member-session-token-member-session-token-1234";
const ADMIN_CSRF = "admin-csrf-token";

function ui() {
  return {
    html: (body) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } }),
    text: (status, body) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } }),
  };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function seed(db) {
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(ADA, "ada@example.com", "Ada Example", NOW, NOW).run();
  for (const network of ["business", "tourism"]) {
    await db.prepare("INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, ?, 'member', 'approved', ?, ?)").bind(ADA, network, NOW, NOW).run();
  }
  await db.prepare(`INSERT INTO applications
    (id, network, name, email, submitted_at, source_url, fields_json, status, reviewed_at, reviewed_by, mailerlite_status, mailerlite_detail, created_at)
    VALUES (?, 'business', 'Ada Example', 'ada@example.com', ?, 'https://waltonleaders.org/join', '{}', 'approved', ?, 'marc@whpinc.com', 'added', 'Memberships added: Walton County Business Leaders.', ?)`).bind(APP, NOW, NOW, NOW).run();
  await db.prepare(`INSERT INTO applications
    (id, network, name, email, submitted_at, source_url, fields_json, status, created_at)
    VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'tourism', 'Ada Example', 'ada@example.com', ?, '', '{}', 'pending', ?)`).bind(NOW, NOW).run();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-admin', ?, 'marc@whpinc.com', ?, '2099-01-01T00:00:00.000Z', ?)`).bind(await sha256(ADMIN_TOKEN), ADMIN_CSRF, NOW).run();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-ada', ?, 'ada@example.com', 'member-csrf', '2099-01-01T00:00:00.000Z', ?)`).bind(await sha256(MEMBER_TOKEN), NOW).run();
}

function envFor(db) {
  return {
    DB: db,
    ADMIN_EMAILS: "marc@whpinc.com",
    MAILERLITE_API_KEY: "test-key",
    MAILERLITE_GROUP_MASTER: "master-group",
    MAILERLITE_GROUP_BUSINESS: "business-group",
    MAILERLITE_GROUP_BUSINESS_APPROVED: "business-approved",
    MAILERLITE_GROUP_BUILDERS: "builders-group",
    MAILERLITE_GROUP_BUILDERS_APPROVED: "builders-approved",
    MAILERLITE_GROUP_TOURISM: "tourism-group",
    MAILERLITE_GROUP_TOURISM_APPROVED: "tourism-approved",
    EMAIL: { send: async () => { throw new Error("no email should be sent"); } },
  };
}

function call(env, path, { method = "GET", token = "", form } = {}) {
  const headers = {};
  if (token) headers.cookie = `wl_session=${token}`;
  const init = { method, headers };
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = form.toString();
  }
  return handleHub(new Request(`https://waltonleaders.org${path}`, init), env, ui());
}

function networksForm(networks) {
  const form = new URLSearchParams();
  form.set("csrf", ADMIN_CSRF);
  for (const network of networks) form.append("networks", network);
  return form;
}

async function membership(db, network) {
  const row = await db.prepare("SELECT status FROM memberships WHERE member_id = ? AND network = ?").bind(ADA, network).first();
  return row?.status || "";
}

test("saving networks adds a checked network and removes an unchecked one", async () => {
  const db = openHubDb();
  await seed(db);
  const env = envFor(db);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    if (String(url).includes("/subscribers/ada%40example.com") && (init?.method || "GET") === "GET") {
      return new Response(JSON.stringify({ data: { id: "sub-ada" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const list = await call(env, "/admin", { token: ADMIN_TOKEN });
    const listHtml = await list.text();
    assert.match(listHtml, /Business Leaders<div class="meta">Also added: Tourism<\/div>/);
    const pending = listHtml.slice(listHtml.lastIndexOf("<tr>"));
    assert.equal(pending.includes("Also added"), false);

    const detail = await call(env, `/admin/applications/${APP}`, { token: ADMIN_TOKEN });
    const detailHtml = await detail.text();
    assert.match(detailHtml, /Also added: Tourism/);
    assert.match(detailHtml, /name="networks" value="tourism" checked/);
    assert.match(detailHtml, /<span class="meta">Member<\/span>/);
    assert.match(detailHtml, />Save networks</);
    assert.match(detailHtml, />Deny</);
    assert.match(detailHtml, /name="networks" value="business" checked disabled/);
    assert.equal(/value="builders" checked/.test(detailHtml), false);

    const changed = await call(env, `/admin/applications/${APP}/approve`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: networksForm(["business", "builders"]),
    });
    assert.equal(changed.status, 303);
    assert.equal(await membership(db, "business"), "approved");
    assert.equal(await membership(db, "builders"), "approved");
    assert.equal(await membership(db, "tourism"), "denied");

    const review = await db.prepare("SELECT mailerlite_detail, status FROM applications WHERE id = ?").bind(APP).first();
    assert.equal(review.status, "approved");
    assert.match(review.mailerlite_detail, /Memberships added: Walton County Builders Network\./);
    assert.match(review.mailerlite_detail, /Memberships removed: Walton County Tourism Network\./);
    const note = await db.prepare("SELECT body FROM application_notes WHERE application_id = ? ORDER BY created_at DESC").bind(APP).first();
    assert.match(note.body, /Memberships added: Walton County Builders Network\./);
    assert.match(note.body, /Memberships removed: Walton County Tourism Network\./);

    const post = calls.find((item) => item.method === "POST" && item.url.endsWith("/subscribers"));
    assert.ok(post);
    const groups = JSON.parse(post.body).groups;
    assert.ok(groups.includes("master-group"));
    assert.ok(groups.includes("builders-group"));
    assert.ok(groups.includes("builders-approved"));
    assert.equal(groups.includes("tourism-group"), false);
    const deleted = calls.filter((item) => item.method === "DELETE").map((item) => item.url);
    assert.equal(deleted.some((url) => url.includes("tourism-group")), true);
    assert.equal(deleted.some((url) => url.includes("tourism-approved")), true);
    assert.equal(deleted.some((url) => url.includes("master-group")), false);
    assert.equal(deleted.some((url) => url.includes("business-group")), false);

    const tourism = await call(env, "/hub/tourism", { token: MEMBER_TOKEN });
    assert.equal(tourism.status, 404);
    const builders = await call(env, "/hub/builders", { token: MEMBER_TOKEN });
    assert.equal(builders.status, 200);
    const business = await call(env, "/hub/business", { token: MEMBER_TOKEN });
    assert.equal(business.status, 200);

    const notesBefore = (await db.prepare("SELECT COUNT(*) AS n FROM application_notes WHERE application_id = ?").bind(APP).first()).n;
    const deletesBefore = calls.filter((item) => item.method === "DELETE").length;
    const again = await call(env, `/admin/applications/${APP}/approve`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: networksForm(["business", "builders"]),
    });
    assert.equal(again.status, 303);
    assert.equal(await membership(db, "business"), "approved");
    assert.equal(await membership(db, "builders"), "approved");
    assert.equal(await membership(db, "tourism"), "denied");
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM application_notes WHERE application_id = ?").bind(APP).first()).n, notesBefore);
    assert.equal(calls.filter((item) => item.method === "DELETE").length, deletesBefore);

    const tamper = await call(env, `/admin/applications/${APP}/approve`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: networksForm(["builders"]),
    });
    assert.equal(tamper.status, 303);
    assert.equal(await membership(db, "business"), "approved");
    assert.equal(await membership(db, "builders"), "approved");
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});
