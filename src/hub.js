import { EmailMessage } from "cloudflare:email";
import { stripImageMetadata, MAX_IMAGE_BYTES } from "./images.js";
import {
  renderApplicationDetail,
  renderApplications,
  renderContentEditor,
  renderContentList,
  renderHubHome,
  renderMemberDetail,
  renderMemberItem,
  renderMembers,
  renderMessage,
  renderNetworkHub,
  renderPreview,
  renderProfile,
  renderUnavailable,
} from "./hub-pages.js";
import { applicationNoteText, buildSignInEmail, isEmail, loginPath, mergeAdminNotes, signInDestination, verifyLinkPath } from "./text.js";
import {
  firstPublishedAt,
  groupIdsForApproval,
  mailerLitePayload,
  normalizeEmail,
  validateContent,
  validateIngest,
  validateProfile,
} from "./validate.js";

const FROM = "hello@waltonleaders.org";
const FROM_NAME = "Walton County Business Leaders";
const MAGIC_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const JSON_LIMIT = 64 * 1024;
const NOTE_LIMIT = 10000;
const NOTE_BODY_LIMIT = 4000;
const DB_MESSAGE = "The member database is not ready. Create the walton-hub D1 database, put its id in wrangler.toml, and apply migrations.";

const CONTENT_COLUMNS = `id, network, type, status, title, slug, body, description, link_url, pinned, image_key, image_alt, image_type, created_at, updated_at, published_at`;

function database(env) {
  if (!env?.DB || typeof env.DB.prepare !== "function") return null;
  return env.DB;
}

function nowIso() {
  return new Date().toISOString();
}

function adminEmails(env) {
  return String(env?.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index) !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1));
    } catch {
      return "";
    }
  }
  return "";
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secretsEqual(left, right) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(left))),
    crypto.subtle.digest("SHA-256", enc.encode(String(right))),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function sessionCookie(token, maxAge) {
  return `wl_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function publicOrigin(request) {
  const url = new URL(request.url);
  if (url.hostname === "waltonleaders.org" || url.hostname === "www.waltonleaders.org") return "https://waltonleaders.org";
  return url.origin;
}

function logError(message, error) {
  console.error(JSON.stringify({ message, error: error instanceof Error ? error.message : String(error) }));
}

async function readLimitedJson(request) {
  if (!request.body) return { error: true };
  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > JSON_LIMIT) {
      await reader.cancel();
      return { error: true };
    }
    chunks.push(value);
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: true };
  }
}

async function rateLimited(db, bucket, limit) {
  const now = Date.now();
  const nowText = new Date(now).toISOString();
  const windowStart = new Date(now - WINDOW_MS).toISOString();
  const existing = await db.prepare("SELECT window_start, count FROM rate_limits WHERE bucket = ?").bind(bucket).first();
  if (!existing || existing.window_start < windowStart) {
    await db.prepare(`INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
      ON CONFLICT(bucket) DO UPDATE SET window_start = excluded.window_start, count = 1`).bind(bucket, nowText).run();
    return false;
  }
  if (existing.count >= limit) return true;
  await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE bucket = ?").bind(bucket).run();
  return false;
}

async function approvedNetworks(db, email) {
  const result = await db.prepare(`SELECT ms.network FROM members m
    JOIN memberships ms ON ms.member_id = m.id
    WHERE m.email = ? AND ms.status = 'approved'
    ORDER BY ms.network`).bind(email).all();
  return (result.results || []).map((row) => row.network);
}

async function loadSession(db, request) {
  const token = readCookie(request, "wl_session");
  if (!token) return null;
  const row = await db.prepare("SELECT email, csrf_token, expires_at, token_hash FROM sessions WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  return { email: row.email, csrf: row.csrf_token, tokenHash: row.token_hash };
}

async function csrfOk(session, form) {
  return secretsEqual(String(form.get("csrf") || ""), session?.csrf || "");
}

async function sendMagicLink(env, email, url) {
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") {
    console.error(JSON.stringify({ message: "email binding missing" }));
    return;
  }
  const message = buildSignInEmail(email, url, FROM, FROM_NAME);
  await env.EMAIL.send(new EmailMessage(message.from, message.to, message.raw));
}

async function addToMailerLite(env, email, name, groups) {
  try {
    const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MAILERLITE_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(mailerLitePayload(email, name, groups)),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(JSON.stringify({ message: "mailerlite failed", status: response.status, detail: text.slice(0, 300) }));
      return { status: "failed", detail: `MailerLite could not be updated (${response.status}).` };
    }
    return {
      status: "added",
      detail: groups.length ? "Added to MailerLite" : "Added to MailerLite. No group id is set, so the welcome automation will not run.",
    };
  } catch (error) {
    logError("mailerlite error", error);
    return { status: "failed", detail: "MailerLite could not be updated." };
  }
}

function parseFields(raw) {
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  } catch {
    return {};
  }
}

function emptyProfile() {
  return { name: "", company: "", role_title: "", phone: "", location: "", website: "", bio: "" };
}

export async function recordBusinessApplication(env, record) {
  const db = database(env);
  if (!db) {
    console.error(JSON.stringify({ message: "hub database is not configured", action: "join" }));
    return { ok: false };
  }
  try {
    const id = crypto.randomUUID();
    const now = nowIso();
    await db.prepare(`INSERT INTO applications
      (id, network, name, email, submitted_at, source_url, fields_json, status, created_at)
      VALUES (?, 'business', ?, ?, ?, 'https://waltonleaders.org/join', ?, 'pending', ?)`).bind(
      id,
      record.name,
      normalizeEmail(record.email),
      now,
      JSON.stringify(record.fields),
      now,
    ).run();
    return { ok: true, id };
  } catch (error) {
    logError("join application was not saved", error);
    return { ok: false };
  }
}

export async function handleHub(request, env, ui) {
  const url = new URL(request.url);
  const path = url.pathname;
  const hubPath = path === "/login/verify" || path === "/logout" || path.startsWith("/admin") || path.startsWith("/hub") || path === "/api/hub/applications" || (path === "/login" && request.method === "POST");
  if (!hubPath) return null;

  const headersOf = (sample) => sample.headers;
  const page = (body, status = 200) => new Response(request.method === "HEAD" ? null : body, { status, headers: headersOf(ui.html("ok")) });
  const json = (data, status) => {
    const headers = new Headers(headersOf(ui.html("ok")));
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { status, headers });
  };
  const redirect = (location, cookie) => {
    const headers = new Headers({ Location: new URL(location, request.url).toString() });
    if (cookie) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 303, headers });
  };
  const unavailable = () => page(renderUnavailable(DB_MESSAGE));

  try {
    const db = database(env);
    if (path === "/api/hub/applications") return await ingest(request, env, db, json);
    if (!db) {
      if (path === "/login" && request.method === "POST") return redirect("/login?notice=unavailable");
      if (request.method === "GET" || request.method === "HEAD") return unavailable();
      return unavailable();
    }
    if (path === "/login" && request.method === "POST") return await requestLink(request, env, db, redirect, ui);
    if (path === "/login/verify" && (request.method === "GET" || request.method === "HEAD")) return await verifyLink(request, url, env, db, redirect);
    if (path === "/logout" && request.method === "POST") return await logout(request, env, db, redirect, page);
    if (path.startsWith("/admin")) return await adminRoutes(request, env, db, url, page, redirect);
    if (path.startsWith("/hub")) return await memberRoutes(request, env, db, url, page, redirect);
    return page(renderMessage({ title: "Not found", message: "That page is not available." }), 404);
  } catch (error) {
    logError("hub request failed", error);
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table|D1_ERROR|database/i.test(message)) return page(renderUnavailable(DB_MESSAGE));
    return ui.text(500, "Something went wrong. Please try again in a moment.");
  }
}

async function ingest(request, env, db, json) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const configured = String(env.HUB_INGEST_KEY || "");
  if (!configured) return json({ ok: false, error: "Hub ingest is not configured" }, 503);
  const provided = request.headers.get("X-Hub-Key") || "";
  if (!(await secretsEqual(provided, configured))) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!db) return json({ ok: false, error: "Hub database is not configured" }, 503);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return json({ ok: false, error: "Invalid input" }, 400);
  const body = await readLimitedJson(request);
  if (body.error) return json({ ok: false, error: "Invalid input" }, 400);
  const parsed = validateIngest(body.value);
  if (parsed.error) return json({ ok: false, error: "Invalid input" }, 400);
  const id = crypto.randomUUID();
  const now = nowIso();
  const item = parsed.value;
  await db.prepare(`INSERT INTO applications
    (id, network, name, email, submitted_at, source_url, fields_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).bind(
    id, item.network, item.name, item.email, item.submitted_at, item.source_url, JSON.stringify(item.fields), now,
  ).run();
  return json({ ok: true, id }, 201);
}

async function requestLink(request, env, db, redirect, ui) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return redirect("/login");
  }
  const email = normalizeEmail(form.get("email"));
  if (!isEmail(email)) return ui.text(400, "Please enter a valid email address.");
  const ip = clientIp(request);
  const emailHit = await rateLimited(db, `email:${email}`, EMAIL_LIMIT);
  const ipHit = await rateLimited(db, `ip:${ip}`, IP_LIMIT);
  if (!emailHit && !ipHit) {
    const approved = await db.prepare(`SELECT 1 AS ok FROM members m
      JOIN memberships ms ON ms.member_id = m.id
      WHERE m.email = ? AND ms.status = 'approved' LIMIT 1`).bind(email).first();
    if (adminEmails(env).includes(email) || approved) {
      const token = randomToken();
      const now = nowIso();
      await db.prepare("DELETE FROM magic_links WHERE email = ? AND used_at IS NULL").bind(email).run();
      await db.prepare(`INSERT INTO magic_links (id, email, token_hash, expires_at, created_at, request_ip)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), email, await sha256(token), new Date(Date.now() + MAGIC_TTL_MS).toISOString(), now, ip.slice(0, 80)).run();
      try {
        await sendMagicLink(env, email, `${publicOrigin(request)}${verifyLinkPath(token, form.get("next"))}`);
      } catch (error) {
        logError("magic link email failed", error);
      }
    }
  } else {
    console.log(JSON.stringify({ message: "magic link rate limited" }));
  }
  return redirect("/login?sent=1");
}

async function verifyLink(request, url, env, db, redirect) {
  const token = url.searchParams.get("token") || "";
  const next = url.searchParams.get("next");
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) return redirect(loginPath({ notice: "invalid", next }));
  const row = await db.prepare("SELECT id, email, expires_at, used_at FROM magic_links WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return redirect(loginPath({ notice: "invalid", next }));
  const update = await db.prepare("UPDATE magic_links SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(nowIso(), row.id).run();
  if (!update.meta || update.meta.changes < 1) return redirect(loginPath({ notice: "invalid", next }));
  const sessionToken = randomToken();
  const csrf = randomToken();
  const now = nowIso();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), await sha256(sessionToken), row.email, csrf, new Date(Date.now() + SESSION_TTL_MS).toISOString(), now).run();
  const destination = signInDestination(adminEmails(env).includes(row.email), next);
  return redirect(destination, sessionCookie(sessionToken, Math.floor(SESSION_TTL_MS / 1000)));
}

async function logout(request, env, db, redirect, page) {
  const session = await loadSession(db, request);
  if (!session) return redirect("/login", sessionCookie("", 0));
  let form;
  try {
    form = await request.formData();
  } catch {
    return page(renderMessage({ title: "Log out", message: "The form expired. Reload the page and try again.", session, admin: false }), 403);
  }
  if (!(await csrfOk(session, form))) {
    return page(renderMessage({ title: "Log out", message: "The form expired. Reload the page and try again.", session, admin: adminEmails(env).includes(session.email) }), 403);
  }
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  return redirect("/", sessionCookie("", 0));
}

async function adminRoutes(request, env, db, url, page, redirect) {
  const session = await loadSession(db, request);
  if (!session) return redirect(loginPath({ next: `${url.pathname}${url.search}` }));
  const admin = adminEmails(env).includes(session.email);
  if (!admin) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: false }), 404);
  const path = url.pathname;
  if (path === "/admin" && (request.method === "GET" || request.method === "HEAD")) return listApplications(env, db, url, session, page);
  const applicationMatch = path.match(/^\/admin\/applications\/([0-9a-f-]{36})(\/approve|\/deny|\/notes)?$/);
  if (applicationMatch) return applicationRoute(request, env, db, session, applicationMatch[1], applicationMatch[2] || "", page, redirect);
  if (path === "/admin/members" && (request.method === "GET" || request.method === "HEAD")) return listMembers(db, session, page);
  const memberMatch = path.match(/^\/admin\/members\/([0-9a-f-]{36})(\/notes)?$/);
  if (memberMatch) return memberRoute(request, db, session, memberMatch[1], memberMatch[2] || "", url, page, redirect);
  if (path === "/admin/content" && (request.method === "GET" || request.method === "HEAD")) return listContent(db, url, session, page);
  if (path === "/admin/content/new" && (request.method === "GET" || request.method === "HEAD")) {
    const network = ["business", "builders", "tourism"].includes(url.searchParams.get("network")) ? url.searchParams.get("network") : "business";
    return page(renderContentEditor({ session, item: { network, type: "post", title: "", slug: "", description: "", link_url: "", body: "", pinned: 0, image_alt: "" } }));
  }
  if (path === "/admin/content" && request.method === "POST") return saveContent(request, db, session, null, page, redirect);
  const contentMatch = path.match(/^\/admin\/content\/([0-9a-f-]{36})(\/preview|\/publish|\/unpublish|\/pin|\/delete|\/image\/remove|\/image)?$/);
  if (contentMatch) return contentRoute(request, env, db, session, contentMatch[1], contentMatch[2] || "", url, page, redirect);
  return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
}

async function listApplications(env, db, url, session, page) {
  const network = ["business", "builders", "tourism"].includes(url.searchParams.get("network")) ? url.searchParams.get("network") : "";
  const status = ["pending", "approved", "denied"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "";
  const result = await db.prepare(`SELECT id, network, name, email, submitted_at, status FROM applications
    WHERE (? = '' OR network = ?) AND (? = '' OR status = ?)
    ORDER BY submitted_at DESC LIMIT 200`).bind(network, network, status, status).all();
  const notes = [];
  if (!String(env.MAILERLITE_API_KEY || "").trim()) notes.push("MailerLite not configured.");
  return page(renderApplications({ session, network, status, rows: result.results || [], mailerNote: notes.join(" ") }));
}

async function applicationRoute(request, env, db, session, id, action, page, redirect) {
  const application = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
  if (!application) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  if (request.method === "POST" && (action === "/approve" || action === "/deny" || action === "/notes")) {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
    if (action === "/notes") return addApplicationNote(db, session, application, form, page, redirect);
    if (action === "/approve") await approveApplication(env, db, application, session.email);
    else await denyApplication(db, application, session.email);
    return redirect(`/admin/applications/${id}`);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const pageUrl = new URL(request.url);
  const parts = [];
  if (pageUrl.searchParams.get("noted") === "1") parts.push("Note saved.");
  if (application.status === "approved" && application.mailerlite_detail) parts.push(application.mailerlite_detail);
  return showApplication(db, session, application, parts.join(" "), "", 200, page);
}

function missingTable(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message);
}

async function showApplication(db, session, application, message, noteDraft, status, page) {
  const loaded = await loadApplicationNotes(db, application.id);
  return page(renderApplicationDetail({
    session,
    application,
    fields: parseFields(application.fields_json),
    notes: loaded.notes,
    message,
    noteDraft,
    notesReady: loaded.ready,
  }), status);
}

async function loadApplicationNotes(db, applicationId) {
  try {
    const result = await db.prepare(
      "SELECT id, author_email, body, created_at FROM application_notes WHERE application_id = ? ORDER BY created_at"
    ).bind(applicationId).all();
    return { notes: result.results || [], ready: true };
  } catch (error) {
    if (missingTable(error)) return { notes: [], ready: false };
    throw error;
  }
}

async function addApplicationNote(db, session, application, form, page, redirect) {
  const loaded = await loadApplicationNotes(db, application.id);
  if (!loaded.ready) return showApplication(db, session, application, "", "", 503, page);
  const body = String(form.get("note") || "").replace(/\r\n/g, "\n").trim();
  if (!body) return showApplication(db, session, application, "Write a note before saving.", "", 400, page);
  if (body.length > NOTE_BODY_LIMIT) return showApplication(db, session, application, "A note can be up to 4,000 characters.", body, 400, page);
  const now = nowIso();
  await db.prepare(`INSERT INTO application_notes (id, application_id, author_email, body, created_at)
    VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), application.id, session.email, body, now).run();
  if (application.status === "approved") {
    const member = await db.prepare("SELECT id FROM members WHERE email = ?").bind(normalizeEmail(application.email)).first();
    if (member) await carryApplicationNotes(db, application, member.id);
  }
  return redirect(`/admin/applications/${application.id}?noted=1`);
}

async function carryApplicationNotes(db, application, memberId) {
  if (!memberId) return;
  let result;
  try {
    result = await db.prepare(`SELECT id, author_email, body, created_at FROM application_notes
      WHERE application_id = ? AND copied_at IS NULL
      ORDER BY created_at`).bind(application.id).all();
  } catch (error) {
    if (missingTable(error)) return;
    throw error;
  }
  const pending = result.results || [];
  if (!pending.length) return;
  const existing = await db.prepare("SELECT body FROM member_admin_notes WHERE member_id = ?").bind(memberId).first();
  const blocks = pending.map((note) => applicationNoteText(note, application.network));
  const merged = mergeAdminNotes(existing?.body || "", blocks, NOTE_LIMIT);
  const now = nowIso();
  if (merged.changed) {
    await db.prepare(`INSERT INTO member_admin_notes (member_id, body, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).bind(memberId, merged.body, now).run();
  }
  for (const index of merged.fitted) {
    await db.prepare("UPDATE application_notes SET copied_at = ? WHERE id = ? AND copied_at IS NULL").bind(now, pending[index].id).run();
  }
}

async function approveApplication(env, db, application, reviewer) {
  const now = nowIso();
  const email = normalizeEmail(application.email);
  const existing = await db.prepare("SELECT id FROM members WHERE email = ?").bind(email).first();
  const memberId = existing?.id || crypto.randomUUID();
  if (!existing) {
    await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(memberId, email, application.name, now, now).run();
  } else {
    await db.prepare("UPDATE members SET name = ?, updated_at = ? WHERE id = ?").bind(application.name, now, memberId).run();
  }
  await db.prepare(`INSERT INTO memberships (member_id, network, role, status, created_at, updated_at)
    VALUES (?, ?, 'member', 'approved', ?, ?)
    ON CONFLICT(member_id, network) DO UPDATE SET status = 'approved', updated_at = excluded.updated_at`).bind(memberId, application.network, now, now).run();
  let status = "not_configured";
  let detail = "MailerLite not configured";
  if (String(env.MAILERLITE_API_KEY || "").trim()) {
    const result = await addToMailerLite(env, email, application.name, groupIdsForApproval(env, application.network));
    status = result.status;
    detail = result.detail;
  }
  await db.prepare(`UPDATE applications SET status = 'approved', reviewed_at = ?, reviewed_by = ?, mailerlite_status = ?, mailerlite_detail = ? WHERE id = ?`).bind(now, reviewer, status, detail, application.id).run();
  await carryApplicationNotes(db, application, memberId);
}

async function denyApplication(db, application, reviewer) {
  const now = nowIso();
  const email = normalizeEmail(application.email);
  await db.prepare("UPDATE applications SET status = 'denied', reviewed_at = ?, reviewed_by = ? WHERE id = ?").bind(now, reviewer, application.id).run();
  const other = await db.prepare("SELECT id FROM applications WHERE email = ? AND network = ? AND status = 'approved' AND id != ? LIMIT 1").bind(email, application.network, application.id).first();
  if (!other) {
    await db.prepare(`UPDATE memberships SET status = 'denied', updated_at = ?
      WHERE network = ? AND member_id = (SELECT id FROM members WHERE email = ?)`).bind(now, application.network, email).run();
  }
}

async function listMembers(db, session, page) {
  const result = await db.prepare(`SELECT m.id, m.email, m.name, COALESCE(p.name, '') AS profile_name, GROUP_CONCAT(ms.network) AS networks
    FROM members m
    JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'approved'
    LEFT JOIN member_profiles p ON p.member_id = m.id
    GROUP BY m.id, m.email, m.name, p.name
    ORDER BY lower(COALESCE(NULLIF(p.name, ''), m.name)), m.email`).all();
  const rows = (result.results || []).map((row) => ({
    id: row.id,
    email: row.email,
    display_name: row.profile_name || row.name || row.email,
    networks: String(row.networks || "").split(",").filter(Boolean).sort(),
  }));
  return page(renderMembers({ session, rows }));
}

async function memberRoute(request, db, session, id, action, url, page, redirect) {
  const member = await loadMember(db, id);
  if (!member) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  if (action === "/notes" && request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
    const notes = String(form.get("notes") || "").replace(/\r\n/g, "\n").trim();
    if (notes.length > NOTE_LIMIT) {
      return page(renderMemberDetail({ ...member, session, message: "Notes are too long.", notes }), 400);
    }
    await db.prepare(`INSERT INTO member_admin_notes (member_id, body, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).bind(id, notes, nowIso()).run();
    return redirect(`/admin/members/${id}?saved=1`);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const noteRow = await db.prepare("SELECT body FROM member_admin_notes WHERE member_id = ?").bind(id).first();
  return page(renderMemberDetail({
    session,
    ...member,
    notes: noteRow?.body || "",
    message: url.searchParams.get("saved") === "1" ? "Notes saved." : "",
  }));
}

async function loadMember(db, id) {
  const row = await db.prepare(`SELECT m.id, m.email, m.name, COALESCE(p.name, '') AS profile_name,
      COALESCE(p.company, '') AS company, COALESCE(p.role_title, '') AS role_title, COALESCE(p.phone, '') AS phone,
      COALESCE(p.location, '') AS location, COALESCE(p.website, '') AS website, COALESCE(p.bio, '') AS bio
    FROM members m
    LEFT JOIN member_profiles p ON p.member_id = m.id
    WHERE m.id = ?`).bind(id).first();
  if (!row) return null;
  const networks = await db.prepare("SELECT network FROM memberships WHERE member_id = ? AND status = 'approved' ORDER BY network").bind(id).all();
  const fields = await db.prepare("SELECT id, label, value FROM member_profile_fields WHERE member_id = ? ORDER BY sort_order, label").bind(id).all();
  const applications = await db.prepare("SELECT id, network, status, submitted_at, fields_json FROM applications WHERE email = ? ORDER BY submitted_at DESC").bind(row.email).all();
  let applicationNotes = { results: [] };
  try {
    applicationNotes = await db.prepare(`SELECT n.id, n.author_email, n.body, n.created_at, a.network
      FROM application_notes n
      JOIN applications a ON a.id = n.application_id
      WHERE a.email = ?
      ORDER BY n.created_at`).bind(row.email).all();
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  return {
    member: {
      id: row.id,
      email: row.email,
      display_name: row.profile_name || row.name || row.email,
      networks: (networks.results || []).map((item) => item.network),
    },
    profile: {
      name: row.profile_name,
      company: row.company,
      role_title: row.role_title,
      phone: row.phone,
      location: row.location,
      website: row.website,
      bio: row.bio,
    },
    fields: fields.results || [],
    applications: (applications.results || []).map((item) => ({ ...item, fields: parseFields(item.fields_json) })),
    applicationNotes: applicationNotes.results || [],
  };
}

async function listContent(db, url, session, page) {
  const network = ["business", "builders", "tourism"].includes(url.searchParams.get("network")) ? url.searchParams.get("network") : "business";
  const status = ["draft", "published"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "";
  const result = await db.prepare(`SELECT id, title, slug, type, status, pinned, created_at, updated_at, published_at
    FROM content_items WHERE network = ? AND (? = '' OR status = ?)
    ORDER BY updated_at DESC LIMIT 200`).bind(network, status, status).all();
  return page(renderContentList({ session, network, status, rows: result.results || [] }));
}

async function contentRoute(request, env, db, session, id, action, url, page, redirect) {
  const item = await db.prepare(`SELECT ${CONTENT_COLUMNS} FROM content_items WHERE id = ?`).bind(id).first();
  if (!item) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  if (action === "/preview" && (request.method === "GET" || request.method === "HEAD")) return page(renderPreview({ session, item }));
  if (request.method === "GET" || request.method === "HEAD") {
    const code = url.searchParams.get("notice");
    const message = code === "saved" ? "Saved." : code === "image" ? "Image saved." : code === "removed" ? "Image removed." : code === "media" ? "Media storage is not configured." : "";
    return page(renderContentEditor({ session, item, message }));
  }
  if (request.method !== "POST") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const form = await request.formData();
  if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
  if (action === "/publish" || action === "/unpublish") return setPublishState(db, item, action === "/publish", redirect);
  if (action === "/pin") {
    await db.prepare("UPDATE content_items SET pinned = ?, updated_at = ? WHERE id = ?").bind(form.get("pinned") === "1" ? 1 : 0, nowIso(), id).run();
    return redirect(`/admin/content/${id}?notice=saved`);
  }
  if (action === "/delete") return deleteContent(env, db, item, redirect);
  if (action === "/image") return uploadImage(env, db, item, form, page, redirect, session);
  if (action === "/image/remove") return removeImage(env, db, item, redirect);
  return saveContent(request, db, session, item, page, redirect, form);
}

async function saveContent(request, db, session, existing, page, redirect, existingForm) {
  const form = existingForm || await request.formData();
  if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
  const parsed = validateContent({
    network: String(form.get("network") || ""),
    type: String(form.get("type") || ""),
    title: String(form.get("title") || ""),
    slug: String(form.get("slug") || ""),
    body: String(form.get("body") || ""),
    description: String(form.get("description") || ""),
    link_url: String(form.get("link_url") || ""),
    pinned: form.get("pinned") === "1",
    image_alt: String(form.get("image_alt") || ""),
  });
  const draft = {
    ...(existing || {}),
    network: String(form.get("network") || existing?.network || "business"),
    type: String(form.get("type") || "post"),
    title: String(form.get("title") || ""),
    slug: String(form.get("slug") || ""),
    body: String(form.get("body") || ""),
    description: String(form.get("description") || ""),
    link_url: String(form.get("link_url") || ""),
    pinned: form.get("pinned") === "1" ? 1 : 0,
    image_alt: String(form.get("image_alt") || ""),
  };
  if (parsed.error) return page(renderContentEditor({ session, item: draft, message: parsed.error }), 400);
  const value = parsed.value;
  const conflict = await db.prepare("SELECT id FROM content_items WHERE network = ? AND slug = ? AND id != ?").bind(value.network, value.slug, existing?.id || "").first();
  if (conflict) return page(renderContentEditor({ session, item: { ...draft, ...value }, message: "That slug is already used on this network." }), 400);
  const now = nowIso();
  if (!existing) {
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO content_items
      (id, network, type, status, title, slug, body, description, link_url, pinned, image_alt, created_at, updated_at, published_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).bind(
      id, value.network, value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, value.image_alt, now, now,
    ).run();
    return redirect(`/admin/content/${id}?notice=saved`);
  }
  await db.prepare(`UPDATE content_items SET type = ?, title = ?, slug = ?, body = ?, description = ?, link_url = ?, pinned = ?, image_alt = ?, updated_at = ?
    WHERE id = ?`).bind(value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, value.image_alt, now, existing.id).run();
  return redirect(`/admin/content/${existing.id}?notice=saved`);
}

async function setPublishState(db, item, publishing, redirect) {
  const now = nowIso();
  const publishedAt = firstPublishedAt(item.published_at, now, publishing);
  await db.prepare("UPDATE content_items SET status = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(publishing ? "published" : "draft", publishedAt, now, item.id).run();
  return redirect(`/admin/content/${item.id}?notice=saved`);
}

async function deleteContent(env, db, item, redirect) {
  if (item.image_key && env.HUB_MEDIA) {
    try {
      await env.HUB_MEDIA.delete(item.image_key);
    } catch (error) {
      logError("image delete failed", error);
    }
  }
  await db.prepare("DELETE FROM content_items WHERE id = ?").bind(item.id).run();
  return redirect(`/admin/content?network=${item.network}`);
}

async function uploadImage(env, db, item, form, page, redirect, session) {
  if (!env.HUB_MEDIA || typeof env.HUB_MEDIA.put !== "function") return redirect(`/admin/content/${item.id}?notice=media`);
  const file = form.get("image");
  const alt = String(form.get("image_alt") || "").replace(/[\r\n]+/g, " ").trim();
  if (!alt || alt.length > 180) return page(renderContentEditor({ session, item, message: "Add an image description of 180 characters or fewer." }), 400);
  if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return page(renderContentEditor({ session, item, message: "Use a JPEG, PNG, or WebP image up to 5 MB." }), 400);
  }
  const stripped = stripImageMetadata(new Uint8Array(await file.arrayBuffer()));
  if (!stripped) return page(renderContentEditor({ session, item, message: "Use a JPEG, PNG, or WebP image up to 5 MB." }), 400);
  const key = `img/${crypto.randomUUID()}`;
  await env.HUB_MEDIA.put(key, stripped.bytes, { httpMetadata: { contentType: stripped.type } });
  await db.prepare("UPDATE content_items SET image_key = ?, image_alt = ?, image_type = ?, image_bytes = ?, updated_at = ? WHERE id = ?").bind(key, alt, stripped.type, stripped.bytes.byteLength, nowIso(), item.id).run();
  if (item.image_key) {
    try {
      await env.HUB_MEDIA.delete(item.image_key);
    } catch (error) {
      logError("old image delete failed", error);
    }
  }
  return redirect(`/admin/content/${item.id}?notice=image`);
}

async function removeImage(env, db, item, redirect) {
  if (item.image_key && env.HUB_MEDIA) {
    try {
      await env.HUB_MEDIA.delete(item.image_key);
    } catch (error) {
      logError("image delete failed", error);
    }
  }
  await db.prepare("UPDATE content_items SET image_key = NULL, image_alt = '', image_type = NULL, image_bytes = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), item.id).run();
  return redirect(`/admin/content/${item.id}?notice=removed`);
}

async function memberRoutes(request, env, db, url, page, redirect) {
  const session = await loadSession(db, request);
  if (!session) return redirect(loginPath({ next: `${url.pathname}${url.search}` }));
  const admin = adminEmails(env).includes(session.email);
  const memberships = await approvedNetworks(db, session.email);
  const path = url.pathname;
  if (path === "/hub" && (request.method === "GET" || request.method === "HEAD")) return page(renderHubHome({ session, admin, memberships }));
  if (path === "/hub/profile") return profileRoute(request, db, session, admin, url, page, redirect);
  const mediaMatch = path.match(/^\/hub\/media\/([0-9a-f-]{36})$/);
  if (mediaMatch && (request.method === "GET" || request.method === "HEAD")) return serveMedia(request, env, db, session, admin, memberships, mediaMatch[1], page);
  const networkMatch = path.match(/^\/hub\/(business|builders|tourism)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
  if (!networkMatch) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  const network = networkMatch[1];
  const slug = networkMatch[2] || "";
  if (!memberships.includes(network)) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 405);
  if (!slug) return networkHome(db, session, admin, network, page);
  const item = await db.prepare(`SELECT ${CONTENT_COLUMNS} FROM content_items WHERE network = ? AND slug = ? AND status = 'published'`).bind(network, slug).first();
  if (!item) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  return page(renderMemberItem({ session, admin, item }));
}

async function networkHome(db, session, admin, network, page) {
  const result = await db.prepare(`SELECT ${CONTENT_COLUMNS} FROM content_items
    WHERE network = ? AND status = 'published'
    ORDER BY pinned DESC, CASE type WHEN 'announcement' THEN 0 ELSE 1 END, COALESCE(published_at, updated_at) DESC`).bind(network).all();
  const items = result.results || [];
  const topIds = new Set();
  const top = [];
  for (const item of items) {
    if (item.pinned || item.type === "announcement") {
      top.push(item);
      topIds.add(item.id);
    }
  }
  return page(renderNetworkHub({
    session,
    admin,
    network,
    top,
    resources: items.filter((item) => item.type === "resource" && !topIds.has(item.id)),
    stories: items.filter((item) => (item.type === "post" || item.type === "page") && !topIds.has(item.id)),
  }));
}

async function profileRoute(request, db, session, admin, url, page, redirect) {
  const member = await db.prepare("SELECT id, email, name FROM members WHERE email = ?").bind(session.email).first();
  if (!member) {
    return page(renderMessage({ title: "Profile", message: "A profile is created when an application is approved.", session, admin }));
  }
  if (request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin }), 403);
    const ids = form.getAll("field_id").map(String);
    const labels = form.getAll("field_label").map(String);
    const values = form.getAll("field_value").map(String);
    const removed = new Set(form.getAll("field_remove").map(String));
    const rows = ids.map((id, index) => ({ id, label: labels[index] || "", value: values[index] || "", remove: removed.has(String(index)) }));
    const parsed = validateProfile({
      name: form.get("name"),
      company: form.get("company"),
      role_title: form.get("role_title"),
      phone: form.get("phone"),
      location: form.get("location"),
      website: form.get("website"),
      bio: form.get("bio"),
    }, rows);
    if (parsed.error) {
      return page(renderProfile({
        session,
        admin,
        profile: {
          name: String(form.get("name") || ""),
          company: String(form.get("company") || ""),
          role_title: String(form.get("role_title") || ""),
          phone: String(form.get("phone") || ""),
          location: String(form.get("location") || ""),
          website: String(form.get("website") || ""),
          bio: String(form.get("bio") || ""),
        },
        fields: rows.filter((row) => row.label || row.value),
        message: parsed.error,
      }), 400);
    }
    const now = nowIso();
    const profile = parsed.value.profile;
    await db.prepare(`INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET
        name = excluded.name, company = excluded.company, role_title = excluded.role_title, phone = excluded.phone,
        location = excluded.location, website = excluded.website, bio = excluded.bio, updated_at = excluded.updated_at`).bind(
      member.id, profile.name, profile.company, profile.role_title, profile.phone, profile.location, profile.website, profile.bio, now,
    ).run();
    await db.prepare("DELETE FROM member_profile_fields WHERE member_id = ?").bind(member.id).run();
    for (let index = 0; index < parsed.value.fields.length; index += 1) {
      const field = parsed.value.fields[index];
      await db.prepare(`INSERT INTO member_profile_fields (id, member_id, label, value, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), member.id, field.label, field.value, index, now, now).run();
    }
    return redirect("/hub/profile?saved=1");
  }
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 405);
  const current = await profileView(db, member);
  return page(renderProfile({
    session,
    admin,
    ...current,
    message: url.searchParams.get("saved") === "1" ? "Profile saved." : "",
  }));
}

async function profileView(db, member) {
  const profile = await db.prepare("SELECT name, company, role_title, phone, location, website, bio FROM member_profiles WHERE member_id = ?").bind(member.id).first();
  const fields = await db.prepare("SELECT id, label, value FROM member_profile_fields WHERE member_id = ? ORDER BY sort_order, label").bind(member.id).all();
  return {
    profile: profile || { ...emptyProfile(), name: member.name || "" },
    fields: fields.results || [],
  };
}

async function serveMedia(request, env, db, session, admin, memberships, id, page) {
  const item = await db.prepare("SELECT id, network, status, image_key, image_type FROM content_items WHERE id = ?").bind(id).first();
  if (!item?.image_key || !env.HUB_MEDIA) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  const allowed = admin || (item.status === "published" && memberships.includes(item.network));
  if (!allowed) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  const object = await env.HUB_MEDIA.get(item.image_key);
  if (!object) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  const headers = new Headers(page("").headers);
  headers.set("Content-Type", item.image_type || "application/octet-stream");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}
