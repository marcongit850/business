import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { openHubDb } from "./d1.js";
import { formatLoginWhen } from "../src/text.js";

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
const EARLIER = "2026-11-14T15:00:00.000Z";
const LATER = "2026-11-16T18:30:00.000Z";
const ADA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MARC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const APP = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ADMIN_TOKEN = "admin-session-token-admin-session-token-123456";
const MEMBER_TOKEN = "member-session-token-member-session-token-1234";
const ADA_LAST = formatLoginWhen(NOW);
const MARC_LAST = formatLoginWhen(LATER);

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

async function count(db, sql, ...params) {
  const row = await db.prepare(sql).bind(...params).first();
  return row.n;
}

function envFor(db, sent = { raw: "" }) {
  return {
    DB: db,
    ADMIN_EMAILS: "marc@whpinc.com",
    EMAIL: {
      async send(message) {
        sent.raw = message.raw || "";
      },
    },
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

async function member(db, id, email, name) {
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, name, NOW, NOW).run();
}

async function approve(db, id, network) {
  await db.prepare("INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, ?, 'member', 'approved', ?, ?)").bind(id, network, NOW, NOW).run();
}

async function session(db, id, token, email, csrf) {
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, '2099-01-01T00:00:00.000Z', ?)`).bind(id, await sha256(token), email, csrf, NOW).run();
}

async function event(db, id, email, network, createdAt) {
  await db.prepare("INSERT INTO login_events (id, email, network, created_at) VALUES (?, ?, ?, ?)").bind(id, email, network, createdAt).run();
}

function memberIds(html) {
  return [...html.matchAll(/\/admin\/members\/([0-9a-f-]{36})/g)].map((match) => match[1]);
}

function memberRow(html, id) {
  const start = html.indexOf(`/admin/members/${id}`);
  assert.notEqual(start, -1, id);
  return html.slice(start, html.indexOf("</tr>", start));
}

test("a magic-link request does not record a login, and a successful sign-in does", async () => {
  const db = openHubDb();
  const sent = { raw: "" };
  const env = envFor(db, sent);
  await member(db, ADA, "ada@example.com", "Ada Example");
  await approve(db, ADA, "builders");
  await approve(db, ADA, "business");
  try {
    const asked = await call(env, "/login/builders", {
      method: "POST",
      form: new URLSearchParams({ email: "Ada@Example.com" }),
    });
    assert.equal(asked.status, 303);
    assert.match(asked.headers.get("location"), /\/login\/builders\?sent=1$/);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM login_events"), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM magic_links WHERE email = ?", "ada@example.com"), 1);
    assert.match(sent.raw, /\/login\/verify\?token=/);

    const stranger = await call(env, "/login/builders", {
      method: "POST",
      form: new URLSearchParams({ email: "nobody@example.com" }),
    });
    assert.equal(stranger.status, 303);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM login_events"), 0);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM magic_links WHERE email = ?", "nobody@example.com"), 0);

    const link = sent.raw.match(/https:\/\/waltonleaders\.org\/login\/verify\?token=([A-Za-z0-9_-]+)&network=(business|builders|tourism)/);
    assert.ok(link, sent.raw);
    assert.equal(link[2], "builders");
    const verified = await call(env, `/login/verify?token=${link[1]}&network=${link[2]}`);
    assert.equal(verified.status, 303);
    assert.match(verified.headers.get("location"), /\/hub\/builders$/);
    const cookies = verified.headers.getSetCookie?.() || [verified.headers.get("set-cookie")];
    assert.equal(cookies.some((item) => String(item).startsWith("wl_session=")), true);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM sessions WHERE email = ?", "ada@example.com"), 1);

    const events = await db.prepare("SELECT email, network, created_at FROM login_events").bind().all();
    assert.equal(events.results.length, 1);
    assert.equal(events.results[0].email, "ada@example.com");
    assert.equal(events.results[0].network, "builders");
    assert.match(events.results[0].created_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(JSON.stringify(events.results[0]).includes(link[1]), false);
    assert.equal(Object.hasOwn(events.results[0], "request_ip"), false);
    assert.equal(Object.hasOwn(events.results[0], "user_agent"), false);

    const again = await call(env, `/login/verify?token=${link[1]}&network=builders`);
    assert.equal(again.status, 303);
    assert.match(again.headers.get("location"), /notice=invalid/);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM login_events"), 1);

    const bad = await call(env, "/login/verify?token=not-a-valid-token-not-a-valid-token-not-a&network=tourism");
    assert.equal(bad.status, 303);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM login_events"), 1);

    const bareToken = "second-token-second-token-second-token-second";
    await db.prepare(`INSERT INTO magic_links (id, email, token_hash, expires_at, created_at, request_ip)
      VALUES ('link-bare', 'ada@example.com', ?, '2099-01-01T00:00:00.000Z', ?, '')`).bind(await sha256(bareToken), NOW).run();
    const bare = await call(env, `/login/verify?token=${bareToken}`);
    assert.equal(bare.status, 303);
    assert.match(bare.headers.get("location"), /\/hub$/);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM sessions WHERE email = ?", "ada@example.com"), 2);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM login_events"), 1);

    const info = await db.prepare("PRAGMA table_info(login_events)").bind().all();
    assert.deepEqual(info.results.map((column) => column.name), ["id", "email", "network", "created_at"]);
  } finally {
    db.close();
  }
});

test("admins see login counts and last sign-in, including their own", async () => {
  const db = openHubDb();
  const env = envFor(db);
  await member(db, ADA, "ada@example.com", "Ada Example");
  await member(db, BEA, "bea@example.com", "Bea Quiet");
  await member(db, MARC, "marc@whpinc.com", "Marc");
  await approve(db, ADA, "business");
  await approve(db, ADA, "builders");
  await approve(db, BEA, "tourism");
  await approve(db, MARC, "business");
  await event(db, "evt-ada-1", "ada@example.com", "business", EARLIER);
  await event(db, "evt-ada-2", "Ada@Example.com", "builders", NOW);
  await event(db, "evt-marc", "marc@whpinc.com", "business", LATER);
  await db.prepare(`INSERT INTO applications
    (id, network, name, email, submitted_at, source_url, fields_json, status, created_at)
    VALUES (?, 'business', 'Ada Example', 'ada@example.com', ?, 'https://waltonleaders.org/join', '{}', 'approved', ?)`).bind(APP, EARLIER, EARLIER).run();
  await session(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", "admin-csrf");
  await session(db, "sess-ada", MEMBER_TOKEN, "ada@example.com", "member-csrf");
  try {
    assert.equal(ADA_LAST, "Nov 15, 2026, 12:00 PM CT");
    assert.equal(MARC_LAST, "Nov 16, 2026, 12:30 PM CT");

    const list = await call(env, "/admin/members", { token: ADMIN_TOKEN });
    assert.equal(list.status, 200);
    const html = await list.text();
    assert.match(html, /href="\/admin\/members" aria-current="true">Member</);
    assert.match(html, /href="\/admin\/members\?sort=logins">Logins</);
    assert.match(html, /href="\/admin\/members\?sort=last">Last login</);
    assert.deepEqual(memberIds(html), [ADA, BEA, MARC]);
    const ada = memberRow(html, ADA);
    assert.match(ada, /col-label">Logins<\/span>2/);
    assert.match(ada, new RegExp(ADA_LAST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(ada.includes(formatLoginWhen(EARLIER)), false);
    const bea = memberRow(html, BEA);
    assert.match(bea, /col-label">Logins<\/span>0/);
    assert.match(bea, /Never/);
    const marc = memberRow(html, MARC);
    assert.match(marc, /col-label">Logins<\/span>1/);
    assert.match(marc, new RegExp(MARC_LAST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const byCount = await call(env, "/admin/members?sort=logins", { token: ADMIN_TOKEN });
    const countHtml = await byCount.text();
    assert.deepEqual(memberIds(countHtml), [ADA, MARC, BEA]);
    assert.match(countHtml, /href="\/admin\/members\?sort=logins" aria-current="true">Logins</);

    const byLast = await call(env, "/admin/members?sort=last", { token: ADMIN_TOKEN });
    const lastHtml = await byLast.text();
    assert.deepEqual(memberIds(lastHtml), [MARC, ADA, BEA]);
    assert.match(lastHtml, /href="\/admin\/members\?sort=last" aria-current="true">Last login</);

    const detail = await call(env, `/admin/members/${ADA}`, { token: ADMIN_TOKEN });
    const detailHtml = await detail.text();
    assert.match(detailHtml, /Logins: 2/);
    assert.match(detailHtml, new RegExp(`Last login: ${ADA_LAST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    const own = await call(env, `/admin/members/${MARC}`, { token: ADMIN_TOKEN });
    assert.match(await own.text(), /Logins: 1/);
    const quiet = await call(env, `/admin/members/${BEA}`, { token: ADMIN_TOKEN });
    const quietHtml = await quiet.text();
    assert.match(quietHtml, /Logins: 0/);
    assert.match(quietHtml, /Last login: Never/);

    const application = await call(env, `/admin/applications/${APP}`, { token: ADMIN_TOKEN });
    const applicationHtml = await application.text();
    assert.match(applicationHtml, /Logins: 2/);
    assert.match(applicationHtml, new RegExp(`Last login: ${ADA_LAST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const hidden = await call(env, "/admin/members", { token: MEMBER_TOKEN });
    assert.equal(hidden.status, 404);
    assert.equal((await hidden.text()).includes("Last login"), false);
    const hubPage = await call(env, "/hub/business", { token: MEMBER_TOKEN });
    assert.equal(hubPage.status, 200);
    assert.equal((await hubPage.text()).includes("Last login"), false);
    assert.equal(/[—–]/.test(html + detailHtml + applicationHtml), false);
  } finally {
    db.close();
  }
});

test("sign-in still works when login_events is not created yet", async () => {
  const db = openHubDb();
  const sent = { raw: "" };
  const env = envFor(db, sent);
  await member(db, ADA, "ada@example.com", "Ada Example");
  await member(db, MARC, "marc@whpinc.com", "Marc");
  await approve(db, ADA, "business");
  await approve(db, MARC, "business");
  await session(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", "admin-csrf");
  await db.prepare("DROP TABLE login_events").bind().run();
  try {
    const asked = await call(env, "/login/business", {
      method: "POST",
      form: new URLSearchParams({ email: "ada@example.com" }),
    });
    assert.equal(asked.status, 303);
    assert.match(asked.headers.get("location"), /\/login\/business\?sent=1$/);
    const link = sent.raw.match(/https:\/\/waltonleaders\.org\/login\/verify\?token=([A-Za-z0-9_-]+)&network=business/);
    assert.ok(link, sent.raw);

    const verified = await call(env, `/login/verify?token=${link[1]}&network=business`);
    assert.equal(verified.status, 303);
    assert.match(verified.headers.get("location"), /\/hub\/business$/);
    assert.equal(await count(db, "SELECT COUNT(*) AS n FROM sessions WHERE email = ?", "ada@example.com"), 1);
    assert.equal((await verified.text()).includes("member database is not ready"), false);

    const list = await call(env, "/admin/members", { token: ADMIN_TOKEN });
    assert.equal(list.status, 200);
    const html = await list.text();
    assert.equal(html.includes("member database is not ready"), false);
    assert.match(memberRow(html, ADA), /col-label">Logins<\/span>0/);
    assert.match(memberRow(html, ADA), /Never/);
    assert.match(memberRow(html, MARC), /Never/);

    const detail = await call(env, `/admin/members/${ADA}`, { token: ADMIN_TOKEN });
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.match(detailHtml, /Logins: 0/);
    assert.match(detailHtml, /Last login: Never/);
  } finally {
    db.close();
  }
});

test("the login event migration stores only email, network, and time", () => {
  const sql = readFileSync(new URL("../migrations/0005_login_events.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE login_events/);
  assert.match(sql, /email TEXT NOT NULL COLLATE NOCASE/);
  assert.match(sql, /network TEXT NOT NULL CHECK \(network IN \('business', 'builders', 'tourism'\)\)/);
  assert.match(sql, /created_at TEXT NOT NULL/);
  assert.match(sql, /CREATE INDEX idx_login_events_email ON login_events \(email\)/);
  assert.equal(/request_ip|user_agent|token_hash|\btoken\b/i.test(sql), false);
  assert.equal(/[—–]/.test(sql), false);
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  const request = hub.slice(hub.indexOf("async function requestLink"), hub.indexOf("async function recordLoginEvent"));
  assert.equal(request.includes("login_events"), false);
  assert.equal(request.includes("recordLoginEvent"), false);
  const record = hub.slice(hub.indexOf("async function recordLoginEvent"), hub.indexOf("async function verifyLink"));
  assert.match(record, /INSERT INTO login_events \(id, email, network, created_at\)/);
  assert.equal(/request_ip|user_agent|user-agent|CF-Connecting-IP/i.test(record), false);
  const verify = hub.slice(hub.indexOf("async function verifyLink"), hub.indexOf("async function logout"));
  assert.match(verify, /recordLoginEvent\(db, row\.email, requested, now\)/);
});
