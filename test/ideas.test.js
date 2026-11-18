import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { APPLICATION_SENDERS } from "../src/application-email.js";
import { IDEA_COPY } from "../src/hub-copy.js";
import { renderMemberIdeas, renderNetworkHub } from "../src/hub-pages.js";
import {
  IDEA_BODY_LIMIT,
  IDEA_EMAIL_LIMIT,
  IDEA_IP_LIMIT,
  IDEA_NOTICE_TO,
  buildIdeaNotice,
  createMemberIdea,
  listMemberIdeas,
  markIdeaRead,
  validateIdea,
} from "../src/ideas.js";
import { formatWhen } from "../src/text.js";
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
const LATER = "2026-11-15T20:30:00.000Z";
const ADA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADA_TOKEN = "member-session-token-member-session-token-1234";
const ADMIN_TOKEN = "admin-session-token-admin-session-token-123456";
const ADA_CSRF = "member-csrf";
const ADMIN_CSRF = "admin-csrf-token";
const LEGACY = [
  "0001_hub.sql",
  "0002_application_notes.sql",
  "0003_flagged_issues.sql",
  "0004_content_share_all.sql",
  "0005_login_events.sql",
  "0006_referrals_points.sql",
];

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
    EMAIL: { send: async () => {} },
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

async function member(db, id, email, name, networks, status = "approved") {
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, email, name, NOW, NOW).run();
  for (const network of networks) {
    await db.prepare(
      "INSERT INTO memberships (member_id, network, role, status, created_at, updated_at) VALUES (?, ?, 'member', ?, ?, ?)",
    ).bind(id, network, status, NOW, NOW).run();
  }
}

async function session(db, id, token, email, csrf) {
  await db.prepare(
    "INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, '2099-01-01T00:00:00.000Z', ?)",
  ).bind(id, await sha256(token), email, csrf, NOW).run();
}

function ideaCard(html) {
  const start = html.indexOf('id="idea-card"');
  const end = html.indexOf('class="points-panel"');
  assert.ok(start !== -1 && end > start);
  return html.slice(start, end);
}

test("each hub shows the same idea card between the action row and the points panel", () => {
  assert.equal(IDEA_COPY.headline, "Advocacy is just the start.");
  assert.equal(IDEA_COPY.line, "As an early member, you can help steer this group's direction. Is there anything else you think we should become?");
  assert.equal(IDEA_COPY.placeholder, "Share your idea");
  assert.equal(IDEA_COPY.button, "Share your idea");
  assert.equal(IDEA_COPY.thanks, "Thanks, we read every idea.");
  assert.equal(IDEA_BODY_LIMIT, 2000);
  assert.equal(/[—–]/.test(Object.values(IDEA_COPY).join(" ")), false);

  for (const network of ["business", "builders", "tourism"]) {
    const html = renderNetworkHub({
      session: { email: "ada@example.com", csrf: "csrf-token" },
      admin: network === "business",
      network,
      profile: { name: "Ada Example" },
      idea: true,
      ideaDraft: "A calendar <of meetings>",
    });
    const grid = html.indexOf('class="action-grid"');
    const cardAt = html.indexOf('class="action-card idea-card"');
    const points = html.indexOf('class="points-panel"');
    assert.ok(grid !== -1 && grid < cardAt && cardAt < points, network);
    assert.equal(html.slice(grid, cardAt).match(/class="action-card/g).length, 4, network);
    const card = ideaCard(html);
    assert.match(card, /Advocacy is just the start\./);
    assert.match(card, /group&#39;s direction/);
    assert.match(card, /Is there anything else you think we should become\?/);
    assert.match(card, /placeholder="Share your idea"/);
    assert.match(card, /aria-label="Share your idea"/);
    assert.match(card, /required maxlength="2000"/);
    assert.match(card, />Share your idea</);
    assert.match(card, new RegExp(`action="/hub/${network}/idea"`));
    assert.match(card, /name="csrf" value="csrf-token"/);
    assert.match(card, /name="body"/);
    assert.match(card, /A calendar &lt;of meetings&gt;/);
    assert.match(card, /<path d="M15 14c\.2-1 \.7-1\.7 1\.5-2\.5/);
    assert.match(card, /<path d="M9 18h6"/);
    assert.equal(card.includes("points"), false, network);
    assert.match(html, /Thanks, we read every idea\./);
    assert.match(html, /\.action-card\.idea-card \{\s*display: grid;\s*grid-template-columns: 1fr;/);
    assert.match(html, /@media \(min-width: 801px\) \{[\s\S]*\.action-card\.idea-card \{\s*grid-template-columns: minmax\(0, 1\.1fr\) minmax\(260px, 0\.9fr\);/);
    assert.match(html, /@media \(min-width: 801px\) \{[\s\S]*\.idea-form \.button \{ width: auto; justify-self: start; \}/);
    assert.equal(/[—–]/.test(card), false, network);
    if (network === "business") {
      const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
      assert.match(nav, /<a class="admin-link" href="\/admin">Admin<\/a>/);
      assert.equal((nav.match(/href="\/admin/g) || []).length, 1);
      assert.equal(nav.includes('href="/admin/ideas"'), false);
      assert.equal(nav.includes('href="/admin/issues"'), false);
    }
  }
});

test("idea validation trims, requires text, and stops at 2000 characters", () => {
  assert.equal(validateIdea({ body: "  A public calendar.  " }).value.body, "A public calendar.");
  assert.match(validateIdea({ body: "   " }).error, /Share your idea before sending/);
  assert.match(validateIdea({ body: "" }).error, /Share your idea before sending/);
  assert.equal(validateIdea({ body: "x".repeat(2000) }).value.body.length, 2000);
  assert.match(validateIdea({ body: "x".repeat(2001) }).error, /2000 characters/);
  assert.equal(/[—–]/.test(validateIdea({ body: "" }).error + validateIdea({ body: "x".repeat(2001) }).error), false);
});

test("only an approved member of that network can store an idea, and it does not award points", async () => {
  const db = openHubDb();
  await member(db, ADA, "ada@example.com", "Ada Example", ["business"]);
  await member(db, BEA, "bea@example.com", "Bea Example", ["tourism"], "denied");
  await db.prepare(`INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at)
    VALUES (?, 'Ada Profile', '', '', '', '', '', '', ?)`).bind(ADA, NOW).run();

  const created = await createMemberIdea(db, {
    memberId: ADA,
    network: "business",
    body: "  Keep a public calendar.\nInclude workshops.  ",
    now: NOW,
    id: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(created.ok, true);
  assert.equal(created.idea.status, "new");
  const stored = await db.prepare("SELECT network, body, status, member_id FROM member_ideas WHERE id = ?").bind(created.idea.id).first();
  assert.equal(stored.network, "business");
  assert.equal(stored.body, "Keep a public calendar.\nInclude workshops.");
  assert.equal(stored.status, "new");
  assert.equal(stored.member_id, ADA);

  const other = await createMemberIdea(db, { memberId: ADA, network: "tourism", body: "No", now: NOW });
  assert.equal(other.ok, false);
  assert.equal(other.status, 404);
  const denied = await createMemberIdea(db, { memberId: BEA, network: "tourism", body: "No", now: NOW });
  assert.equal(denied.status, 404);
  const empty = await createMemberIdea(db, { memberId: ADA, network: "business", body: "  ", now: NOW });
  assert.equal(empty.status, 400);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM member_ideas").bind().first()).n, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM points_events WHERE member_id = ?").bind(ADA).first()).n, 0);

  const rows = await listMemberIdeas(db);
  assert.equal(rows[0].display_name, "Ada Profile");
  assert.equal(rows[0].email, "ada@example.com");
  const read = await markIdeaRead(db, created.idea.id);
  assert.equal(read.ok, true);
  assert.equal((await db.prepare("SELECT status FROM member_ideas WHERE id = ?").bind(created.idea.id).first()).status, "read");
  assert.equal((await markIdeaRead(db, created.idea.id)).ok, true);
  assert.equal((await markIdeaRead(db, "dddddddd-dddd-4ddd-8ddd-dddddddddddd")).ok, false);
  db.close();
});

test("idea notice goes to Marc from the network hello address and replies to the member", () => {
  for (const network of ["business", "builders", "tourism"]) {
    const sender = APPLICATION_SENDERS[network];
    const message = buildIdeaNotice({
      network,
      memberEmail: "ada@example.com",
      memberName: "Ada Profile",
      idea: { id: "11111111-1111-4111-8111-111111111111", body: "A calendar <script>" },
      origin: "https://waltonleaders.org",
    });
    assert.equal(message.from, sender.email);
    assert.equal(message.to, IDEA_NOTICE_TO);
    assert.equal(message.replyTo, "ada@example.com");
    assert.match(message.raw, new RegExp(`From: ${sender.name} <${sender.email.replace(/\./g, "\\.")}>`));
    assert.match(message.raw, /^To: marc@whpinc\.com$/m);
    assert.match(message.raw, /^Reply-To: ada@example\.com$/m);
    assert.equal(/^To: ada@example\.com$/m.test(message.raw), false);
    assert.match(message.raw, /Member: Ada Profile <ada@example\.com>/);
    assert.match(message.raw, new RegExp(sender.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(message.raw, /A calendar <script>/);
    assert.match(message.raw, /A calendar &lt;script&gt;/);
    assert.match(message.raw, /https:\/\/waltonleaders\.org\/admin\/ideas#idea-11111111-1111-4111-8111-111111111111/);
    assert.equal(/[—–]/.test(message.raw), false);
  }
  assert.equal(buildIdeaNotice({ network: "business", memberEmail: "not-an-email", idea: { id: "1", body: "X" } }), null);
  assert.equal(IDEA_EMAIL_LIMIT, 5);
  assert.equal(IDEA_IP_LIMIT, 20);
});

test("the idea route stays behind the member check and does not award points", () => {
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  const memberRoutes = hub.slice(hub.indexOf("async function memberRoutes"), hub.indexOf("async function listHubPosts"));
  const gate = memberRoutes.indexOf("if (!memberships.includes(network))");
  const idea = memberRoutes.indexOf('slug === "idea"');
  assert.ok(gate !== -1 && idea > gate);
  const ideaFn = hub.slice(hub.indexOf("async function ideaRoute"), hub.indexOf("function issueDraft"));
  assert.match(ideaFn, /memberEmail: member\.email/);
  assert.match(ideaFn, /memberName: member\.display_name/);
  assert.equal(ideaFn.includes('form.get("email")'), false);
  assert.match(ideaFn, /new EmailMessage\(notice\.from, notice\.to, notice\.raw\)/);
  assert.match(ideaFn, /idea-email:\$\{session\.email\}/);
  assert.match(ideaFn, /idea-ip:/);
  assert.match(ideaFn, /csrfOk/);
  assert.equal(ideaFn.includes("awardPoints"), false);
  assert.equal(ideaFn.includes("points_events"), false);
  const admin = hub.slice(hub.indexOf("async function adminRoutes"), hub.indexOf("async function listApplications"));
  const flagged = admin.indexOf('"/admin/issues"');
  const ideas = admin.indexOf('"/admin/ideas"');
  assert.ok(admin.indexOf("if (!admin)") < flagged && flagged < ideas);
  const sql = readFileSync(new URL("../migrations/0007_member_ideas.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE member_ideas/);
  assert.match(sql, /member_id TEXT NOT NULL/);
  assert.match(sql, /network TEXT NOT NULL CHECK \(network IN \('business', 'builders', 'tourism'\)\)/);
  assert.match(sql, /body TEXT NOT NULL/);
  assert.match(sql, /created_at TEXT NOT NULL/);
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'new'/);
  assert.equal(sql.includes("points_events"), false);
  assert.equal(/points\s+INTEGER/i.test(sql), false);
  assert.equal(/[—–]/.test(sql + ideaFn), false);
});

test("posting an idea emails Marc, redirects with the thanks notice, and lists newest first", async () => {
  const db = openHubDb();
  await member(db, ADA, "ada@example.com", "Ada Member", ["business"]);
  await member(db, BEA, "bea@example.com", "Bea Example", ["builders", "business"]);
  await db.prepare(`INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at)
    VALUES (?, 'Ada Profile', 'Harbor Co', '', '', '', '', '', ?)`).bind(ADA, NOW).run();
  await session(db, "sess-ada", ADA_TOKEN, "ada@example.com", ADA_CSRF);
  await session(db, "sess-bea", "bea-token-bea-token-bea-token-bea-token-1234", "bea@example.com", "bea-csrf");
  await session(db, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", ADMIN_CSRF);
  await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "marc@whpinc.com", "Marc", NOW, NOW,
  ).run();
  const sent = [];
  const env = envFor(db, { EMAIL: { send: async (message) => { sent.push(message); } } });

  const anonymous = await call(env, "/hub/business/idea", { method: "POST", form: new URLSearchParams({ csrf: ADA_CSRF, body: "Nope" }) });
  assert.equal(anonymous.status, 303);
  assert.match(anonymous.headers.get("location"), /\/login/);

  const wrongNetwork = await call(env, "/hub/tourism/idea", {
    method: "POST",
    token: ADA_TOKEN,
    form: new URLSearchParams({ csrf: ADA_CSRF, body: "Should not save" }),
  });
  assert.equal(wrongNetwork.status, 404);

  const badCsrf = await call(env, "/hub/business/idea", {
    method: "POST",
    token: ADA_TOKEN,
    form: new URLSearchParams({ csrf: "nope", body: "Should not save" }),
  });
  assert.equal(badCsrf.status, 403);

  const empty = await call(env, "/hub/business/idea", {
    method: "POST",
    token: ADA_TOKEN,
    form: new URLSearchParams({ csrf: ADA_CSRF, body: "   " }),
  });
  assert.equal(empty.status, 400);
  assert.match(await empty.text(), /Share your idea before sending/);

  const tooLong = await call(env, "/hub/business/idea", {
    method: "POST",
    token: ADA_TOKEN,
    form: new URLSearchParams({ csrf: ADA_CSRF, body: "y".repeat(2001) }),
  });
  assert.equal(tooLong.status, 400);
  assert.match(await tooLong.text(), /2000 characters/);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM member_ideas").bind().first()).n, 0);

  const posted = await call(env, "/hub/business/idea", {
    method: "POST",
    token: ADA_TOKEN,
    form: new URLSearchParams({ csrf: ADA_CSRF, body: "Keep a public calendar of <meetings>." }),
  });
  assert.equal(posted.status, 303);
  assert.match(posted.headers.get("location"), /\/hub\/business\?idea=1$/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "hello@waltonleaders.org");
  assert.equal(sent[0].to, "marc@whpinc.com");
  assert.match(sent[0].raw, /Reply-To: ada@example\.com/);
  assert.match(sent[0].raw, /Ada Profile/);
  assert.match(sent[0].raw, /Walton County Business Leaders/);
  assert.match(sent[0].raw, /Keep a public calendar of <meetings>\./);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM points_events").bind().first()).n, 0);

  const home = await call(env, "/hub/business?idea=1", { token: ADA_TOKEN });
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /Thanks, we read every idea\./);
  assert.match(homeHtml, /action="\/hub\/business\/idea"/);
  const card = ideaCard(homeHtml);
  assert.equal(card.includes("Keep a public calendar"), false);

  await db.prepare("UPDATE member_ideas SET created_at = ?").bind(NOW).run();
  const bea = await call(env, "/hub/builders/idea", {
    method: "POST",
    token: "bea-token-bea-token-bea-token-bea-token-1234",
    form: new URLSearchParams({ csrf: "bea-csrf", body: "A workshop series." }),
  });
  assert.equal(bea.status, 303);
  assert.equal(sent[1].from, "hello@waltonbuildersnetwork.org");
  assert.match(sent[1].raw, /Bea Example/);
  await db.prepare("UPDATE member_ideas SET created_at = ? WHERE body = ?").bind(LATER, "A workshop series.").run();

  const visitor = await call(env, "/admin/ideas", { token: ADA_TOKEN });
  assert.equal(visitor.status, 404);

  const list = await call(env, "/admin/ideas", { token: ADMIN_TOKEN });
  assert.equal(list.status, 200);
  const listHtml = await list.text();
  const workshop = listHtml.indexOf("A workshop series.");
  const calendar = listHtml.indexOf("Keep a public calendar of &lt;meetings&gt;.");
  assert.ok(workshop !== -1 && workshop < calendar);
  assert.match(listHtml, new RegExp(`${formatWhen(LATER).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} CT`));
  assert.match(listHtml, /Ada Profile/);
  assert.match(listHtml, /ada@example\.com/);
  assert.match(listHtml, /Bea Example/);
  assert.match(listHtml, /Builders/);
  assert.match(listHtml, /Business Leaders/);
  assert.match(listHtml, />Mark read</);
  assert.equal(listHtml.includes("<meetings>"), false);
  const nav = listHtml.slice(listHtml.indexOf("<nav"), listHtml.indexOf("</nav>"));
  assert.ok(nav.indexOf('href="/admin/issues"') < nav.indexOf('href="/admin/ideas">Ideas'));

  const id = (await db.prepare("SELECT id FROM member_ideas WHERE body = ?").bind("A workshop series.").first()).id;
  const marked = await call(env, `/admin/ideas/${id}/read`, {
    method: "POST",
    token: ADMIN_TOKEN,
    form: new URLSearchParams({ csrf: ADMIN_CSRF }),
  });
  assert.equal(marked.status, 303);
  assert.match(marked.headers.get("location"), /\/admin\/ideas\?read=1$/);
  assert.equal((await db.prepare("SELECT status FROM member_ideas WHERE id = ?").bind(id).first()).status, "read");
  const after = await call(env, marked.headers.get("location").replace("https://waltonleaders.org", ""), { token: ADMIN_TOKEN });
  const afterHtml = await after.text();
  assert.match(afterHtml, /Marked read\./);
  assert.match(afterHtml, /<span class="pill">Read<\/span>/);
  const otherId = (await db.prepare("SELECT id FROM member_ideas WHERE body LIKE 'Keep a public%'").bind().first()).id;
  assert.equal((await db.prepare("SELECT status FROM member_ideas WHERE id = ?").bind(otherId).first()).status, "new");

  const missing = await call(env, "/admin/ideas/dddddddd-dddd-4ddd-8ddd-dddddddddddd/read", {
    method: "POST",
    token: ADMIN_TOKEN,
    form: new URLSearchParams({ csrf: ADMIN_CSRF }),
  });
  assert.equal(missing.status, 404);

  await db.prepare("UPDATE rate_limits SET window_start = ?, count = ? WHERE bucket = ?").bind(
    new Date().toISOString(), IDEA_EMAIL_LIMIT, "idea-email:ada@example.com",
  ).run();
  const limited = await call(env, "/hub/business/idea", {
    method: "POST",
    token: ADA_TOKEN,
    form: new URLSearchParams({ csrf: ADA_CSRF, body: "One more idea" }),
  });
  assert.equal(limited.status, 429);
  assert.match(await limited.text(), /Please wait a bit and try again/);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM member_ideas WHERE body = 'One more idea'").bind().first()).n, 0);

  const legacy = openHubDb({ migrations: LEGACY });
  await member(legacy, ADA, "ada@example.com", "Ada Example", ["business"]);
  await session(legacy, "sess-ada", ADA_TOKEN, "ada@example.com", ADA_CSRF);
  await session(legacy, "sess-admin", ADMIN_TOKEN, "marc@whpinc.com", ADMIN_CSRF);
  const legacyHome = await call(envFor(legacy), "/hub/business", { token: ADA_TOKEN });
  assert.equal(legacyHome.status, 200);
  assert.match(await legacyHome.text(), /action="\/hub\/business\/idea"/);
  const legacyPost = await call(envFor(legacy), "/hub/business/idea", {
    method: "POST",
    token: ADA_TOKEN,
    form: new URLSearchParams({ csrf: ADA_CSRF, body: "Needs the table" }),
  });
  assert.equal(legacyPost.status, 503);
  assert.match(await legacyPost.text(), /latest database migration/);
  const legacyAdmin = await call(envFor(legacy), "/admin/ideas", { token: ADMIN_TOKEN });
  assert.equal(legacyAdmin.status, 503);
  assert.match(await legacyAdmin.text(), /latest database migration/);
  legacy.close();
  db.close();
});

test("the admin ideas page escapes text and offers mark read only while an idea is new", () => {
  const html = renderMemberIdeas({
    session: { csrf: "csrf-token" },
    message: "Marked read.",
    rows: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        network: "tourism",
        display_name: "Ada <Profile>",
        email: "ada@example.com",
        created_at: LATER,
        body: "Line one\n<script>",
        status: "new",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        network: "business",
        display_name: "Bea Example",
        email: "bea@example.com",
        created_at: NOW,
        body: "Already read",
        status: "read",
      },
    ],
  });
  assert.match(html, /Marked read\./);
  assert.match(html, /Ada &lt;Profile&gt;/);
  assert.match(html, /Line one\n&lt;script&gt;/);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /action="\/admin\/ideas\/11111111-1111-4111-8111-111111111111\/read"/);
  assert.match(html, /name="csrf" value="csrf-token"/);
  assert.match(html, />Mark read</);
  assert.match(html, /<span class="pill">Read<\/span>/);
  assert.match(html, new RegExp(`${formatWhen(LATER).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} CT`));
  assert.equal(/[—–]/.test(html), false);
});
