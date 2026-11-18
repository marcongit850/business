import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { renderApplications } from "../src/hub-pages.js";
import { POINT_VALUES } from "../src/points.js";
import { openHubDb } from "./d1.js";

if (typeof crypto.subtle.timingSafeEqual !== "function") {
  Object.defineProperty(crypto.subtle, "timingSafeEqual", {
    value: (left, right) => timingSafeEqual(Buffer.from(left), Buffer.from(right)),
    configurable: true,
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
const ELI_MEMBER = "11111111-1111-4111-8111-111111111112";
const FLO_MEMBER = "11111111-1111-4111-8111-111111111113";
const APP_BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APP_CAM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const APP_DEE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const APP_ELI = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const APP_FLO = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const APP_SKIP = "12121212-1212-4121-8121-121212121212";
const APP_DENY = "13131313-1313-4131-8131-131313131313";
const APP_UNKNOWN = "99999999-9999-4999-8999-999999999999";
const APP_BOOM = "14141414-1414-4141-8141-141414141414";
const APP_OK = "15151515-1515-4151-8151-151515151515";
const APP_ALSO = "16161616-1616-4161-8161-161616161616";
const ADMIN_TOKEN = "admin-session-token-admin-session-token-123456";
const MEMBER_TOKEN = "member-session-token-member-session-token-1234";
const ADMIN_CSRF = "admin-csrf-token";

const session = { email: "marc@whpinc.com", csrf: ADMIN_CSRF };

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

function envFor(db, extra = {}) {
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
    ...extra,
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

async function member(db, id, email, name) {
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, name, NOW, NOW).run();
}

async function membership(db, id, network) {
  await db.prepare("INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, ?, 'member', 'approved', ?, ?)").bind(id, network, NOW, NOW).run();
}

async function sessionRow(db, id, token, email, csrf) {
  await db.prepare("INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, '2099-01-01T00:00:00.000Z', ?)").bind(id, await sha256(token), email, csrf, NOW).run();
}

async function application(db, { id, network, name, email, status = "pending", referrer = "" }) {
  await db.prepare(`INSERT INTO applications
    (id, network, name, email, submitted_at, source_url, fields_json, status, created_at, referral_code, referrer_member_id)
    VALUES (?, ?, ?, ?, ?, '', '{}', ?, ?, '', ?)`).bind(id, network, name, email, NOW, status, NOW, referrer).run();
}

function bulkForm(ids, extra = {}) {
  const form = new URLSearchParams();
  form.set("csrf", extra.csrf ?? ADMIN_CSRF);
  if (extra.network) form.set("network", extra.network);
  if (extra.status) form.set("status", extra.status);
  for (const id of ids) form.append("ids", id);
  return form;
}

function rowAround(html, id) {
  const valueAt = html.indexOf(`value="${id}"`);
  const at = valueAt === -1 ? html.indexOf(`/admin/applications/${id}`) : valueAt;
  const start = html.lastIndexOf("<tr>", at);
  return html.slice(start, html.indexOf("</tr>", at));
}

async function approvedNetworks(db, email) {
  const result = await db.prepare(`SELECT ms.network FROM members m
    JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'approved'
    WHERE m.email = ? ORDER BY ms.network`).bind(email).all();
  return (result.results || []).map((row) => row.network);
}

async function pointsOf(db, email, kind) {
  const person = await db.prepare("SELECT id FROM members WHERE email = ?").bind(email).first();
  if (!person) return { count: 0, points: 0 };
  const row = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS points FROM points_events WHERE member_id = ? AND kind = ?").bind(person.id, kind).first();
  return { count: Number(row.n) || 0, points: Number(row.points) || 0 };
}

function subscriberPosts(calls) {
  return calls
    .filter((item) => item.method === "POST" && item.url.endsWith("/subscribers"))
    .map((item) => JSON.parse(item.body));
}

function groupsFor(posts, email) {
  const match = posts.find((item) => item.email === email);
  assert.ok(match, email);
  return match.groups;
}

function element(props = {}) {
  return {
    type: props.type || "checkbox",
    name: props.name || "",
    checked: false,
    disabled: false,
    indeterminate: false,
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
}

test("pending rows can be selected and approved together", () => {
  const rows = [
    { id: APP_SKIP, name: "Ada Example", email: "ada@example.com", network: "business", status: "approved", submitted_at: NOW, member_networks: ["business", "tourism"] },
    { id: APP_BEA, name: "Bea Example", email: "bea@example.com", network: "builders", status: "pending", submitted_at: NOW, member_networks: [] },
    { id: APP_DENY, name: "Cam Example", email: "cam@example.com", network: "tourism", status: "denied", submitted_at: NOW, member_networks: [] },
  ];
  const html = renderApplications({ session, network: "builders", status: "pending", rows });
  const formStart = html.indexOf('id="bulk-approve"');
  const form = html.slice(formStart, html.indexOf("</form>", formStart));
  assert.match(form, /action="\/admin\/applications\/bulk-approve"/);
  assert.match(form, /name="csrf" value="admin-csrf-token"/);
  assert.match(form, /name="network" value="builders"/);
  assert.match(form, /name="status" value="pending"/);
  assert.equal(/deny/i.test(form), false);
  const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));
  assert.match(head, /data-select-pending/);
  assert.match(head, /Select all pending/);
  assert.equal(head.includes('name="ids"'), false);
  assert.equal(/data-select-pending[^>]*disabled/.test(head), false);
  const pending = rowAround(html, APP_BEA);
  assert.match(pending, new RegExp(`name="ids" value="${APP_BEA}"`));
  assert.match(pending, /Select Bea Example/);
  assert.match(pending, />Builders</);
  assert.equal(pending.includes("Also added"), false);
  assert.equal(rowAround(html, APP_SKIP).includes("<input"), false);
  assert.equal(rowAround(html, APP_DENY).includes("<input"), false);
  assert.match(html, /Business Leaders<div class="meta">Also added: Tourism<\/div>/);
  assert.match(html, /data-approve-selected disabled>Approve selected</);
  assert.match(html, /\.row-select \{[^}]*min-height: 44px/);
  assert.match(html, /\.bulk-bar \{[^}]*position: sticky;[^}]*bottom: 0/);
  assert.match(html, /\.bulk-bar \.button \{[^}]*min-height: 44px/);
  assert.match(html, /\.bulk-apply thead \{ display: block/);
  const script = html.slice(html.indexOf("<script>") + "<script>".length, html.lastIndexOf("</script>"));
  assert.match(script, /input\[name="ids"\]/);
  assert.match(script, /Approve selected \(" \+ checked \+ "\)/);
  assert.match(script, /count === 1 \? "application" : "applications"/);
  assert.match(script, /Approve " \+ count \+ " " \+ noun \+ "\?/);
  assert.equal(/[—–]/.test(html), false);

  const empty = renderApplications({ session, network: "", status: "", rows: [] });
  const emptyForm = empty.slice(empty.indexOf('id="bulk-approve"'), empty.indexOf("</form>", empty.indexOf('id="bulk-approve"')));
  assert.match(empty, /colspan="5"/);
  assert.match(empty, /data-select-pending disabled/);
  assert.equal(emptyForm.includes('name="ids"'), false);
  assert.match(empty, /data-approve-selected disabled>Approve selected</);

  const boxes = [element({ name: "ids" }), element({ name: "ids" }), element({ name: "ids" })];
  const selectAll = element();
  const button = { disabled: true, textContent: "Approve selected" };
  const fakeForm = {
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector(selector) {
      if (selector === "[data-select-pending]") return selectAll;
      if (selector === "[data-approve-selected]") return button;
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'input[name="ids"]' ? boxes : [];
    },
  };
  const confirmations = [];
  new Function("document", "window", script)(
    { getElementById: () => fakeForm },
    { confirm: (message) => { confirmations.push(message); return false; } },
  );
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Approve selected");
  let prevented = false;
  fakeForm.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(confirmations.length, 0);

  boxes[0].checked = true;
  fakeForm.listeners.change({ target: boxes[0] });
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Approve selected (1)");
  assert.equal(selectAll.checked, false);
  assert.equal(selectAll.indeterminate, true);
  prevented = false;
  fakeForm.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(confirmations, ["Approve 1 application?"]);

  selectAll.checked = true;
  selectAll.listeners.change();
  assert.equal(boxes.every((box) => box.checked), true);
  assert.equal(button.textContent, "Approve selected (3)");
  assert.equal(selectAll.indeterminate, false);
  prevented = false;
  fakeForm.listeners.submit({ preventDefault() { prevented = true; } });
  assert.deepEqual(confirmations.at(-1), "Approve 3 applications?");

  selectAll.checked = false;
  selectAll.listeners.change();
  assert.equal(boxes.some((box) => box.checked), false);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Approve selected");
});

test("bulk approve uses the single approve path once", () => {
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  const bulk = hub.slice(hub.indexOf("async function bulkApproveApplications"), hub.indexOf("async function approveApplication"));
  assert.match(bulk, /csrfOk\(session, form\)/);
  assert.match(bulk, /application\.status !== "pending"/);
  assert.match(bulk, /approvePendingApplication\(env, db, application, session\.email\)/);
  assert.equal(bulk.includes("INSERT INTO memberships"), false);
  assert.equal(bulk.includes("awardWelcomePoints"), false);
  assert.equal(bulk.includes("awardReferralPoints"), false);
  assert.equal(bulk.includes("addToMailerLite"), false);
  const shared = hub.slice(hub.indexOf("async function approveApplication"), hub.indexOf("async function denyApplication"));
  assert.equal(shared.split("applyApplicationApproval(").length - 1, 3);
  assert.equal(shared.split("INSERT INTO memberships").length - 1, 1);
  assert.equal(shared.split("awardWelcomePoints(").length - 1, 1);
  assert.equal(shared.split("awardReferralPoints(").length - 1, 1);
  assert.equal(shared.split("addToMailerLite(").length - 1, 1);
  assert.equal(/[—–]/.test(hub), false);
});

test("bulk approve matches single approve across networks and skips applications that are not pending", async () => {
  const db = openHubDb();
  await member(db, ADA, "ada@example.com", "Ada Example");
  await membership(db, ADA, "business");
  await member(db, ELI_MEMBER, "eli@example.com", "Eli Example");
  await membership(db, ELI_MEMBER, "business");
  await member(db, FLO_MEMBER, "flo@example.com", "Flo Example");
  await membership(db, FLO_MEMBER, "business");
  await application(db, { id: APP_BEA, network: "builders", name: "Bea Example", email: "bea@example.com", referrer: ADA });
  await application(db, { id: APP_CAM, network: "tourism", name: "Cam Example", email: "cam@example.com", referrer: ADA });
  await application(db, { id: APP_DEE, network: "business", name: "Dee Example", email: "dee@example.com" });
  await application(db, { id: APP_ELI, network: "tourism", name: "Eli Example", email: "eli@example.com", referrer: ADA });
  await application(db, { id: APP_FLO, network: "tourism", name: "Flo Example", email: "flo@example.com", referrer: ADA });
  await application(db, { id: APP_SKIP, network: "builders", name: "Skip Example", email: "skip@example.com", status: "approved", referrer: ADA });
  await application(db, { id: APP_DENY, network: "builders", name: "Deny Example", email: "deny@example.com", status: "denied", referrer: ADA });
  await sessionRow(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", ADMIN_CSRF);
  const env = envFor(db);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const list = await call(env, "/admin", { token: ADMIN_TOKEN });
    const listHtml = await list.text();
    assert.match(rowAround(listHtml, APP_BEA), new RegExp(`name="ids" value="${APP_BEA}"`));
    assert.equal(rowAround(listHtml, APP_SKIP).includes('name="ids"'), false);
    assert.equal(rowAround(listHtml, APP_DENY).includes('name="ids"'), false);

    const single = new URLSearchParams();
    single.set("csrf", ADMIN_CSRF);
    single.append("networks", "tourism");
    single.append("networks", "business");
    const approved = await call(env, `/admin/applications/${APP_FLO}/approve`, { method: "POST", token: ADMIN_TOKEN, form: single });
    assert.equal(approved.status, 303);

    const ids = [APP_BEA, APP_CAM, APP_DEE, APP_ELI, APP_FLO, APP_SKIP, APP_DENY, APP_UNKNOWN, APP_BEA, "nope"];
    const result = await call(env, "/admin/applications/bulk-approve", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: bulkForm(ids, { network: "builders", status: "pending" }),
    });
    assert.equal(result.status, 303);
    const location = new URL(result.headers.get("location"));
    assert.equal(location.pathname, "/admin");
    assert.equal(location.searchParams.get("network"), "builders");
    assert.equal(location.searchParams.get("status"), "pending");
    assert.equal(location.searchParams.get("notice"), "Approved 4. 4 skipped (already handled).");
    const page = await call(env, `${location.pathname}${location.search}`, { token: ADMIN_TOKEN });
    const pageHtml = await page.text();
    assert.match(pageHtml, /Approved 4\. 4 skipped \(already handled\)\./);
    assert.equal(/[—–]/.test(pageHtml), false);

    assert.deepEqual(await approvedNetworks(db, "bea@example.com"), ["builders"]);
    assert.deepEqual(await approvedNetworks(db, "cam@example.com"), ["tourism"]);
    assert.deepEqual(await approvedNetworks(db, "dee@example.com"), ["business"]);
    assert.deepEqual(await approvedNetworks(db, "eli@example.com"), ["business", "tourism"]);
    assert.deepEqual(await approvedNetworks(db, "flo@example.com"), ["business", "tourism"]);
    assert.equal(await db.prepare("SELECT id FROM members WHERE email = 'skip@example.com'").bind().first(), null);
    assert.equal(await db.prepare("SELECT id FROM members WHERE email = 'deny@example.com'").bind().first(), null);
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_SKIP).first()).status, "approved");
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_DENY).first()).status, "denied");
    assert.equal((await db.prepare("SELECT reviewed_by, mailerlite_status FROM applications WHERE id = ?").bind(APP_BEA).first()).reviewed_by, "marc@whpinc.com");
    assert.equal((await db.prepare("SELECT mailerlite_status FROM applications WHERE id = ?").bind(APP_BEA).first()).mailerlite_status, "added");

    const posts = subscriberPosts(calls);
    assert.deepEqual(groupsFor(posts, "bea@example.com"), ["master-group", "builders-group", "builders-approved"]);
    assert.deepEqual(groupsFor(posts, "cam@example.com"), ["master-group", "tourism-group", "tourism-approved"]);
    assert.deepEqual(groupsFor(posts, "dee@example.com"), ["master-group", "business-group", "business-approved"]);
    assert.deepEqual(groupsFor(posts, "eli@example.com"), groupsFor(posts, "flo@example.com"));
    assert.deepEqual(groupsFor(posts, "flo@example.com"), ["master-group", "tourism-group", "tourism-approved"]);
    assert.equal(posts.some((item) => item.email === "skip@example.com" || item.email === "deny@example.com"), false);
    assert.equal(calls.some((item) => item.method === "DELETE"), false);

    const eliNote = (await db.prepare("SELECT body FROM application_notes WHERE application_id = ?").bind(APP_ELI).first()).body;
    const floNote = (await db.prepare("SELECT body FROM application_notes WHERE application_id = ?").bind(APP_FLO).first()).body;
    assert.equal(eliNote, floNote);
    assert.match((await db.prepare("SELECT body FROM application_notes WHERE application_id = ?").bind(APP_BEA).first()).body, /Approved for Walton County Builders Network\./);

    for (const email of ["bea@example.com", "cam@example.com", "dee@example.com", "eli@example.com"]) {
      assert.deepEqual(await pointsOf(db, email, "welcome"), await pointsOf(db, "flo@example.com", "welcome"));
    }
    assert.deepEqual(await pointsOf(db, "flo@example.com", "welcome"), { count: 1, points: POINT_VALUES.welcome });
    assert.deepEqual(await pointsOf(db, "ada@example.com", "referral"), { count: 4, points: POINT_VALUES.referral * 4 });
    assert.deepEqual(await pointsOf(db, "dee@example.com", "referral"), { count: 0, points: 0 });
    const subjects = (await db.prepare("SELECT subject FROM points_events WHERE member_id = ? AND kind = 'referral' ORDER BY subject").bind(ADA).all()).results.map((row) => row.subject);
    assert.deepEqual(subjects, ["bea@example.com", "cam@example.com", "eli@example.com", "flo@example.com"]);

    const postsBefore = posts.length;
    const again = await call(env, "/admin/applications/bulk-approve", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: bulkForm(ids),
    });
    assert.equal(again.status, 303);
    assert.equal(new URL(again.headers.get("location")).searchParams.get("notice"), "Approved 0. 8 skipped (already handled).");
    assert.equal(subscriberPosts(calls).length, postsBefore);
    assert.deepEqual(await pointsOf(db, "ada@example.com", "referral"), { count: 4, points: POINT_VALUES.referral * 4 });
    assert.deepEqual(await pointsOf(db, "bea@example.com", "welcome"), { count: 1, points: POINT_VALUES.welcome });
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("bulk approve rejects a bad CSRF token, a non-admin, and a signed-out visitor", async () => {
  const db = openHubDb();
  await application(db, { id: APP_BEA, network: "tourism", name: "Bea Example", email: "bea@example.com" });
  await member(db, ADA, "ada@example.com", "Ada Example");
  await sessionRow(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", ADMIN_CSRF);
  await sessionRow(db, "sess-ada", MEMBER_TOKEN, "ada@example.com", "member-csrf");
  const env = envFor(db);
  try {
    const bad = await call(env, "/admin/applications/bulk-approve", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: bulkForm([APP_BEA], { csrf: "nope" }),
    });
    assert.equal(bad.status, 403);
    assert.match(await bad.text(), /form expired/i);
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_BEA).first()).status, "pending");

    const memberAttempt = await call(env, "/admin/applications/bulk-approve", {
      method: "POST",
      token: MEMBER_TOKEN,
      form: bulkForm([APP_BEA], { csrf: "member-csrf" }),
    });
    assert.equal(memberAttempt.status, 404);
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_BEA).first()).status, "pending");
    assert.equal(await db.prepare("SELECT id FROM members WHERE email = 'bea@example.com'").bind().first(), null);

    const signedOut = await call(env, "/admin/applications/bulk-approve", {
      method: "POST",
      form: bulkForm([APP_BEA]),
    });
    assert.equal(signedOut.status, 303);
    assert.match(signedOut.headers.get("location"), /\/login\?/);
    assert.match(signedOut.headers.get("location"), /next=%2Fadmin%2Fapplications%2Fbulk-approve/);
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_BEA).first()).status, "pending");

    const get = await call(env, "/admin/applications/bulk-approve", { token: ADMIN_TOKEN });
    assert.equal(get.status, 405);
  } finally {
    db.close();
  }
});

test("one bulk approve failure is named and the other applications still go through", async () => {
  const db = openHubDb();
  await application(db, { id: APP_OK, network: "business", name: "Ok Example", email: "ok@example.com", referrer: ADA });
  await application(db, { id: APP_BOOM, network: "builders", name: "Boom <Person>", email: "boom@example.com", referrer: ADA });
  await application(db, { id: APP_ALSO, network: "tourism", name: "Also Example", email: "also@example.com" });
  await member(db, ADA, "ada@example.com", "Ada Example");
  await membership(db, ADA, "business");
  await sessionRow(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", ADMIN_CSRF);
  const failing = {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...params) {
          const bound = statement.bind(...params);
          return {
            first: () => bound.first(),
            all: () => bound.all(),
            run() {
              if (sql.startsWith("INSERT INTO members") && params[1] === "boom@example.com") throw new Error("forced failure");
              return bound.run();
            },
          };
        },
      };
    },
  };
  const env = envFor(failing);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: init?.body || "" });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await call(env, "/admin/applications/bulk-approve", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: bulkForm([APP_OK, APP_BOOM, APP_ALSO]),
    });
    assert.equal(result.status, 303);
    const location = new URL(result.headers.get("location"));
    assert.equal(location.searchParams.get("notice"), "Approved 2. Failed: Boom <Person>.");
    const page = await call(env, `${location.pathname}${location.search}`, { token: ADMIN_TOKEN });
    const html = await page.text();
    assert.match(html, /Failed: Boom &lt;Person&gt;\./);
    assert.equal(html.includes("Boom <Person>"), false);
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_OK).first()).status, "approved");
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_ALSO).first()).status, "approved");
    assert.equal((await db.prepare("SELECT status FROM applications WHERE id = ?").bind(APP_BOOM).first()).status, "pending");
    assert.equal(await db.prepare("SELECT id FROM members WHERE email = 'boom@example.com'").bind().first(), null);
    assert.deepEqual(await approvedNetworks(db, "ok@example.com"), ["business"]);
    assert.deepEqual(await approvedNetworks(db, "also@example.com"), ["tourism"]);
    assert.deepEqual(await pointsOf(db, "ok@example.com", "welcome"), { count: 1, points: POINT_VALUES.welcome });
    assert.deepEqual(await pointsOf(db, "ada@example.com", "referral"), { count: 1, points: POINT_VALUES.referral });
    assert.deepEqual(groupsFor(subscriberPosts(calls), "ok@example.com"), ["master-group", "business-group", "business-approved"]);
    assert.deepEqual(groupsFor(subscriberPosts(calls), "also@example.com"), ["master-group", "tourism-group", "tourism-approved"]);
    assert.equal(subscriberPosts(calls).some((item) => item.email === "boom@example.com"), false);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});
