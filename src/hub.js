import { EmailMessage } from "cloudflare:email";
import { stripImageMetadata, MAX_IMAGE_BYTES } from "./images.js";
import {
  renderApplicationDetail,
  renderApplications,
  renderContentEditor,
  renderContentList,
  renderFlagForm,
  renderFlaggedIssue,
  renderFlaggedIssues,
  renderMemberIdeas,
  renderMemberDelete,
  renderMemberDetail,
  renderMemberEdit,
  renderMemberItem,
  renderMembers,
  renderMessage,
  renderNetworkHub,
  renderLogin,
  renderPreview,
  renderProfile,
  renderUnavailable,
  renderWelcome,
} from "./hub-pages.js";
import { scheduleApplicationThankYou } from "./application-email.js";
import {
  IDEA_EMAIL_LIMIT,
  IDEA_IP_LIMIT,
  buildIdeaNotice,
  createMemberIdea,
  listMemberIdeas,
  markIdeaRead,
} from "./ideas.js";
import {
  FLAG_EMAIL_LIMIT,
  FLAG_IP_LIMIT,
  buildFlagNotice,
  createFlaggedIssue,
  listFlaggedIssues,
  listMemberIssues,
  loadFlaggedIssue,
  readIssueFile,
  updateIssueStatus,
} from "./issues.js";
import { approvalSummary, loginNetworkFromUrl, networkById, networkId } from "./networks.js";
import { CLAIMABLE_POINTS, emptyPoints, normalizeReferralCode, POINT_VALUES, pointsBreakdown, randomReferralCode, summarizePoints } from "./points.js";
import { emptyProfile, fillProfileFromApplications, profileHasBlank } from "./profile-prefill.js";
import { applicationNoteText, buildSignInEmail, isEmail, loginPath, mergeAdminNotes, safeReturnPath, signInDestination, verifyLinkPath } from "./text.js";
import {
  approvalNetworks,
  firstPublishedAt,
  groupIdsForApprovals,
  groupIdsForRemovals,
  mailerLitePayload,
  normalizeEmail,
  validateContent,
  validateIngest,
  validateProfile,
} from "./validate.js";

const FROM = "hello@waltonleaders.org";
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

function networkCookie(network, maxAge) {
  return `wl_network=${network || ""}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function readNetworkCookie(request) {
  return networkId(readCookie(request, "wl_network"));
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

async function homeNetwork(db, email, preferred) {
  const result = await db.prepare(`SELECT ms.network FROM members m
    JOIN memberships ms ON ms.member_id = m.id
    WHERE m.email = ? AND ms.status = 'approved'
    ORDER BY ms.created_at ASC, ms.network ASC`).bind(email).all();
  const list = (result.results || []).map((row) => row.network);
  if (preferred && list.includes(preferred)) return preferred;
  return list[0] || "";
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

async function sendMagicLink(env, email, url, network) {
  if (!env.EMAIL || typeof env.EMAIL.send !== "function") {
    console.error(JSON.stringify({ message: "email binding missing" }));
    return;
  }
  const message = buildSignInEmail(email, url, FROM, networkById(network)?.name || "");
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

async function removeFromMailerLite(env, email, groups) {
  if (!String(env?.MAILERLITE_API_KEY || "").trim()) {
    return { status: "not_configured", detail: "MailerLite not configured" };
  }
  const ids = (groups || []).filter(Boolean);
  if (!ids.length) return { status: "skipped", detail: "No MailerLite groups for this member" };
  try {
    const headers = {
      Authorization: `Bearer ${env.MAILERLITE_API_KEY}`,
      Accept: "application/json",
    };
    const lookup = await fetch(`https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(email)}`, { headers });
    if (lookup.status === 404) {
      console.log(JSON.stringify({ message: "mailerlite subscriber not found", email }));
      return { status: "skipped", detail: "MailerLite subscriber was not found" };
    }
    const text = await lookup.text();
    if (!lookup.ok) {
      console.error(JSON.stringify({ message: "mailerlite lookup failed", status: lookup.status, detail: text.slice(0, 300) }));
      return { status: "failed", detail: "MailerLite could not be updated" };
    }
    let subscriberId = "";
    try {
      subscriberId = String(JSON.parse(text)?.data?.id || "");
    } catch {
      subscriberId = "";
    }
    if (!subscriberId) {
      console.error(JSON.stringify({ message: "mailerlite lookup missing id", email }));
      return { status: "failed", detail: "MailerLite could not be updated" };
    }
    let failed = false;
    for (const group of ids) {
      const response = await fetch(
        `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(subscriberId)}/groups/${encodeURIComponent(group)}`,
        { method: "DELETE", headers },
      );
      if (!response.ok && response.status !== 404) {
        failed = true;
        const detail = await response.text();
        console.error(JSON.stringify({ message: "mailerlite group remove failed", status: response.status, group, detail: detail.slice(0, 300) }));
      }
    }
    return failed
      ? { status: "failed", detail: "MailerLite could not be updated" }
      : { status: "removed", detail: "Removed from MailerLite groups" };
  } catch (error) {
    logError("mailerlite error", error);
    return { status: "failed", detail: "MailerLite could not be updated" };
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

export async function recordBusinessApplication(env, record, ctx) {
  const db = database(env);
  if (!db) {
    console.error(JSON.stringify({ message: "hub database is not configured", action: "join" }));
    return { ok: false };
  }
  try {
    const id = crypto.randomUUID();
    const now = nowIso();
    const email = normalizeEmail(record.email);
    const referrer = await lookupReferrer(db, "business", record.ref);
    await insertApplication(db, {
      id,
      network: "business",
      name: record.name,
      email,
      submitted_at: now,
      source_url: "https://waltonleaders.org/join",
      fields: record.fields,
      created_at: now,
      referral_code: referrer.code,
      referrer_member_id: referrer.memberId,
    });
    scheduleApplicationThankYou(ctx, env, { network: "business", name: record.name, email });
    return { ok: true, id };
  } catch (error) {
    logError("join application was not saved", error);
    return { ok: false };
  }
}

export async function handleHub(request, env, ui, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const loginNetwork = loginNetworkFromUrl(url);
  const loginPage = path === "/login" || path === "/login.html" || (loginNetwork && path === `/login/${loginNetwork}`);
  const loginPost = request.method === "POST" && (path === "/login" || Boolean(loginNetwork));
  const loginGet = (request.method === "GET" || request.method === "HEAD") && loginPage;
  const navGet = path === "/api/hub/nav" && (request.method === "GET" || request.method === "HEAD");
  const pointsRoute = path === "/api/hub/points";
  const hubPath = path === "/login/verify" || path === "/logout" || path.startsWith("/admin") || path.startsWith("/hub") || path === "/api/hub/applications" || pointsRoute || loginPost || loginGet || navGet;
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
    const cookies = !cookie ? [] : Array.isArray(cookie) ? cookie : [cookie];
    for (const item of cookies) headers.append("Set-Cookie", item);
    return new Response(null, { status: 303, headers });
  };
  const unavailable = () => page(renderUnavailable(DB_MESSAGE));

  try {
    const db = database(env);
    if (navGet) return await navState(request, db);
    if (path === "/api/hub/applications") return await ingest(request, env, db, json, ctx);
    if (pointsRoute) return await claimPoints(request, db, json);
    if (!db) {
      if (loginGet) return null;
      if (loginPost) return redirect(loginPath({ notice: "unavailable", network: loginNetwork }));
      if (request.method === "GET" || request.method === "HEAD") return unavailable();
      return unavailable();
    }
    if (loginGet) return await showLogin(request, env, db, url, page, redirect);
    if (loginPost) return await requestLink(request, env, db, redirect, ui, loginNetwork);
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

async function ingest(request, env, db, json, ctx) {
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
  const referrer = await lookupReferrer(db, item.network, item.ref);
  await insertApplication(db, {
    id,
    network: item.network,
    name: item.name,
    email: item.email,
    submitted_at: item.submitted_at,
    source_url: item.source_url,
    fields: item.fields,
    created_at: now,
    referral_code: referrer.code,
    referrer_member_id: referrer.memberId,
  });
  scheduleApplicationThankYou(ctx, env, { network: item.network, name: item.name, email: item.email });
  return json({ ok: true, id }, 201);
}

async function navState(request, db) {
  let hub = false;
  if (db && readCookie(request, "wl_session")) {
    hub = Boolean(await loadSession(db, request));
  }
  return new Response(request.method === "HEAD" ? null : JSON.stringify({ hub }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function showLogin(request, env, db, url, page, redirect) {
  const network = loginNetworkFromUrl(url);
  const session = await loadSession(db, request);
  if (session) {
    const memberships = await approvedNetworks(db, session.email);
    const isAdmin = adminEmails(env).includes(session.email);
    if (network) {
      if (memberships.includes(network)) return redirect(`/hub/${network}`);
      if (isAdmin) return redirect("/admin");
    } else if (memberships.length) {
      return redirect("/hub");
    } else if (isAdmin) {
      return redirect("/admin");
    }
  }
  const sent = url.searchParams.get("sent") === "1";
  const unavailable = url.searchParams.get("notice") === "unavailable";
  const invalid = url.searchParams.get("notice") === "invalid";
  const notice = sent
    ? "If that email is approved, a link is on its way."
    : unavailable
      ? "Sign-in is not available yet because the member database is not ready."
      : invalid
        ? "That sign-in link is no longer valid. Request a new one."
        : "";
  return page(renderLogin({
    network,
    notice,
    next: safeReturnPath(url.searchParams.get("next")),
  }));
}

async function requestLink(request, env, db, redirect, ui, network) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return redirect(loginPath({ network }));
  }
  const email = normalizeEmail(form.get("email"));
  if (!isEmail(email)) return ui.text(400, "Please enter a valid email address.");
  if (!network) return redirect("/login");
  const ip = clientIp(request);
  const emailHit = await rateLimited(db, `email:${email}`, EMAIL_LIMIT);
  const ipHit = await rateLimited(db, `ip:${ip}`, IP_LIMIT);
  if (!emailHit && !ipHit) {
    const memberships = await approvedNetworks(db, email);
    if (adminEmails(env).includes(email) || memberships.includes(network)) {
      const token = randomToken();
      const now = nowIso();
      await db.prepare("DELETE FROM magic_links WHERE email = ? AND used_at IS NULL").bind(email).run();
      await db.prepare(`INSERT INTO magic_links (id, email, token_hash, expires_at, created_at, request_ip)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), email, await sha256(token), new Date(Date.now() + MAGIC_TTL_MS).toISOString(), now, ip.slice(0, 80)).run();
      try {
        await sendMagicLink(env, email, `${publicOrigin(request)}${verifyLinkPath(token, form.get("next"), network)}`, network);
      } catch (error) {
        logError("magic link email failed", error);
      }
    }
  } else {
    console.log(JSON.stringify({ message: "magic link rate limited" }));
  }
  return redirect(loginPath({ sent: true, next: form.get("next"), network }));
}

async function recordLoginEvent(db, email, network, createdAt) {
  const slug = networkId(network);
  const address = normalizeEmail(email);
  if (!slug || !address) return;
  try {
    await db.prepare("INSERT INTO login_events (id, email, network, created_at) VALUES (?, ?, ?, ?)").bind(
      crypto.randomUUID(),
      address,
      slug,
      createdAt || nowIso(),
    ).run();
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
}

async function verifyLink(request, url, env, db, redirect) {
  const token = url.searchParams.get("token") || "";
  const next = url.searchParams.get("next");
  const requested = networkId(url.searchParams.get("network"));
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) return redirect(loginPath({ notice: "invalid", next, network: requested }));
  const row = await db.prepare("SELECT id, email, expires_at, used_at FROM magic_links WHERE token_hash = ?").bind(await sha256(token)).first();
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return redirect(loginPath({ notice: "invalid", next, network: requested }));
  const update = await db.prepare("UPDATE magic_links SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(nowIso(), row.id).run();
  if (!update.meta || update.meta.changes < 1) return redirect(loginPath({ notice: "invalid", next, network: requested }));
  const sessionToken = randomToken();
  const csrf = randomToken();
  const now = nowIso();
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), await sha256(sessionToken), row.email, csrf, new Date(Date.now() + SESSION_TTL_MS).toISOString(), now).run();
  await recordLoginEvent(db, row.email, requested, now);
  const memberships = await approvedNetworks(db, row.email);
  const isAdmin = adminEmails(env).includes(row.email);
  const destination = signInDestination(isAdmin, next, requested, memberships);
  const remember = requested && memberships.includes(requested) ? requested : "";
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return redirect(destination, [sessionCookie(sessionToken, maxAge), networkCookie(remember, remember ? maxAge : 0)]);
}

async function logout(request, env, db, redirect, page) {
  const session = await loadSession(db, request);
  const network = readNetworkCookie(request);
  if (!session) return redirect(loginPath({ network }), [sessionCookie("", 0), networkCookie("", 0)]);
  let form;
  try {
    form = await request.formData();
  } catch {
    return page(renderMessage({ title: "Log out", message: "The form expired. Reload the page and try again.", session, admin: false, network }), 403);
  }
  if (!(await csrfOk(session, form))) {
    return page(renderMessage({ title: "Log out", message: "The form expired. Reload the page and try again.", session, admin: adminEmails(env).includes(session.email), network }), 403);
  }
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash).run();
  return redirect(loginPath({ network }), [sessionCookie("", 0), networkCookie("", 0)]);
}

async function adminRoutes(request, env, db, url, page, redirect) {
  const session = await loadSession(db, request);
  if (!session) return redirect(loginPath({ next: `${url.pathname}${url.search}` }));
  const admin = adminEmails(env).includes(session.email);
  if (!admin) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: false }), 404);
  const path = url.pathname;
  if (path === "/admin" && (request.method === "GET" || request.method === "HEAD")) return listApplications(env, db, url, session, page);
  if (path === "/admin/applications/bulk-approve") return bulkApproveApplications(request, env, db, session, page, redirect);
  const applicationMatch = path.match(/^\/admin\/applications\/([0-9a-f-]{36})(\/approve|\/deny|\/notes)?$/);
  if (applicationMatch) return applicationRoute(request, env, db, session, applicationMatch[1], applicationMatch[2] || "", page, redirect);
  if (path === "/admin/issues" && (request.method === "GET" || request.method === "HEAD")) return listFlagPage(db, session, page);
  if (path === "/admin/ideas" && (request.method === "GET" || request.method === "HEAD")) return listIdeasPage(db, session, url, page);
  const ideaAdminMatch = path.match(/^\/admin\/ideas\/([0-9a-f-]{36})\/read$/);
  if (ideaAdminMatch) return markIdeaRoute(request, db, session, ideaAdminMatch[1], page, redirect);
  const issueMatch = path.match(/^\/admin\/issues\/([0-9a-f-]{36})(\/status|\/files\/([0-9a-f-]{36}))?$/);
  if (issueMatch) return issueAdminRoute(request, env, db, session, issueMatch[1], issueMatch[2] || "", issueMatch[3] || "", url, page, redirect);
  if (path === "/admin/members" && (request.method === "GET" || request.method === "HEAD")) return listMembers(db, session, page, url);
  const memberMatch = path.match(/^\/admin\/members\/([0-9a-f-]{36})(\/notes|\/edit|\/delete)?$/);
  if (memberMatch) return memberRoute(request, env, db, session, memberMatch[1], memberMatch[2] || "", url, page, redirect);
  if (path === "/admin/content" && (request.method === "GET" || request.method === "HEAD")) return listContent(db, url, session, page);
  if (path === "/admin/content/new" && (request.method === "GET" || request.method === "HEAD")) {
    const network = ["business", "builders", "tourism"].includes(url.searchParams.get("network")) ? url.searchParams.get("network") : "business";
    return page(renderContentEditor({ session, item: { network, type: "post", title: "", slug: "", description: "", link_url: "", body: "", pinned: 0, image_alt: "" } }));
  }
  if (path === "/admin/content" && request.method === "POST") return saveContent(request, env, db, session, null, page, redirect);
  const contentMatch = path.match(/^\/admin\/content\/([0-9a-f-]{36})(\/preview|\/publish|\/unpublish|\/pin|\/delete|\/image\/remove|\/image)?$/);
  if (contentMatch) return contentRoute(request, env, db, session, contentMatch[1], contentMatch[2] || "", url, page, redirect);
  return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
}

async function listApplications(env, db, url, session, page) {
  const network = ["business", "builders", "tourism"].includes(url.searchParams.get("network")) ? url.searchParams.get("network") : "";
  const status = ["pending", "approved", "denied"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "";
  const result = await db.prepare(`SELECT a.id, a.network, a.name, a.email, a.submitted_at, a.status,
      (
        SELECT GROUP_CONCAT(ms.network, ',')
        FROM members m
        JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'approved'
        WHERE lower(m.email) = lower(a.email)
      ) AS member_networks
    FROM applications a
    WHERE (? = '' OR a.network = ?) AND (? = '' OR a.status = ?)
    ORDER BY a.submitted_at DESC LIMIT 200`).bind(network, network, status, status).all();
  const rows = (result.results || []).map((row) => ({
    ...row,
    member_networks: String(row.member_networks || "").split(",").map((item) => item.trim()).filter(Boolean),
  }));
  const notes = [];
  if (!String(env.MAILERLITE_API_KEY || "").trim()) notes.push("MailerLite not configured.");
  const message = String(url.searchParams.get("notice") || "").trim().slice(0, 2000);
  return page(renderApplications({ session, network, status, rows, mailerNote: notes.join(" "), message }));
}

async function listIdeasPage(db, session, url, page) {
  try {
    const rows = await listMemberIdeas(db);
    const message = url.searchParams.get("read") === "1" ? "Marked read." : "";
    return page(renderMemberIdeas({ session, rows, message }));
  } catch (error) {
    if (!missingTable(error)) throw error;
    return page(renderMessage({ title: "Ideas", message: "Ideas need the latest database migration before they can be listed.", session, admin: true }), 503);
  }
}

async function markIdeaRoute(request, db, session, id, page, redirect) {
  if (request.method !== "POST") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const form = await request.formData();
  if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
  let result;
  try {
    result = await markIdeaRead(db, id);
  } catch (error) {
    if (!missingTable(error)) throw error;
    return page(renderMessage({ title: "Ideas", message: "Ideas need the latest database migration before they can be updated.", session, admin: true }), 503);
  }
  if (!result.ok) return page(renderMessage({ title: "Not found", message: result.error, session, admin: true }), 404);
  return redirect("/admin/ideas?read=1");
}

async function listFlagPage(db, session, page) {
  try {
    const rows = await listFlaggedIssues(db);
    return page(renderFlaggedIssues({ session, rows }));
  } catch (error) {
    if (!missingTable(error)) throw error;
    return page(renderMessage({ title: "Flagged issues", message: "Flagged issues need the latest database migration before they can be listed.", session, admin: true }), 503);
  }
}

async function issueAdminRoute(request, env, db, session, id, action, fileId, url, page, redirect) {
  if (action.startsWith("/files/") && (request.method === "GET" || request.method === "HEAD")) {
    return downloadIssueFile(request, env, db, session, id, fileId, page);
  }
  let loaded;
  try {
    loaded = await loadFlaggedIssue(db, id);
  } catch (error) {
    if (!missingTable(error)) throw error;
    return page(renderMessage({ title: "Flagged issues", message: "Flagged issues need the latest database migration before they can be opened.", session, admin: true }), 503);
  }
  if (!loaded) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  if (action === "/status" && request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
    const result = await updateIssueStatus(db, id, String(form.get("status") || ""), nowIso());
    if (!result.ok) return page(renderFlaggedIssue({ session, ...loaded, message: result.error }), 400);
    return redirect(`/admin/issues/${id}?saved=1`);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const message = url.searchParams.get("saved") === "1" ? "Status saved." : "";
  return page(renderFlaggedIssue({ session, ...loaded, message }));
}

async function downloadIssueFile(request, env, db, session, issueId, fileId, page) {
  let file;
  try {
    file = await readIssueFile(db, env.HUB_MEDIA, issueId, fileId);
  } catch (error) {
    if (!missingTable(error)) throw error;
    return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  }
  if (!file) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  const headers = new Headers(page("").headers);
  headers.set("Content-Type", file.contentType || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${file.filename.replace(/"/g, "")}"`);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : file.body, { headers });
}

async function applicationRoute(request, env, db, session, id, action, page, redirect) {
  const application = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
  if (!application) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  if (request.method === "POST" && (action === "/approve" || action === "/deny" || action === "/notes")) {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
    if (action === "/notes") return addApplicationNote(db, session, application, form, page, redirect);
    if (action === "/approve") await approveApplication(env, db, application, session.email, form);
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

function missingColumn(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such column|no column named/i.test(message);
}

function uniqueConflict(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

async function lookupReferrer(db, network, ref) {
  const code = normalizeReferralCode(ref);
  if (!code) return { code: "", memberId: "" };
  try {
    const row = await db.prepare("SELECT member_id, network, code FROM referral_codes WHERE code = ? COLLATE NOCASE").bind(code).first();
    if (!row || row.network !== network) return { code: "", memberId: "" };
    return { code: String(row.code || code).toLowerCase(), memberId: row.member_id || "" };
  } catch (error) {
    if (missingTable(error)) return { code: "", memberId: "" };
    throw error;
  }
}

async function insertApplication(db, item) {
  const fieldsJson = JSON.stringify(item.fields || {});
  const referralCode = item.referral_code || "";
  const referrerId = item.referrer_member_id || "";
  try {
    await db.prepare(`INSERT INTO applications
      (id, network, name, email, submitted_at, source_url, fields_json, status, created_at, referral_code, referrer_member_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).bind(
      item.id,
      item.network,
      item.name,
      item.email,
      item.submitted_at,
      item.source_url,
      fieldsJson,
      item.created_at,
      referralCode,
      referrerId,
    ).run();
  } catch (error) {
    if (!missingColumn(error)) throw error;
    await db.prepare(`INSERT INTO applications
      (id, network, name, email, submitted_at, source_url, fields_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).bind(
      item.id,
      item.network,
      item.name,
      item.email,
      item.submitted_at,
      item.source_url,
      fieldsJson,
      item.created_at,
    ).run();
  }
}

async function ensureReferralCode(db, memberId, network) {
  if (!memberId || !networkId(network)) return "";
  try {
    const existing = await db.prepare("SELECT code FROM referral_codes WHERE member_id = ? AND network = ?").bind(memberId, network).first();
    if (existing?.code) return existing.code;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomReferralCode();
      try {
        await db.prepare("INSERT INTO referral_codes (member_id, network, code, created_at) VALUES (?, ?, ?, ?)").bind(memberId, network, code, nowIso()).run();
        return code;
      } catch (error) {
        if (!uniqueConflict(error)) throw error;
        const winner = await db.prepare("SELECT code FROM referral_codes WHERE member_id = ? AND network = ?").bind(memberId, network).first();
        if (winner?.code) return winner.code;
      }
    }
    const finalCode = await db.prepare("SELECT code FROM referral_codes WHERE member_id = ? AND network = ?").bind(memberId, network).first();
    return finalCode?.code || "";
  } catch (error) {
    if (missingTable(error)) return "";
    throw error;
  }
}

async function awardPoints(db, { memberId, kind, network = "", points, subject = "" }) {
  if (!memberId || !points) return { awarded: false, ready: false };
  try {
    await db.prepare(`INSERT INTO points_events (id, member_id, kind, network, points, subject, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), memberId, kind, network, points, subject, nowIso()).run();
    return { awarded: true, already: false, ready: true };
  } catch (error) {
    if (uniqueConflict(error)) return { awarded: false, already: true, ready: true };
    if (missingTable(error)) return { awarded: false, already: false, ready: false };
    throw error;
  }
}

async function awardWelcomePoints(db, memberId) {
  return awardPoints(db, { memberId, kind: "welcome", network: "", points: POINT_VALUES.welcome, subject: "" });
}

async function awardReferralPoints(db, application, applicantMemberId) {
  const referrerId = String(application?.referrer_member_id || "").trim();
  const email = normalizeEmail(application?.email);
  if (!referrerId || !email) return { awarded: false };
  if (referrerId === applicantMemberId) return { awarded: false };
  const referrer = await db.prepare("SELECT id, email FROM members WHERE id = ?").bind(referrerId).first();
  if (!referrer) return { awarded: false };
  if (normalizeEmail(referrer.email) === email) return { awarded: false };
  return awardPoints(db, {
    memberId: referrer.id,
    kind: "referral",
    network: "",
    points: POINT_VALUES.referral,
    subject: email,
  });
}

async function pointsForMember(db, memberId, network) {
  if (!memberId) return emptyPoints();
  try {
    const result = await db.prepare("SELECT kind, network, points FROM points_events WHERE member_id = ?").bind(memberId).all();
    return summarizePoints(result.results || [], network);
  } catch (error) {
    if (missingTable(error)) return emptyPoints();
    throw error;
  }
}

async function pointsTotals(db) {
  const totals = new Map();
  try {
    const result = await db.prepare("SELECT member_id, SUM(points) AS points_total FROM points_events GROUP BY member_id").bind().all();
    for (const row of result.results || []) totals.set(row.member_id, Number(row.points_total) || 0);
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  return totals;
}

async function referrerLabel(db, memberId) {
  const id = String(memberId || "").trim();
  if (!id) return "";
  const row = await db.prepare(`SELECT m.name, m.email, COALESCE(p.name, '') AS profile_name
    FROM members m
    LEFT JOIN member_profiles p ON p.member_id = m.id
    WHERE m.id = ?`).bind(id).first();
  if (!row) return "";
  return String(row.profile_name || "").trim() || String(row.name || "").trim() || String(row.email || "");
}

async function claimPoints(request, db, json) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!db) return json({ ok: false, error: "Hub database is not configured" }, 503);
  const session = await loadSession(db, request);
  if (!session) return json({ ok: false, error: "Unauthorized" }, 401);
  const contentType = request.headers.get("Content-Type") || "";
  let kind = "";
  let network = "";
  let csrf = "";
  if (contentType.toLowerCase().includes("application/json")) {
    const body = await readLimitedJson(request);
    if (body.error || !body.value || typeof body.value !== "object") return json({ ok: false, error: "Invalid input" }, 400);
    kind = body.value.kind;
    network = body.value.network;
    csrf = body.value.csrf;
  } else {
    const form = await request.formData();
    kind = form.get("kind");
    network = form.get("network");
    csrf = form.get("csrf");
  }
  if (!(await secretsEqual(String(csrf || ""), session.csrf || ""))) return json({ ok: false, error: "Forbidden" }, 403);
  const id = networkId(network);
  if (!CLAIMABLE_POINTS.includes(kind) || !id) return json({ ok: false, error: "Invalid input" }, 400);
  const member = await db.prepare("SELECT id FROM members WHERE email = ?").bind(session.email).first();
  if (!member) return json({ ok: false, error: "Forbidden" }, 403);
  const memberships = await approvedNetworks(db, session.email);
  if (!memberships.includes(id)) return json({ ok: false, error: "Forbidden" }, 403);
  const eventNetwork = kind === "install" ? "" : id;
  const result = await awardPoints(db, {
    memberId: member.id,
    kind,
    network: eventNetwork,
    points: POINT_VALUES[kind],
    subject: "",
  });
  if (result.ready === false) return json({ ok: false, error: "Points are not ready" }, 503);
  const summary = await pointsForMember(db, member.id, id);
  return json({
    ok: true,
    awarded: Boolean(result.awarded),
    already: Boolean(result.already),
    total: summary.total,
    breakdownText: pointsBreakdown(summary),
    breakdown: {
      welcome: summary.welcome,
      referral: summary.referral,
      install: summary.install,
      facebook: summary.facebook,
      linkedin: summary.linkedin,
    },
  });
}

async function showApplication(db, session, application, message, noteDraft, status, page) {
  const loaded = await loadApplicationNotes(db, application.id);
  const memberNetworks = await approvedMemberships(db, normalizeEmail(application.email));
  const logins = await loginStatsForEmail(db, application.email);
  const referrerName = await referrerLabel(db, application.referrer_member_id);
  return page(renderApplicationDetail({
    session,
    application,
    fields: parseFields(application.fields_json),
    notes: loaded.notes,
    message,
    noteDraft,
    notesReady: loaded.ready,
    memberNetworks,
    logins,
    referrerName,
  }), status);
}

async function approvedMemberships(db, email) {
  const result = await db.prepare(`SELECT ms.network FROM members m
    JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'approved'
    WHERE m.email = ?
    ORDER BY ms.network`).bind(email).all();
  return (result.results || []).map((row) => row.network);
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

const APPLICATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function selectedApplicationIds(form) {
  const ids = [];
  const seen = new Set();
  for (const value of form.getAll("ids")) {
    const id = String(value || "").trim();
    const key = id.toLowerCase();
    if (!APPLICATION_ID.test(key) || seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
    if (ids.length >= 200) break;
  }
  return ids;
}

function applicantLabel(application) {
  const name = String(application?.name || "").replace(/[\r\n]+/g, " ").trim();
  if (name) return name;
  const email = String(application?.email || "").replace(/[\r\n]+/g, " ").trim();
  return email || "Unknown applicant";
}

function bulkApproveNotice({ approved, skipped, failed }) {
  const parts = [`Approved ${approved}.`];
  if (skipped) parts.push(`${skipped} skipped (already handled).`);
  if (failed.length) parts.push(`Failed: ${failed.join(", ")}.`);
  return parts.join(" ");
}

function applicationsReturn({ network = "", status = "", notice = "" } = {}) {
  const params = new URLSearchParams();
  if (network) params.set("network", network);
  if (status) params.set("status", status);
  if (notice) params.set("notice", notice);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

function postedFilter(form, name, allowed) {
  const value = String(form.get(name) || "");
  return allowed.includes(value) ? value : "";
}

async function bulkApproveApplications(request, env, db, session, page, redirect) {
  if (request.method !== "POST") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const form = await request.formData();
  if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
  const network = postedFilter(form, "network", ["business", "builders", "tourism"]);
  const status = postedFilter(form, "status", ["pending", "approved", "denied"]);
  const ids = selectedApplicationIds(form);
  if (!ids.length) return redirect(applicationsReturn({ network, status, notice: "Select at least one application." }));
  let approved = 0;
  let skipped = 0;
  const failed = [];
  for (const id of ids) {
    const application = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first();
    if (!application || application.status !== "pending") {
      skipped += 1;
      continue;
    }
    try {
      await approvePendingApplication(env, db, application, session.email);
      approved += 1;
    } catch (error) {
      logError("bulk approve failed", error);
      failed.push(applicantLabel(application));
    }
  }
  return redirect(applicationsReturn({ network, status, notice: bulkApproveNotice({ approved, skipped, failed }) }));
}

async function approveApplication(env, db, application, reviewer, form) {
  const networks = approvalNetworks(application.network, form ? form.getAll("networks") : []);
  await applyApplicationApproval(env, db, application, reviewer, networks);
}

// Same result as Approve on the application page with its boxes left as shown.
async function approvePendingApplication(env, db, application, reviewer) {
  const before = await approvedMemberships(db, normalizeEmail(application.email));
  const networks = approvalNetworks(application.network, [application.network, ...before]);
  await applyApplicationApproval(env, db, application, reviewer, networks);
}

async function applyApplicationApproval(env, db, application, reviewer, networks) {
  const now = nowIso();
  const email = normalizeEmail(application.email);
  const summary = approvalSummary(networks);
  const before = await approvedMemberships(db, email);
  const added = networks.filter((network) => !before.includes(network));
  const removed = before.filter((network) => !networks.includes(network));
  const existing = await db.prepare("SELECT id FROM members WHERE email = ?").bind(email).first();
  const memberId = existing?.id || crypto.randomUUID();
  if (!existing) {
    await db.prepare("INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(memberId, email, application.name, now, now).run();
  } else {
    await db.prepare("UPDATE members SET name = ?, updated_at = ? WHERE id = ?").bind(application.name, now, memberId).run();
  }
  for (const network of networks) {
    await db.prepare(`INSERT INTO memberships (member_id, network, role, status, created_at, updated_at)
      VALUES (?, ?, 'member', 'approved', ?, ?)
      ON CONFLICT(member_id, network) DO UPDATE SET status = 'approved', updated_at = excluded.updated_at`).bind(memberId, network, now, now).run();
  }
  for (const network of removed) {
    await db.prepare("UPDATE memberships SET status = 'denied', updated_at = ? WHERE member_id = ? AND network = ?").bind(now, memberId, network).run();
  }
  const existingProfile = await db.prepare("SELECT name, company, role_title, phone, location, website, bio FROM member_profiles WHERE member_id = ?").bind(memberId).first();
  await fillProfileFromApplications(db, memberId, existingProfile, [application], now);
  const firstApproval = application.status !== "approved";
  const changed = added.length > 0 || removed.length > 0;
  let mailerStatus = application.mailerlite_status || "";
  let mailerDetail = "";
  if (changed && String(env.MAILERLITE_API_KEY || "").trim()) {
    const details = [];
    mailerStatus = "skipped";
    if (added.length) {
      const result = await addToMailerLite(env, email, application.name, groupIdsForApprovals(env, added));
      mailerStatus = result.status;
      if (result.detail) details.push(result.detail);
    }
    if (removed.length) {
      const result = await removeFromMailerLite(env, email, groupIdsForRemovals(env, removed));
      if (result.status === "failed") mailerStatus = "failed";
      else if (!added.length) mailerStatus = result.status;
      if (result.detail) details.push(result.detail);
    }
    mailerDetail = details.join(" ");
  } else if (changed) {
    mailerStatus = "not_configured";
    mailerDetail = "MailerLite not configured";
  }
  const review = [];
  if (added.length) review.push(`Memberships added: ${approvalSummary(added)}.`);
  if (removed.length) review.push(`Memberships removed: ${approvalSummary(removed)}.`);
  if (mailerDetail) review.push(mailerDetail);
  const reviewLine = review.join(" ");
  if (firstApproval || changed) {
    await db.prepare(`UPDATE applications SET status = 'approved', reviewed_at = ?, reviewed_by = ?, mailerlite_status = ?, mailerlite_detail = ? WHERE id = ?`).bind(now, reviewer, mailerStatus, reviewLine, application.id).run();
  }
  let noteBody = "";
  if (firstApproval) {
    noteBody = `Approved for ${summary}.`;
    if (removed.length) noteBody += ` Memberships removed: ${approvalSummary(removed)}.`;
  } else if (changed) {
    const parts = [];
    if (added.length) parts.push(`Memberships added: ${approvalSummary(added)}.`);
    if (removed.length) parts.push(`Memberships removed: ${approvalSummary(removed)}.`);
    noteBody = parts.join(" ");
  }
  if (noteBody) {
    try {
      await db.prepare(`INSERT INTO application_notes (id, application_id, author_email, body, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), application.id, reviewer, noteBody, now).run();
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
  }
  await carryApplicationNotes(db, application, memberId);
  await awardWelcomePoints(db, memberId);
  if (firstApproval) await awardReferralPoints(db, application, memberId);
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

function removedMemberMessage(url) {
  const email = normalizeEmail(url.searchParams.get("removed"));
  if (!isEmail(email)) return "";
  const mailer = url.searchParams.get("mailer");
  const mailerLine = mailer === "removed"
    ? " MailerLite groups were updated."
    : mailer === "failed"
      ? " MailerLite could not be updated."
      : mailer === "skipped"
        ? " No MailerLite subscriber was found."
        : mailer === "not_configured"
          ? " MailerLite is not configured."
          : "";
  return `Removed ${email}. Profile, memberships, sign-in sessions, flagged issues, and ideas were deleted. Applications were kept and marked denied so they no longer grant membership.${mailerLine}`;
}

async function loginStatsForEmail(db, email) {
  const empty = { login_count: 0, last_login_at: "" };
  const address = normalizeEmail(email);
  if (!address) return empty;
  try {
    const row = await db.prepare("SELECT COUNT(*) AS login_count, MAX(created_at) AS last_login_at FROM login_events WHERE email = ?").bind(address).first();
    return {
      login_count: Number(row?.login_count) || 0,
      last_login_at: row?.last_login_at || "",
    };
  } catch (error) {
    if (missingTable(error)) return empty;
    throw error;
  }
}

async function loadMemberRows(db, withLogins) {
  const loginSelect = withLogins
    ? "COALESCE(logins.login_count, 0) AS login_count, logins.last_login_at AS last_login_at"
    : "0 AS login_count, NULL AS last_login_at";
  const loginJoin = withLogins
    ? `LEFT JOIN (
        SELECT lower(email) AS email, COUNT(*) AS login_count, MAX(created_at) AS last_login_at
        FROM login_events
        GROUP BY email COLLATE NOCASE
      ) logins ON logins.email = m.email`
    : "";
  const loginGroup = withLogins ? ", logins.login_count, logins.last_login_at" : "";
  const result = await db.prepare(`SELECT m.id, m.email, m.name, COALESCE(p.name, '') AS profile_name,
      GROUP_CONCAT(ms.network) AS networks, ${loginSelect}
    FROM members m
    JOIN memberships ms ON ms.member_id = m.id AND ms.status = 'approved'
    LEFT JOIN member_profiles p ON p.member_id = m.id
    ${loginJoin}
    GROUP BY m.id, m.email, m.name, p.name${loginGroup}`).bind().all();
  return (result.results || []).map((row) => ({
    id: row.id,
    email: row.email,
    display_name: row.profile_name || row.name || row.email,
    networks: String(row.networks || "").split(",").filter(Boolean).sort(),
    login_count: Number(row.login_count) || 0,
    last_login_at: row.last_login_at || "",
  }));
}

function sortMemberRows(rows, sort) {
  const nameOf = (row) => String(row.display_name || row.email || "").toLowerCase();
  return [...rows].sort((a, b) => {
    if (sort === "logins") {
      const byCount = (Number(b.login_count) || 0) - (Number(a.login_count) || 0);
      if (byCount) return byCount;
    } else if (sort === "last") {
      const aTime = a.last_login_at || "";
      const bTime = b.last_login_at || "";
      if (aTime !== bTime) {
        if (!aTime) return 1;
        if (!bTime) return -1;
        return aTime < bTime ? 1 : -1;
      }
    }
    const byName = nameOf(a).localeCompare(nameOf(b));
    if (byName) return byName;
    return String(a.email || "").localeCompare(String(b.email || ""));
  });
}

async function listMembers(db, session, page, url) {
  const requested = String(url?.searchParams?.get("sort") || "");
  const sort = requested === "logins" || requested === "last" ? requested : "name";
  let rows;
  try {
    rows = await loadMemberRows(db, true);
  } catch (error) {
    if (!missingTable(error)) throw error;
    rows = await loadMemberRows(db, false);
  }
  const totals = await pointsTotals(db);
  const withPoints = sortMemberRows(rows, sort).map((row) => ({ ...row, points: totals.get(row.id) || 0 }));
  return page(renderMembers({
    session,
    rows: withPoints,
    sort,
    message: url ? removedMemberMessage(url) : "",
  }));
}

function profileFormInput(form) {
  return {
    name: form.get("name"),
    company: form.get("company"),
    role_title: form.get("role_title"),
    phone: form.get("phone"),
    location: form.get("location"),
    website: form.get("website"),
    bio: form.get("bio"),
  };
}

function profileFormRows(form) {
  const ids = form.getAll("field_id").map(String);
  const labels = form.getAll("field_label").map(String);
  const values = form.getAll("field_value").map(String);
  const removed = new Set(form.getAll("field_remove").map(String));
  return ids.map((fieldId, index) => ({
    id: fieldId,
    label: labels[index] || "",
    value: values[index] || "",
    remove: removed.has(String(index)),
  }));
}

function profileDraft(form, rows) {
  return {
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
  };
}

async function saveMemberProfile(db, memberId, profile, fields) {
  const now = nowIso();
  await db.prepare(`INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(member_id) DO UPDATE SET
      name = excluded.name, company = excluded.company, role_title = excluded.role_title, phone = excluded.phone,
      location = excluded.location, website = excluded.website, bio = excluded.bio, updated_at = excluded.updated_at`).bind(
    memberId, profile.name, profile.company, profile.role_title, profile.phone, profile.location, profile.website, profile.bio, now,
  ).run();
  await db.prepare("DELETE FROM member_profile_fields WHERE member_id = ?").bind(memberId).run();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    await db.prepare(`INSERT INTO member_profile_fields (id, member_id, label, value, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), memberId, field.label, field.value, index, now, now).run();
  }
}

async function memberRoute(request, env, db, session, id, action, url, page, redirect) {
  const member = await loadMember(db, id);
  if (!member) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  if (action === "/notes" && request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
    const notes = String(form.get("notes") || "").replace(/\r\n/g, "\n").trim();
    if (notes.length > NOTE_LIMIT) {
      const logins = await loginStatsForEmail(db, member.member.email);
      const points = await pointsForMember(db, member.member.id, "");
      return page(renderMemberDetail({ ...member, session, message: "Notes are too long.", notes, logins, points }), 400);
    }
    await db.prepare(`INSERT INTO member_admin_notes (member_id, body, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`).bind(id, notes, nowIso()).run();
    return redirect(`/admin/members/${id}?saved=1`);
  }
  if (action === "/edit") return editMember(request, db, session, member, page, redirect);
  if (action === "/delete") return deleteMember(request, env, db, session, member, page, redirect);
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const noteRow = await db.prepare("SELECT body FROM member_admin_notes WHERE member_id = ?").bind(id).first();
  const saved = url.searchParams.get("saved");
  const message = saved === "1" ? "Notes saved." : saved === "profile" ? "Profile saved." : "";
  const logins = await loginStatsForEmail(db, member.member.email);
  const points = await pointsForMember(db, member.member.id, "");
  return page(renderMemberDetail({
    session,
    ...member,
    points,
    notes: noteRow?.body || "",
    message,
    logins,
  }));
}

async function editMember(request, db, session, member, page, redirect) {
  if (request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
    const rows = profileFormRows(form);
    const parsed = validateProfile(profileFormInput(form), rows);
    if (parsed.error) {
      const draft = profileDraft(form, rows);
      return page(renderMemberEdit({ session, member: member.member, ...draft, message: parsed.error }), 400);
    }
    await saveMemberProfile(db, member.member.id, parsed.value.profile, parsed.value.fields);
    return redirect(`/admin/members/${member.member.id}?saved=profile`);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  return page(renderMemberEdit({ session, member: member.member, profile: member.profile, fields: member.fields }));
}

function ownAdminAccount(env, session, member) {
  const email = normalizeEmail(member?.email);
  return Boolean(email) && email === normalizeEmail(session?.email) && adminEmails(env).includes(email);
}

async function deleteMember(request, env, db, session, loaded, page, redirect) {
  const member = loaded.member;
  if (ownAdminAccount(env, session, member)) {
    return page(renderMessage({ title: "Delete member", message: "You cannot remove your own admin account.", session, admin: true }), 403);
  }
  if (request.method === "GET" || request.method === "HEAD") {
    return page(renderMemberDelete({ session, member }));
  }
  if (request.method !== "POST") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 405);
  const form = await request.formData();
  if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin: true }), 403);
  const typed = normalizeEmail(form.get("confirm_email"));
  if (typed !== normalizeEmail(member.email)) {
    return page(renderMemberDelete({ session, member, message: "Type the email address to confirm." }), 400);
  }
  const outcome = await removeMemberAccount(env, db, session, loaded);
  const params = new URLSearchParams({ removed: member.email, mailer: outcome.mailer });
  return redirect(`/admin/members?${params.toString()}`);
}

async function memberNetworkIds(db, memberId, email) {
  const memberships = await db.prepare("SELECT network FROM memberships WHERE member_id = ?").bind(memberId).all();
  const applications = await db.prepare("SELECT network FROM applications WHERE email = ?").bind(email).all();
  const ids = new Set();
  for (const row of [...(memberships.results || []), ...(applications.results || [])]) {
    if (row.network) ids.add(row.network);
  }
  return [...ids];
}

async function issueFileKeys(db, memberId) {
  try {
    const issues = await db.prepare("SELECT id FROM flagged_issues WHERE member_id = ?").bind(memberId).all();
    const keys = [];
    for (const issue of issues.results || []) {
      const files = await db.prepare("SELECT storage_key FROM flagged_issue_files WHERE issue_id = ?").bind(issue.id).all();
      for (const file of files.results || []) {
        if (file.storage_key) keys.push(file.storage_key);
      }
      await db.prepare("DELETE FROM flagged_issue_files WHERE issue_id = ?").bind(issue.id).run();
      await db.prepare("DELETE FROM flagged_issues WHERE id = ?").bind(issue.id).run();
    }
    return keys;
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
}

async function removeMemberAccount(env, db, session, loaded) {
  const member = loaded.member;
  const email = normalizeEmail(member.email);
  const now = nowIso();
  const networks = await memberNetworkIds(db, member.id, email);
  let mailer = { status: "skipped", detail: "No MailerLite groups for this member" };
  try {
    mailer = await removeFromMailerLite(env, email, groupIdsForApprovals(env, networks));
  } catch (error) {
    logError("mailerlite error", error);
    mailer = { status: "failed", detail: "MailerLite could not be updated" };
  }
  const keys = await issueFileKeys(db, member.id);
  const approved = await db.prepare("SELECT id FROM applications WHERE email = ? AND status = 'approved'").bind(email).all();
  await db.prepare("UPDATE applications SET status = 'denied' WHERE email = ? AND status = 'approved'").bind(email).run();
  try {
    for (const application of approved.results || []) {
      await db.prepare(`INSERT INTO application_notes (id, application_id, author_email, body, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(),
        application.id,
        session.email,
        "Member account removed. This application no longer grants membership, so the person can apply again.",
        now,
      ).run();
    }
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  await db.prepare("DELETE FROM member_profile_fields WHERE member_id = ?").bind(member.id).run();
  await db.prepare("DELETE FROM member_profiles WHERE member_id = ?").bind(member.id).run();
  await db.prepare("DELETE FROM member_admin_notes WHERE member_id = ?").bind(member.id).run();
  await db.prepare("DELETE FROM memberships WHERE member_id = ?").bind(member.id).run();
  await db.prepare("DELETE FROM sessions WHERE email = ?").bind(email).run();
  await db.prepare("DELETE FROM magic_links WHERE email = ?").bind(email).run();
  try {
    await db.prepare("DELETE FROM points_events WHERE member_id = ?").bind(member.id).run();
    await db.prepare("DELETE FROM referral_codes WHERE member_id = ?").bind(member.id).run();
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  try {
    await db.prepare("DELETE FROM member_ideas WHERE member_id = ?").bind(member.id).run();
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  await db.prepare("DELETE FROM members WHERE id = ?").bind(member.id).run();
  const media = env?.HUB_MEDIA;
  if (keys.length && media && typeof media.delete === "function") {
    for (const key of keys) {
      try {
        await media.delete(key);
      } catch (error) {
        logError("flagged issue file delete failed", error);
      }
    }
  } else if (keys.length) {
    console.error(JSON.stringify({ message: "media binding missing", action: "delete-member", files: keys.length }));
  }
  console.log(JSON.stringify({
    message: "member deleted",
    member_id: member.id,
    email,
    by: session.email,
    at: now,
    networks,
    applications_marked: (approved.results || []).length,
    mailerlite: mailer.status,
  }));
  return { mailer: mailer.status };
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

async function loadContentItem(db, id) {
  try {
    return await db.prepare(`SELECT ${CONTENT_COLUMNS}, share_all FROM content_items WHERE id = ?`).bind(id).first();
  } catch (error) {
    if (!missingColumn(error)) throw error;
    return db.prepare(`SELECT ${CONTENT_COLUMNS} FROM content_items WHERE id = ?`).bind(id).first();
  }
}

async function contentRoute(request, env, db, session, id, action, url, page, redirect) {
  const item = await loadContentItem(db, id);
  if (!item) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin: true }), 404);
  if (action === "/preview" && (request.method === "GET" || request.method === "HEAD")) return page(renderPreview({ session, item }));
  if (request.method === "GET" || request.method === "HEAD") {
    const code = url.searchParams.get("notice");
    const message = code === "saved" ? "Saved." : code === "image" ? "Image saved." : code === "removed" ? "Image removed." : code === "media" ? "Media storage is not configured." : code === "share" ? "Saved on this network. Show on all networks needs the latest database migration." : "";
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
  return saveContent(request, env, db, session, item, page, redirect, form);
}

function chosenImageFile(form) {
  const file = form.get("image");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return null;
  const name = String(file.name || "").trim();
  const size = Number(file.size) || 0;
  if (!name && size <= 0) return null;
  return file;
}

async function deleteStoredImage(env, key) {
  if (!key || !env?.HUB_MEDIA || typeof env.HUB_MEDIA.delete !== "function") return;
  try {
    await env.HUB_MEDIA.delete(key);
  } catch (error) {
    logError("image delete failed", error);
  }
}

async function saveContent(request, env, db, session, existing, page, redirect, existingForm) {
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
    share_all: form.get("share_all") === "1",
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
    share_all: form.get("share_all") === "1" ? 1 : 0,
    image_alt: String(form.get("image_alt") || ""),
  };
  if (parsed.error) return page(renderContentEditor({ session, item: draft, message: parsed.error }), 400);
  const value = parsed.value;
  const file = chosenImageFile(form);
  let prepared = null;
  if (file) {
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return page(renderContentEditor({ session, item: draft, message: "Use a JPEG, PNG, or WebP image up to 5 MB." }), 400);
    }
    prepared = stripImageMetadata(new Uint8Array(await file.arrayBuffer()));
    if (!prepared) return page(renderContentEditor({ session, item: draft, message: "Use a JPEG, PNG, or WebP image up to 5 MB." }), 400);
  }
  const needsAlt = Boolean(prepared) || Boolean(existing?.image_key);
  if (needsAlt && !value.image_alt) {
    return page(renderContentEditor({ session, item: draft, message: "Add an image description of 180 characters or fewer." }), 400);
  }
  if (prepared && (!env?.HUB_MEDIA || typeof env.HUB_MEDIA.put !== "function")) {
    return page(renderContentEditor({ session, item: draft, message: "Media storage is not configured." }), 400);
  }
  const conflict = await db.prepare("SELECT id FROM content_items WHERE network = ? AND slug = ? AND id != ?").bind(value.network, value.slug, existing?.id || "").first();
  if (conflict) return page(renderContentEditor({ session, item: { ...draft, ...value }, message: "That slug is already used on this network." }), 400);
  let uploadedKey = "";
  try {
    if (prepared) {
      uploadedKey = `img/${crypto.randomUUID()}`;
      await env.HUB_MEDIA.put(uploadedKey, prepared.bytes, { httpMetadata: { contentType: prepared.type } });
    }
    const now = nowIso();
    const shared = value.share_all ? 1 : 0;
    const imageKey = uploadedKey || null;
    const imageType = prepared ? prepared.type : null;
    const imageBytes = prepared ? prepared.bytes.byteLength : null;
    if (!existing) {
      const id = crypto.randomUUID();
      const notice = await insertContent(db, {
        id, value, shared, imageKey, imageType, imageBytes, now,
      });
      return redirect(`/admin/content/${id}?notice=${notice}`);
    }
    const notice = await updateContent(db, existing, value, shared, prepared ? { imageKey, imageType, imageBytes } : null, now);
    if (prepared && existing.image_key && existing.image_key !== uploadedKey) await deleteStoredImage(env, existing.image_key);
    return redirect(`/admin/content/${existing.id}?notice=${notice}`);
  } catch (error) {
    if (uploadedKey) await deleteStoredImage(env, uploadedKey);
    throw error;
  }
}

async function insertContent(db, { id, value, shared, imageKey, imageType, imageBytes, now }) {
  try {
    await db.prepare(`INSERT INTO content_items
      (id, network, type, status, title, slug, body, description, link_url, pinned, share_all, image_key, image_alt, image_type, image_bytes, created_at, updated_at, published_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).bind(
      id, value.network, value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, shared, imageKey, value.image_alt, imageType, imageBytes, now, now,
    ).run();
    return "saved";
  } catch (error) {
    if (!missingColumn(error)) throw error;
    await db.prepare(`INSERT INTO content_items
      (id, network, type, status, title, slug, body, description, link_url, pinned, image_key, image_alt, image_type, image_bytes, created_at, updated_at, published_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).bind(
      id, value.network, value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, imageKey, value.image_alt, imageType, imageBytes, now, now,
    ).run();
    return "share";
  }
}

async function updateContent(db, existing, value, shared, image, now) {
  if (image) {
    try {
      await db.prepare(`UPDATE content_items SET type = ?, title = ?, slug = ?, body = ?, description = ?, link_url = ?, pinned = ?, share_all = ?, image_key = ?, image_alt = ?, image_type = ?, image_bytes = ?, updated_at = ?
        WHERE id = ?`).bind(value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, shared, image.imageKey, value.image_alt, image.imageType, image.imageBytes, now, existing.id).run();
      return "saved";
    } catch (error) {
      if (!missingColumn(error)) throw error;
      await db.prepare(`UPDATE content_items SET type = ?, title = ?, slug = ?, body = ?, description = ?, link_url = ?, pinned = ?, image_key = ?, image_alt = ?, image_type = ?, image_bytes = ?, updated_at = ?
        WHERE id = ?`).bind(value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, image.imageKey, value.image_alt, image.imageType, image.imageBytes, now, existing.id).run();
      return "share";
    }
  }
  try {
    await db.prepare(`UPDATE content_items SET type = ?, title = ?, slug = ?, body = ?, description = ?, link_url = ?, pinned = ?, share_all = ?, image_alt = ?, updated_at = ?
      WHERE id = ?`).bind(value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, shared, value.image_alt, now, existing.id).run();
    return "saved";
  } catch (error) {
    if (!missingColumn(error)) throw error;
    await db.prepare(`UPDATE content_items SET type = ?, title = ?, slug = ?, body = ?, description = ?, link_url = ?, pinned = ?, image_alt = ?, updated_at = ?
      WHERE id = ?`).bind(value.type, value.title, value.slug, value.body, value.description, value.link_url, value.pinned, value.image_alt, now, existing.id).run();
    return "share";
  }
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
  const preferred = readNetworkCookie(request);
  if (path === "/hub" && (request.method === "GET" || request.method === "HEAD")) {
    const target = await homeNetwork(db, session.email, preferred);
    if (target) return redirect(`/hub/${target}`);
    return page(renderMessage({ title: "Member hub", message: "You are signed in, and no network hub is on this account yet.", session, admin }));
  }
  if (path === "/hub/profile") {
    const target = await homeNetwork(db, session.email, preferred);
    if (!target) return page(renderMessage({ title: "Profile", message: "A profile is created when an application is approved.", session, admin }));
    return redirect(`/hub/${target}/profile${url.search}`);
  }
  const mediaMatch = path.match(/^\/hub\/media\/([0-9a-f-]{36})$/);
  if (mediaMatch && (request.method === "GET" || request.method === "HEAD")) return serveMedia(request, env, db, session, admin, memberships, mediaMatch[1], page);
  const networkMatch = path.match(/^\/hub\/(business|builders|tourism)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?$/);
  if (!networkMatch) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  const network = networkMatch[1];
  const slug = networkMatch[2] || "";
  const also = memberships.filter((id) => id !== network);
  if (!memberships.includes(network)) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin }), 404);
  if (slug === "profile") return profileRoute(request, db, session, admin, url, page, redirect, network, also);
  if (slug === "flag") return flagRoute(request, env, db, session, admin, url, page, redirect, network, also);
  if (slug === "idea") return ideaRoute(request, env, db, session, admin, page, redirect, network, also);
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin, network, also }), 405);
  if (slug === "welcome") return page(renderWelcome({ session, admin, network, also }));
  if (!slug) {
    return networkHome(db, session, admin, network, page, also, {
      flagged: url.searchParams.get("flagged") === "1",
      idea: url.searchParams.get("idea") === "1",
    });
  }
  let item = await db.prepare(`SELECT ${CONTENT_COLUMNS} FROM content_items WHERE network = ? AND slug = ? AND status = 'published'`).bind(network, slug).first();
  if (!item) {
    try {
      item = await db.prepare(`SELECT ${CONTENT_COLUMNS}, share_all FROM content_items WHERE share_all = 1 AND slug = ? AND status = 'published'`).bind(slug).first();
    } catch (error) {
      if (!missingColumn(error)) throw error;
    }
  }
  if (!item) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin, network, also }), 404);
  return page(renderMemberItem({ session, admin, item, also, network }));
}

async function listHubPosts(db, network) {
  const order = "ORDER BY pinned DESC, COALESCE(published_at, updated_at) DESC";
  try {
    const result = await db.prepare(`SELECT ${CONTENT_COLUMNS}, share_all FROM content_items
      WHERE network = ? AND status = 'published' OR share_all = 1 AND status = 'published'
      ${order}`).bind(network).all();
    return result.results || [];
  } catch (error) {
    if (!missingColumn(error)) throw error;
    const result = await db.prepare(`SELECT ${CONTENT_COLUMNS} FROM content_items
      WHERE network = ? AND status = 'published'
      ${order}`).bind(network).all();
    return result.results || [];
  }
}

async function networkHome(db, session, admin, network, page, also, options = {}) {
  const flagged = options === true || options.flagged === true;
  const idea = options.idea === true;
  const ideaMessage = options.ideaMessage || "";
  const ideaDraft = options.ideaDraft || "";
  const status = options.status || 200;
  const posts = await listHubPosts(db, network);
  const member = await db.prepare("SELECT id, name FROM members WHERE email = ?").bind(session.email).first();
  let issues = [];
  let profile = { name: "", company: "", role_title: "" };
  let referralCode = "";
  let points = emptyPoints();
  if (member) {
    profile = { name: member.name || "", company: "", role_title: "" };
    const row = await db.prepare("SELECT name, company, role_title FROM member_profiles WHERE member_id = ?").bind(member.id).first();
    if (row) {
      profile = {
        name: String(row.name || "").trim() || member.name || "",
        company: row.company || "",
        role_title: row.role_title || "",
      };
    }
    try {
      issues = await listMemberIssues(db, member.id, network);
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
    referralCode = await ensureReferralCode(db, member.id, network);
    points = await pointsForMember(db, member.id, network);
  }
  return page(renderNetworkHub({
    session,
    admin,
    network,
    also,
    flagged,
    idea,
    ideaMessage,
    ideaDraft,
    issues,
    posts,
    profile,
    referralCode,
    points,
  }), status);
}

async function ideaRoute(request, env, db, session, admin, page, redirect, network, also) {
  const member = await db.prepare(`SELECT m.id, m.email,
      COALESCE(NULLIF(p.name, ''), NULLIF(m.name, ''), m.email) AS display_name
    FROM members m
    LEFT JOIN member_profiles p ON p.member_id = m.id
    WHERE m.email = ?`).bind(session.email).first();
  if (!member) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin, network, also }), 404);
  if (request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin, network, also }), 403);
    const body = String(form.get("body") || "");
    const emailHit = await rateLimited(db, `idea-email:${session.email}`, IDEA_EMAIL_LIMIT);
    const ipHit = await rateLimited(db, `idea-ip:${clientIp(request)}`, IDEA_IP_LIMIT);
    if (emailHit || ipHit) {
      return networkHome(db, session, admin, network, page, also, {
        ideaMessage: "Please wait a bit and try again.",
        ideaDraft: body,
        status: 429,
      });
    }
    let created;
    try {
      created = await createMemberIdea(db, {
        memberId: member.id,
        network,
        body,
        now: nowIso(),
      });
    } catch (error) {
      if (missingTable(error)) {
        return networkHome(db, session, admin, network, page, also, {
          ideaMessage: "Ideas need the latest database migration before they can be saved.",
          ideaDraft: body,
          status: 503,
        });
      }
      throw error;
    }
    if (!created.ok) {
      return networkHome(db, session, admin, network, page, also, {
        ideaMessage: created.error,
        ideaDraft: body,
        status: created.status || 400,
      });
    }
    try {
      const notice = buildIdeaNotice({
        network,
        memberEmail: member.email,
        memberName: member.display_name,
        idea: created.idea,
        origin: publicOrigin(request),
      });
      if (notice && env.EMAIL && typeof env.EMAIL.send === "function") {
        await env.EMAIL.send(new EmailMessage(notice.from, notice.to, notice.raw));
      } else if (notice) {
        console.error(JSON.stringify({ message: "email binding missing", action: "member-idea" }));
      }
    } catch (error) {
      logError("member idea email failed", error);
    }
    return redirect(`/hub/${network}?idea=1`);
  }
  if (request.method === "GET" || request.method === "HEAD") return redirect(`/hub/${network}`);
  return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin, network, also }), 405);
}

function issueDraft(form) {
  return {
    title: String(form.get("title") || ""),
    body: String(form.get("body") || ""),
    where_text: String(form.get("where") || ""),
    deadline: String(form.get("deadline") || ""),
    link_url: String(form.get("link_url") || ""),
    effect: String(form.get("effect") || ""),
    contact_ok: form.get("contact_ok") === "1",
  };
}

async function flagRoute(request, env, db, session, admin, url, page, redirect, network, also) {
  const member = await db.prepare("SELECT id, email, name FROM members WHERE email = ?").bind(session.email).first();
  if (!member) return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin, network, also }), 404);
  if (request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin, network, also }), 403);
    const draft = issueDraft(form);
    const emailHit = await rateLimited(db, `flag-email:${session.email}`, FLAG_EMAIL_LIMIT);
    const ipHit = await rateLimited(db, `flag-ip:${clientIp(request)}`, FLAG_IP_LIMIT);
    if (emailHit || ipHit) {
      return page(renderFlagForm({ session, admin, network, also, draft, message: "Please wait a bit and try again." }), 429);
    }
    const files = [];
    for (const item of form.getAll("files")) {
      if (!item || typeof item.arrayBuffer !== "function" || !item.size) continue;
      files.push({ filename: String(item.name || ""), bytes: new Uint8Array(await item.arrayBuffer()) });
    }
    let created;
    try {
      created = await createFlaggedIssue(db, env.HUB_MEDIA, {
        memberId: member.id,
        network,
        issue: draft,
        files,
        now: nowIso(),
      });
    } catch (error) {
      if (missingTable(error)) {
        return page(renderFlagForm({ session, admin, network, also, draft, message: "Flagged issues need the latest database migration before they can be saved." }), 503);
      }
      throw error;
    }
    if (!created.ok) return page(renderFlagForm({ session, admin, network, also, draft, message: created.error }), created.status || 400);
    try {
      const notice = buildFlagNotice({
        network,
        memberEmail: member.email,
        memberName: member.name,
        issue: created.issue,
        files: created.files,
        origin: publicOrigin(request),
      });
      if (notice && env.EMAIL && typeof env.EMAIL.send === "function") {
        await env.EMAIL.send(new EmailMessage(notice.from, notice.to, notice.raw));
      } else if (notice) {
        console.error(JSON.stringify({ message: "email binding missing", action: "flag-issue" }));
      }
    } catch (error) {
      logError("flagged issue email failed", error);
    }
    return redirect(`/hub/${network}?flagged=1`);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin, network, also }), 405);
  return page(renderFlagForm({ session, admin, network, also }));
}

async function profileRoute(request, db, session, admin, url, page, redirect, network, also) {
  const member = await db.prepare("SELECT id, email, name FROM members WHERE email = ?").bind(session.email).first();
  if (!member) {
    return page(renderMessage({ title: "Profile", message: "A profile is created when an application is approved.", session, admin, network, also }));
  }
  if (request.method === "POST") {
    const form = await request.formData();
    if (!(await csrfOk(session, form))) return page(renderMessage({ title: "Form expired", message: "The form expired. Reload the page and try again.", session, admin, network, also }), 403);
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
        network,
        also,
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
    return redirect(`/hub/${network}/profile?saved=1`);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return page(renderMessage({ title: "Not found", message: "That page is not available.", session, admin, network, also }), 405);
  const current = await profileView(db, member);
  return page(renderProfile({
    session,
    admin,
    network,
    also,
    ...current,
    message: url.searchParams.get("saved") === "1" ? "Profile saved." : "",
  }));
}

async function profileView(db, member) {
  const profile = await db.prepare("SELECT name, company, role_title, phone, location, website, bio FROM member_profiles WHERE member_id = ?").bind(member.id).first();
  const fields = await db.prepare("SELECT id, label, value FROM member_profile_fields WHERE member_id = ? ORDER BY sort_order, label").bind(member.id).all();
  let filled = profile || emptyProfile();
  if (!profile || profileHasBlank(profile)) {
    const apps = await db.prepare(
      "SELECT name, fields_json FROM applications WHERE email = ? AND status = 'approved' ORDER BY submitted_at ASC, created_at ASC",
    ).bind(member.email).all();
    const result = await fillProfileFromApplications(db, member.id, profile, apps.results || [], nowIso());
    filled = result.profile;
  }
  if (!String(filled.name || "").trim() && member.name) filled = { ...filled, name: member.name };
  return {
    profile: filled,
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
