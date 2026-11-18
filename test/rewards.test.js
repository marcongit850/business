import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { ACTION_COPY } from "../src/hub-copy.js";
import { inviteShare } from "../src/hub-share.js";
import { renderNetworkHub } from "../src/hub-pages.js";
import { NETWORKS } from "../src/networks.js";
import {
  emptyPoints,
  normalizeReferralCode,
  pointsBreakdown,
  POINT_VALUES,
  referralJoinUrl,
  summarizePoints,
} from "../src/points.js";
import { validateIngest } from "../src/validate.js";
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
const { default: worker } = await import("../src/index.js");

const NOW = "2026-11-15T18:00:00.000Z";
const ADA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_TOKEN = "admin-session-token-admin-session-token-123456";
const ADA_TOKEN = "member-session-token-member-session-token-1234";
const ADMIN_CSRF = "admin-csrf-token";
const ADA_CSRF = "member-csrf";
const ADA_CODE = "abcd2345";
const ADA_BUILDERS_CODE = "kmnp2345";
const BEA_CODE = "efgh6789";
const LEGACY = [
  "0001_hub.sql",
  "0002_application_notes.sql",
  "0003_flagged_issues.sql",
  "0004_content_share_all.sql",
  "0005_login_events.sql",
];

function ui() {
  return {
    html: (body) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } }),
    text: (status, body) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } }),
  };
}

function ctxFor() {
  const jobs = [];
  return {
    jobs,
    waitUntil(promise) {
      jobs.push(promise);
    },
    async flush() {
      await Promise.all(jobs);
    },
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
    HUB_INGEST_KEY: "test-hub-key",
    EMAIL: { send: async () => {} },
    ...extra,
  };
}

function call(env, path, { method = "GET", token = "", form, json, ctx, key = false } = {}) {
  const headers = {};
  if (token) headers.cookie = `wl_session=${token}`;
  if (key) headers["x-hub-key"] = "test-hub-key";
  const init = { method, headers };
  if (json) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(json);
  } else if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = form.toString();
  }
  return handleHub(new Request(`https://waltonleaders.org${path}`, init), env, ui(), ctx);
}

async function member(db, id, email, name) {
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, name, NOW, NOW).run();
}

async function approve(db, id, network) {
  await db.prepare("INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, ?, 'member', 'approved', ?, ?)").bind(id, network, NOW, NOW).run();
}

async function session(db, id, token, email, csrf) {
  await db.prepare("INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, '2099-01-01T00:00:00.000Z', ?)").bind(id, await sha256(token), email, csrf, NOW).run();
}

async function code(db, memberId, network, value) {
  await db.prepare("INSERT INTO referral_codes (member_id, network, code, created_at) VALUES (?, ?, ?, ?)").bind(memberId, network, value, NOW).run();
}

function backfillSql() {
  const sql = readFileSync(new URL("../migrations/0006_referrals_points.sql", import.meta.url), "utf8");
  const start = sql.indexOf("INSERT OR IGNORE INTO points_events");
  assert.ok(start > 0);
  return sql.slice(start);
}

function ingestBody(network, email, ref, fields = { phone: "555-0100" }) {
  return {
    network,
    name: "New Applicant",
    email,
    submitted_at: new Date().toISOString(),
    source_url: NETWORKS[network].join,
    ref,
    fields,
  };
}

async function pointsOf(db, memberId, kind = "") {
  const sql = kind
    ? "SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS points FROM points_events WHERE member_id = ? AND kind = ?"
    : "SELECT COUNT(*) AS n, COALESCE(SUM(points), 0) AS points FROM points_events WHERE member_id = ?";
  const row = kind
    ? await db.prepare(sql).bind(memberId, kind).first()
    : await db.prepare(sql).bind(memberId).first();
  return { count: Number(row.n) || 0, points: Number(row.points) || 0 };
}

test("referral codes and point totals stay personal", () => {
  assert.equal(normalizeReferralCode(" ABCD2345 "), "abcd2345");
  assert.equal(normalizeReferralCode("abci2345"), "");
  assert.equal(normalizeReferralCode("abcd234"), "");
  assert.equal(normalizeReferralCode("abcd23450"), "");
  assert.equal(referralJoinUrl(NETWORKS.builders.join, "efgh6789"), "https://waltonbuildersnetwork.org/join?ref=efgh6789");
  assert.equal(referralJoinUrl(NETWORKS.tourism.join, "nope"), NETWORKS.tourism.join);
  const share = inviteShare("builders", "efgh6789");
  assert.equal(share.url, "https://waltonbuildersnetwork.org/join?ref=efgh6789");
  assert.match(share.message, /Join here: https:\/\/waltonbuildersnetwork\.org\/join\?ref=efgh6789$/);
  assert.equal(inviteShare("business").url, NETWORKS.business.join);
  const summary = summarizePoints([
    { kind: "welcome", network: "", points: 10 },
    { kind: "referral", network: "", points: 10 },
    { kind: "install", network: "", points: 5 },
    { kind: "facebook", network: "business", points: 2 },
    { kind: "facebook", network: "builders", points: 2 },
    { kind: "linkedin", network: "tourism", points: 2 },
  ], "business");
  assert.equal(summary.total, 31);
  assert.equal(summary.welcome, 10);
  assert.equal(summary.followedFacebook, true);
  assert.equal(summary.followedLinkedin, false);
  assert.equal(summary.installed, true);
  assert.match(pointsBreakdown(summary), /^Welcome bonus 10\. Referrals 10\. App install 5\. Facebook 4\. LinkedIn 2\.$/);
  assert.equal(pointsBreakdown(emptyPoints()), "Welcome bonus 0. Referrals 0. App install 0. Facebook 0. LinkedIn 0.");
  assert.equal(POINT_VALUES.welcome, 10);
  assert.equal(/[—–]/.test(pointsBreakdown(summary) + share.message), false);
});

test("each hub keeps four cards and uses that network's social links", () => {
  assert.equal(ACTION_COPY.socialTitle, "Join us on social");
  assert.equal(ACTION_COPY.facebookTitle, undefined);
  const points = summarizePoints([
    { kind: "welcome", points: 10, network: "" },
    { kind: "facebook", points: 2, network: "tourism" },
  ], "tourism");
  for (const network of ["business", "builders", "tourism"]) {
    const html = renderNetworkHub({
      session: { email: "ada@example.com", csrf: "csrf" },
      network,
      profile: { name: "Ada Example" },
      referralCode: ADA_CODE,
      points: emptyPoints(),
    });
    const grid = html.slice(html.indexOf('class="action-grid"'), html.indexOf('class="points-panel"'));
    assert.equal(grid.match(/class="action-card/g).length, 4, network);
    assert.match(grid, />Join us on social</);
    assert.equal(grid.includes("Join the Facebook group"), false, network);
    assert.match(grid, new RegExp(`href="${NETWORKS[network].facebook.replace(/[.]/g, "\\.")}" target="_blank" rel="noopener noreferrer">Facebook</a>`));
    assert.match(grid, new RegExp(`href="${NETWORKS[network].linkedin.replace(/[.]/g, "\\.")}" target="_blank" rel="noopener noreferrer">LinkedIn</a>`));
    assert.match(grid, /data-follow="facebook"/);
    assert.match(grid, /data-follow="linkedin"/);
    assert.match(grid, />I followed on Facebook</);
    assert.match(grid, />I followed on LinkedIn</);
    const invite = html.slice(html.indexOf('id="invite-dialog"'));
    const personal = `${NETWORKS[network].join}?ref=${ADA_CODE}`;
    assert.ok(invite.includes(personal), network);
    assert.ok(invite.includes(encodeURIComponent(personal)), network);
    assert.match(html, /Your points:/);
    assert.match(html, /Welcome bonus /);
    assert.match(html, /How to earn more:/);
    assert.equal(html.includes("leaderboard"), false, network);
    assert.equal(/[—–]/.test(html), false, network);
  }
  const tourism = renderNetworkHub({
    session: { email: "ada@example.com", csrf: "csrf" },
    network: "tourism",
    profile: { name: "Ada" },
    points,
  });
  assert.match(tourism, /data-installed="0"/);
  assert.match(tourism, /Followed on Facebook/);
  assert.match(tourism, /I followed on LinkedIn/);
  assert.match(tourism, /Welcome bonus 10\. Referrals 0\. App install 0\. Facebook 2\. LinkedIn 0\./);
});

test("the migration dedupes points and backfills the welcome bonus", () => {
  const sql = readFileSync(new URL("../migrations/0006_referrals_points.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE referral_codes/);
  assert.match(sql, /CREATE UNIQUE INDEX idx_referral_codes_code ON referral_codes \(code COLLATE NOCASE\)/);
  assert.match(sql, /ALTER TABLE applications ADD COLUMN referral_code/);
  assert.match(sql, /ALTER TABLE applications ADD COLUMN referrer_member_id/);
  assert.match(sql, /CREATE TABLE points_events/);
  assert.match(sql, /kind IN \('welcome', 'referral', 'install', 'facebook', 'linkedin'\)/);
  assert.match(sql, /UNIQUE \(member_id, kind, network, subject\)/);
  assert.match(sql, /CREATE UNIQUE INDEX idx_points_referral_once ON points_events \(subject\)/);
  assert.match(sql, /WHERE kind = 'referral' AND subject != ''/);
  assert.match(sql, /INSERT OR IGNORE INTO points_events/);
  assert.match(sql, /'welcome'/);
  assert.match(sql, /AND NOT EXISTS/);
  assert.equal(/[—–]/.test(sql), false);
});

test("welcome points are awarded once, referrals once per person, and follows once per network", async () => {
  const db = openHubDb();
  await member(db, ADA, "ada@example.com", "Ada Example");
  await member(db, BEA, "bea@example.com", "Bea Quiet");
  await member(db, CAM, "cam@example.com", "Cam Denied");
  await approve(db, ADA, "business");
  await approve(db, ADA, "builders");
  await approve(db, BEA, "business");
  await db.prepare("INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, 'tourism', 'member', 'denied', ?, ?)").bind(CAM, NOW, NOW).run();
  await code(db, ADA, "business", ADA_CODE);
  await code(db, ADA, "builders", ADA_BUILDERS_CODE);
  await code(db, BEA, "builders", BEA_CODE);
  await session(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", ADMIN_CSRF);
  await session(db, "sess-ada", ADA_TOKEN, "ada@example.com", ADA_CSRF);
  const env = envFor(db);
  const ctx = ctxFor();
  try {
    db.exec(backfillSql());
    db.exec(backfillSql());
    assert.deepEqual(await pointsOf(db, ADA, "welcome"), { count: 1, points: 10 });
    assert.deepEqual(await pointsOf(db, BEA, "welcome"), { count: 1, points: 10 });
    assert.deepEqual(await pointsOf(db, CAM, "welcome"), { count: 0, points: 0 });
    const welcomeId = await db.prepare("SELECT id FROM points_events WHERE member_id = ? AND kind = 'welcome'").bind(ADA).first();
    assert.equal(welcomeId.id, `welcome:${ADA}`);

    const good = validateIngest(ingestBody("builders", "new@example.com", ` ${ADA_BUILDERS_CODE.toUpperCase()} `, { phone: "555-0100", ref: BEA_CODE }));
    assert.equal(good.value.ref, ADA_BUILDERS_CODE);
    assert.equal(good.value.fields.ref, undefined);
    const fromFields = validateIngest({ ...ingestBody("tourism", "fields@example.com", undefined, { phone: "555", ref: "mnpq2345" }), ref: undefined });
    assert.equal(fromFields.value.ref, "mnpq2345");
    assert.equal(validateIngest({ ...ingestBody("builders", "bad@example.com", 12), ref: 12 }).value.ref, "");
    assert.equal(validateIngest(ingestBody("tourism", "bad@example.com", "not-a-code")).value.ref, "");

    const stored = await call(env, "/api/hub/applications", {
      method: "POST",
      json: ingestBody("builders", "new@example.com", ADA_BUILDERS_CODE),
      ctx,
      key: true,
    });
    assert.equal(stored.status, 201, await stored.clone().text());
    const created = await stored.json();
    const row = await db.prepare("SELECT referral_code, referrer_member_id, fields_json, status FROM applications WHERE id = ?").bind(created.id).first();
    assert.equal(row.referral_code, ADA_BUILDERS_CODE);
    assert.equal(row.referrer_member_id, ADA);
    assert.equal(JSON.parse(row.fields_json).ref, undefined);

    const detail = await call(env, `/admin/applications/${created.id}`, { token: ADMIN_TOKEN });
    const detailHtml = await detail.text();
    assert.match(detailHtml, /Referred by Ada Example/);
    assert.equal(detailHtml.includes(ADA_BUILDERS_CODE), false);

    const wrongNetwork = await call(env, "/api/hub/applications", {
      method: "POST",
      json: ingestBody("tourism", "tourist@example.com", ADA_BUILDERS_CODE),
      ctx,
      key: true,
    });
    assert.equal(wrongNetwork.status, 201);
    const wrong = await db.prepare("SELECT referral_code, referrer_member_id FROM applications WHERE email = 'tourist@example.com'").bind().first();
    assert.equal(wrong.referral_code, "");
    assert.equal(wrong.referrer_member_id, "");

    const denied = await call(env, "/api/hub/applications", {
      method: "POST",
      json: ingestBody("builders", "denied@example.com", ADA_BUILDERS_CODE),
      ctx,
      key: true,
    });
    const deniedId = (await denied.json()).id;
    const deny = await call(env, `/admin/applications/${deniedId}/deny`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF }),
    });
    assert.equal(deny.status, 303);
    assert.deepEqual(await pointsOf(db, ADA, "referral"), { count: 0, points: 0 });

    const approved = await call(env, `/admin/applications/${created.id}/approve`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF, networks: "builders" }),
    });
    assert.equal(approved.status, 303);
    assert.deepEqual(await pointsOf(db, ADA, "referral"), { count: 1, points: 10 });
    const applicant = await db.prepare("SELECT id FROM members WHERE email = 'new@example.com'").bind().first();
    assert.deepEqual(await pointsOf(db, applicant.id, "welcome"), { count: 1, points: 10 });
    assert.deepEqual(await pointsOf(db, applicant.id, "referral"), { count: 0, points: 0 });

    const again = await call(env, "/api/hub/applications", {
      method: "POST",
      json: ingestBody("builders", "new@example.com", BEA_CODE),
      ctx,
      key: true,
    });
    const againId = (await again.json()).id;
    const second = await call(env, `/admin/applications/${againId}/approve`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF, networks: "builders" }),
    });
    assert.equal(second.status, 303);
    assert.deepEqual(await pointsOf(db, ADA, "referral"), { count: 1, points: 10 });
    assert.deepEqual(await pointsOf(db, BEA, "referral"), { count: 0, points: 0 });
    assert.deepEqual(await pointsOf(db, applicant.id, "welcome"), { count: 1, points: 10 });

    const self = await call(env, "/api/hub/applications", {
      method: "POST",
      json: { ...ingestBody("builders", "ada@example.com", ADA_BUILDERS_CODE), name: "Ada Example" },
      ctx,
      key: true,
    });
    const selfId = (await self.json()).id;
    const selfForm = new URLSearchParams();
    selfForm.set("csrf", ADMIN_CSRF);
    selfForm.append("networks", "business");
    selfForm.append("networks", "builders");
    const selfApprove = await call(env, `/admin/applications/${selfId}/approve`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: selfForm,
    });
    assert.equal(selfApprove.status, 303);
    assert.deepEqual(await pointsOf(db, ADA, "referral"), { count: 1, points: 10 });
    assert.deepEqual(await pointsOf(db, ADA, "welcome"), { count: 1, points: 10 });

    const listBefore = await call(env, "/admin/members", { token: ADMIN_TOKEN });
    const listHtml = await listBefore.text();
    assert.match(listHtml, />Points</);
    const adaRow = listHtml.slice(listHtml.indexOf(ADA), listHtml.indexOf("</tr>", listHtml.indexOf(ADA)));
    assert.match(adaRow, /col-label">Points<\/span>20/);
    const memberPage = await call(env, `/admin/members/${ADA}`, { token: ADMIN_TOKEN });
    const memberHtml = await memberPage.text();
    assert.match(memberHtml, /Points: 20/);
    assert.match(memberHtml, /Welcome bonus 10\. Referrals 10\. App install 0\. Facebook 0\. LinkedIn 0\./);

    const hub = await call(env, "/hub/business", { token: ADA_TOKEN });
    assert.equal(hub.status, 200);
    const hubHtml = await hub.text();
    assert.match(hubHtml, /Your points: <span data-points-total>20<\/span>/);
    assert.match(hubHtml, /Welcome bonus 10/);
    assert.equal(hubHtml.includes("bea@example.com"), false);
    assert.equal(hubHtml.includes("leaderboard"), false);
    const personal = hubHtml.match(/https:\/\/waltonleaders\.org\/join\?ref=([abcdefghjkmnpqrstuvwxyz23456789]{8})/);
    assert.ok(personal);
    const savedCode = await db.prepare("SELECT code FROM referral_codes WHERE member_id = ? AND network = 'business'").bind(ADA).first();
    assert.equal(personal[1], savedCode.code);
    assert.ok(hubHtml.includes(encodeURIComponent(`https://waltonleaders.org/join?ref=${savedCode.code}`)));

    const claim = (kind, network, token = ADA_TOKEN, csrf = ADA_CSRF) => call(env, "/api/hub/points", {
      method: "POST",
      token,
      form: new URLSearchParams({ csrf, kind, network }),
    });
    const install = await claim("install", "business");
    assert.equal(install.status, 200);
    const installBody = await install.json();
    assert.equal(installBody.awarded, true);
    assert.equal(installBody.breakdown.install, 5);
    assert.equal(installBody.total, 25);
    const installAgain = await (await claim("install", "builders")).json();
    assert.equal(installAgain.awarded, false);
    assert.equal(installAgain.already, true);
    assert.equal(installAgain.breakdown.install, 5);

    const facebook = await (await claim("facebook", "business")).json();
    assert.equal(facebook.awarded, true);
    assert.equal(facebook.breakdown.facebook, 2);
    const facebookAgain = await (await claim("facebook", "business")).json();
    assert.equal(facebookAgain.already, true);
    assert.equal(facebookAgain.breakdown.facebook, 2);
    const otherNetwork = await (await claim("facebook", "builders")).json();
    assert.equal(otherNetwork.awarded, true);
    assert.equal(otherNetwork.breakdown.facebook, 4);
    const linkedin = await (await claim("linkedin", "business")).json();
    assert.equal(linkedin.awarded, true);
    assert.equal(linkedin.breakdown.linkedin, 2);
    assert.equal(linkedin.total, 31);

    const blocked = await claim("welcome", "business");
    assert.equal(blocked.status, 400);
    const forbidden = await claim("install", "tourism");
    assert.equal(forbidden.status, 403);
    const badCsrf = await claim("linkedin", "builders", ADA_TOKEN, "nope");
    assert.equal(badCsrf.status, 403);
    assert.deepEqual(await pointsOf(db, ADA), { count: 6, points: 31 });

    const listAfter = await call(env, "/admin/members", { token: ADMIN_TOKEN });
    const afterHtml = await listAfter.text();
    const adaAfter = afterHtml.slice(afterHtml.indexOf(ADA), afterHtml.indexOf("</tr>", afterHtml.indexOf(ADA)));
    assert.match(adaAfter, /col-label">Points<\/span>31/);
    const pageAfter = await call(env, `/admin/members/${ADA}`, { token: ADMIN_TOKEN });
    assert.match(await pageAfter.text(), /Points: 31/);
  } finally {
    await ctx.flush();
    db.close();
  }
});

test("the business join page keeps ref and stores the referrer", async () => {
  const db = openHubDb();
  await member(db, ADA, "ada@example.com", "Ada Example");
  await approve(db, ADA, "business");
  await code(db, ADA, "business", ADA_CODE);
  const env = envFor(db);
  const ctx = ctxFor();
  try {
    const blank = await worker.fetch(new Request("https://waltonleaders.org/join"), env, ctx);
    const blankHtml = await blank.text();
    assert.match(blankHtml, /<input type="hidden" name="ref" value="">/);
    const page = await worker.fetch(new Request(`https://waltonleaders.org/join?ref=${ADA_CODE.toUpperCase()}`), env, ctx);
    const html = await page.text();
    const form = html.slice(html.indexOf('class="apply-form"'), html.indexOf("</form>"));
    assert.match(form, new RegExp(`<input type="hidden" name="ref" value="${ADA_CODE}">`));
    assert.equal(html.split('name="ref"').length - 1, 1);

    const formData = new FormData();
    formData.set("name", "New Applicant");
    formData.set("email", "join@example.com");
    formData.set("phone", "555-0100");
    formData.set("company", "Harbor Co");
    formData.set("role", "Owner");
    formData.set("industry", "Retail");
    formData.set("years_in_walton", "4");
    formData.set("ref", ADA_CODE);
    const posted = await worker.fetch(new Request("https://waltonleaders.org/join", { method: "POST", body: formData }), env, ctx);
    assert.equal(posted.status, 303);
    const saved = await db.prepare("SELECT referral_code, referrer_member_id, network FROM applications WHERE email = 'join@example.com'").bind().first();
    assert.equal(saved.network, "business");
    assert.equal(saved.referral_code, ADA_CODE);
    assert.equal(saved.referrer_member_id, ADA);
  } finally {
    await ctx.flush();
    db.close();
  }
});

test("hub pages and applications still work before the points migration", async () => {
  const db = openHubDb({ migrations: LEGACY });
  await member(db, ADA, "ada@example.com", "Ada Example");
  await approve(db, ADA, "business");
  await session(db, "sess-ada", ADA_TOKEN, "ada@example.com", ADA_CSRF);
  await session(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", ADMIN_CSRF);
  const env = envFor(db);
  const ctx = ctxFor();
  try {
    const hub = await call(env, "/hub/business", { token: ADA_TOKEN });
    assert.equal(hub.status, 200);
    const html = await hub.text();
    assert.match(html, /Your points: <span data-points-total>0<\/span>/);
    assert.match(html, /Join here: https:\/\/waltonleaders\.org\/join</);
    assert.equal(html.includes("?ref="), false);
    const ingested = await call(env, "/api/hub/applications", {
      method: "POST",
      json: ingestBody("builders", "legacy@example.com", ADA_CODE),
      ctx,
      key: true,
    });
    assert.equal(ingested.status, 201);
    const id = (await ingested.json()).id;
    const approved = await call(env, `/admin/applications/${id}/approve`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: new URLSearchParams({ csrf: ADMIN_CSRF, networks: "builders" }),
    });
    assert.equal(approved.status, 303);
    const claim = await call(env, "/api/hub/points", {
      method: "POST",
      token: ADA_TOKEN,
      form: new URLSearchParams({ csrf: ADA_CSRF, kind: "install", network: "business" }),
    });
    assert.equal(claim.status, 503);
    const list = await call(env, "/admin/members", { token: ADMIN_TOKEN });
    assert.equal(list.status, 200);
    assert.match(await list.text(), /col-label">Points<\/span>0/);
  } finally {
    await ctx.flush();
    db.close();
  }
});
