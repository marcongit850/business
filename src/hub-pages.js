import { NETWORK_IDS, networkById, networkList } from "./networks.js";
import { escapeHtml, externalUrl, formatWhen, isEmail, networkLabel, phoneDisplay, phoneHref, renderMarkdown, safeUrl } from "./text.js";

const CSS = `
.hub-main { padding: 42px 0 88px; }
.hub-main h1 { font-size: clamp(36px, 6vw, 56px); line-height: 1; margin: 8px 0 14px; }
.lede { max-width: 680px; margin-bottom: 22px; }
.hub-nav { margin-left: auto; display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: center; padding: 12px 0; }
.hub-nav form { margin: 0; }
.hub-nav .button, .row-actions .button, .filters .button { padding: 10px 14px; }
.button.secondary { background: transparent; }
.filters, .row-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; margin: 8px 0 22px; }
.filters label, .stack label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; }
.stack { display: grid; gap: 16px; max-width: 760px; }
.stack input, .stack textarea, .stack select, .filters select, .filters input {
  width: 100%; border: 1px solid var(--line); background: #fff; color: var(--navy);
  font: inherit; font-size: 16px; padding: 12px 14px;
}
.stack textarea { min-height: 140px; resize: vertical; }
.hub-table { width: 100%; border-collapse: collapse; background: #fff; }
.hub-table th, .hub-table td { text-align: left; padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.hub-table th { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.card { background: #fff; border: 1px solid var(--line); padding: 18px; margin: 0 0 16px; }
.card h2, .card h3 { font-size: 32px; line-height: 1.1; margin-bottom: 8px; }
.meta { color: var(--navy); font-size: 14px; letter-spacing: 0.03em; }
.pill { display: inline-block; border: 1px solid var(--gold); padding: 2px 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; margin-right: 6px; }
.pill-pending { background: rgba(208, 160, 64, 0.16); }
.pill-approved { background: var(--navy); color: var(--cream); border-color: var(--navy); }
.pill-denied { border-color: rgba(0, 24, 64, 0.25); color: rgba(0, 24, 64, 0.72); }
.notice { border: 1px solid rgba(208, 160, 64, 0.7); background: #fff; padding: 12px 14px; margin: 0 0 18px; }
.prose p, .prose ul, .prose ol, .prose blockquote { margin: 0 0 14px; }
.prose ul, .prose ol { padding-left: 1.2em; }
.prose a, .text-link { text-decoration: underline; text-underline-offset: 3px; }
.thumb { width: min(100%, 720px); height: auto; margin: 0 0 16px; }
.grid-2 { display: grid; gap: 18px; }
.preview-banner { background: var(--navy); color: var(--cream); padding: 10px 0; font-size: 14px; }
.field-row { display: grid; gap: 8px; grid-template-columns: 1fr; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.app-summary { margin: 0 0 18px; }
.app-summary .meta, .app-pills { margin: 0 0 8px; }
.decision-card h2 { font-size: 28px; }
.decision-card .row-actions { margin: 0; }
.response-grid { display: grid; grid-template-columns: 1fr; gap: 0 28px; margin: 0; }
.response-item { min-width: 0; padding: 14px 0; border-bottom: 1px solid var(--line); }
.response-item dt { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--navy); }
.response-item dd { margin: 0; font-size: 17px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.response-empty { color: rgba(0, 24, 64, 0.48); font-style: italic; }
.note-list { list-style: none; margin: 0 0 16px; padding: 0; display: grid; gap: 10px; }
.note { background: #fff; border: 1px solid var(--line); border-left: 3px solid var(--gold); padding: 12px 14px; }
.note-body { margin: 6px 0 0; white-space: pre-wrap; line-height: 1.5; overflow-wrap: anywhere; }
.note-heading { margin: 8px 0; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.site-header { border-top: 4px solid var(--accent, var(--gold)); }
.brand img.seal { border-radius: 50%; object-fit: cover; }
.brand img.tile { border-radius: 0; object-fit: contain; background: #001840; }
.login-choices { display: grid; gap: 12px; max-width: 640px; }
.login-choice { display: flex; align-items: center; gap: 14px; background: #fff; border: 1px solid var(--line); padding: 14px 16px; }
.login-choice img { width: 42px; height: 42px; object-fit: contain; flex: none; }
.login-choice img.seal { border-radius: 50%; object-fit: cover; }
.login-choice img.tile { background: #001840; }
.check-list { display: grid; gap: 10px; margin: 0 0 16px; border: 0; padding: 0; }
.check-list legend { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 4px; }
.check-list label { display: flex; gap: 10px; align-items: flex-start; font-size: 16px; font-weight: 500; letter-spacing: 0; }
.check-list input { width: auto; margin-top: 4px; }
.decision-card .row-actions { display: block; }
.decision-card form { margin: 0 0 12px; }
.decision-card form .button { margin-top: 4px; }
.hub-foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 14px; }
.hub-foot p { margin: 0 0 8px; }
.hub-foot a { text-decoration: underline; text-underline-offset: 3px; }
.hub-links { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.also-member { color: rgba(0, 24, 64, 0.72); }
.login-notice { margin: 0 0 18px; }
@media (min-width: 800px) {
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .field-row { grid-template-columns: 1fr 1.4fr auto; align-items: end; }
  .response-grid { grid-template-columns: 1fr 1fr; }
  .response-wide { grid-column: 1 / -1; }
}
@media (max-width: 800px) {
  .hub-table thead { display: none; }
  .hub-table, .hub-table tbody, .hub-table tr, .hub-table td { display: block; width: 100%; }
  .hub-table td { border: 0; padding: 4px 0; }
  .hub-table tr { border-bottom: 1px solid var(--line); padding: 12px 0; }
  .site-header .header-inner { flex-direction: column; align-items: flex-start; }
  .hub-nav { width: 100%; margin-left: 0; padding-top: 4px; }
}
`;

function alsoLine(also) {
  const links = NETWORK_IDS.filter((id) => (also || []).includes(id)).map((id) => networkById(id)).map((network) => `<a href="/hub/${network.id}">${escapeHtml(network.name)}</a>`);
  if (!links.length) return "";
  const sentence = links.length === 1
    ? `Also a member of ${links[0]}`
    : `Also a member of ${links.slice(0, -1).join(", ")} and ${links[links.length - 1]}`;
  return `<p class="also-member">${sentence}.</p>`;
}

function networkFooter(brand, also) {
  if (!brand) return "";
  return `<footer class="hub-foot">
    <p class="hub-links"><a href="${escapeHtml(brand.site)}">${escapeHtml(brand.siteLabel)}</a><a href="${escapeHtml(brand.facebook)}" target="_blank" rel="noopener noreferrer">Facebook group</a></p>
    ${alsoLine(also)}
  </footer>`;
}

function shell({ title, body, session, admin, network, also, header }) {
  const brand = network ? networkById(network) : null;
  const mode = header || (brand ? "network" : admin ? "admin" : "plain");
  const adminLinks = admin ? `<a href="/admin">Applications</a><a href="/admin/members">Members</a><a href="/admin/content">Content</a>` : "";
  const logout = session
    ? `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="button secondary" type="submit">Log out</button></form>`
    : "";
  let links = "";
  let brandHtml = "";
  if (mode === "network" && brand) {
    const href = session ? `/hub/${brand.id}` : brand.site;
    const label = session ? `${brand.name} hub` : `${brand.name} home`;
    brandHtml = `<a class="brand" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">
        <img class="${brand.mark}" src="${brand.logo}" alt="" width="42" height="42">
        <div class="brand-name"><span>${escapeHtml(brand.kicker)}</span>${escapeHtml(brand.title)}</div>
      </a>`;
    links = session
      ? `<a href="/hub/${brand.id}">Hub</a><a href="/hub/${brand.id}/profile">Profile</a>${adminLinks}${logout}`
      : "";
  } else if (mode === "admin") {
    brandHtml = `<a class="brand" href="/" aria-label="Walton County Business Leaders home">
        <img src="/walton-county-business-leaders-logo.png" alt="" width="42" height="42">
        <div class="brand-name"><span>Walton County</span>Business Leaders</div>
      </a>`;
    links = session
      ? `<a href="/hub">Hub</a><a href="/hub/profile">Profile</a>${adminLinks}${logout}`
      : `<a href="/login">Login</a>`;
  } else if (mode === "signin") {
    brandHtml = `<a class="brand" href="/login" aria-label="Sign in"><div class="brand-name">Sign in</div></a>`;
  } else {
    brandHtml = `<a class="brand" href="${session ? "/hub" : "/login"}" aria-label="Member hub"><div class="brand-name">Member hub</div></a>`;
    links = session ? `${adminLinks}${logout}` : `<a href="/login">Login</a>`;
  }
  const accent = brand ? ` style="--accent:${brand.accent}" data-network="${brand.id}"` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#f6f3ec">
  <link rel="icon" href="/favicon.png" type="image/png">
  <link rel="stylesheet" href="/styles.css">
  <style>${CSS}</style>
</head>
<body${accent}>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      ${brandHtml}
      <nav class="hub-nav" aria-label="Account">${links}</nav>
    </div>
  </header>
  <main id="content" class="container hub-main">${body}${mode === "network" ? networkFooter(brand, also) : ""}</main>
</body>
</html>`;
}

export function renderLogin({ network = "", notice = "", next = "" } = {}) {
  const brand = network ? networkById(network) : null;
  const note = notice ? `<p class="login-notice" role="status">${escapeHtml(notice)}</p>` : "";
  if (!brand) {
    const choices = networkList().map((item) => {
      const href = next ? `/login/${item.id}?next=${encodeURIComponent(next)}` : `/login/${item.id}`;
      return `<a class="login-choice" href="${href}"><img class="${item.mark}" src="${item.logo}" alt="" width="42" height="42"><span>${escapeHtml(item.name)}</span></a>`;
    }).join("");
    return shell({
      title: "Sign in",
      header: "signin",
      body: `<p class="eyebrow">Members</p><h1>Sign in</h1>
        <p class="lede">Choose a network. Each one has its own sign-in.</p>
        ${note}
        <div class="login-choices">${choices}</div>`,
    });
  }
  const nextField = next ? `<input type="hidden" name="next" value="${escapeHtml(next)}">` : "";
  return shell({
    title: `Sign in · ${brand.name}`,
    network: brand.id,
    body: `<p class="eyebrow">Members</p><h1>Sign in</h1>
      <p class="lede">Sign in to ${escapeHtml(brand.name)}. Enter your email. If that address is approved for this network, a sign-in link is on its way.</p>
      ${note}
      <form class="stack" method="post" action="/login/${brand.id}">
        ${nextField}
        <label>Email <input type="email" name="email" required autocomplete="email"></label>
        <button class="button" type="submit">Email me a sign-in link</button>
      </form>
      <p>Not a member yet? <a class="text-link" href="${escapeHtml(brand.join)}">Request membership</a></p>`,
  });
}

function notice(text) {
  return text ? `<p class="notice" role="status">${escapeHtml(text)}</p>` : "";
}

function imageTag(item) {
  if (!item.image_key) return "";
  return `<img class="thumb" src="/hub/media/${escapeHtml(item.id)}" alt="${escapeHtml(item.image_alt || "")}">`;
}

export function renderItemArticle(item) {
  const link = safeUrl(item.link_url);
  const networkName = networkById(item.network)?.name || networkLabel(item.network);
  return `<article class="card">
    <p class="eyebrow">${escapeHtml(networkName)} · ${escapeHtml(item.type)}</p>
    <h1>${escapeHtml(item.title)}</h1>
    <p class="meta">${item.published_at ? `Published ${escapeHtml(formatWhen(item.published_at))}` : "Draft"}</p>
    ${imageTag(item)}
    ${item.description ? `<p class="lede">${escapeHtml(item.description)}</p>` : ""}
    ${link ? `<p><a class="text-link" href="${escapeHtml(link)}" rel="noopener noreferrer">${escapeHtml(link)}</a></p>` : ""}
    <div class="prose">${renderMarkdown(item.body || "")}</div>
  </article>`;
}

export function renderNetworkHub({ session, admin, network, top, resources, stories, also = [] }) {
  const card = (item, withBody) => `<article class="card">
    ${imageTag(item)}
    <p>${item.pinned ? `<span class="pill">Pinned</span>` : ""}<span class="pill">${escapeHtml(item.type)}</span></p>
    <h2><a href="/hub/${escapeHtml(network)}/${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a></h2>
    ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
    ${withBody ? `<div class="prose">${renderMarkdown(item.body || "")}</div>` : ""}
    ${safeUrl(item.link_url) ? `<p><a class="text-link" href="${escapeHtml(safeUrl(item.link_url))}" rel="noopener noreferrer">Open resource</a></p>` : ""}
  </article>`;
  const topHtml = top.length ? top.map((item) => card(item, item.type === "announcement")).join("") : `<p>No announcements yet.</p>`;
  const resourceHtml = resources.length ? resources.map((item) => card(item, false)).join("") : `<p>No resources yet.</p>`;
  const storyHtml = stories.length ? stories.map((item) => card(item, false)).join("") : `<p>No pages or posts yet.</p>`;
  const brand = networkById(network);
  const name = brand?.name || networkLabel(network);
  return shell({
    title: `${name} hub`,
    session,
    admin,
    network,
    also,
    body: `<p class="eyebrow">Member hub</p><h1>${escapeHtml(name)}</h1>
      <h2>Announcements</h2>${topHtml}
      <h2>Resources</h2>${resourceHtml}
      <h2>Pages and posts</h2>${storyHtml}`,
  });
}

export function renderMemberItem({ session, admin, item, also = [] }) {
  const name = networkById(item.network)?.name || "";
  return shell({
    title: name ? `${item.title} · ${name}` : item.title,
    session,
    admin,
    network: item.network,
    also,
    body: renderItemArticle(item),
  });
}

export function renderProfile({ session, admin, profile, fields, message, network, also = [] }) {
  const rows = fields.map((field, index) => `<div class="field-row">
    <input type="hidden" name="field_id" value="${escapeHtml(field.id)}">
    <label>Label <input name="field_label" maxlength="60" value="${escapeHtml(field.label)}"></label>
    <label>Value <input name="field_value" maxlength="1000" value="${escapeHtml(field.value)}"></label>
    <label>Remove <input type="checkbox" name="field_remove" value="${index}"></label>
  </div>`).join("");
  const blanks = [0, 1, 2].map(() => `<div class="field-row">
    <input type="hidden" name="field_id" value="">
    <label>Label <input name="field_label" maxlength="60"></label>
    <label>Value <input name="field_value" maxlength="1000"></label>
    <input type="hidden" name="field_remove" value="">
  </div>`).join("");
  const form = (name, label, value, extra = "") => `<label>${label}<input name="${name}" ${extra} value="${escapeHtml(value || "")}"></label>`;
  const brand = network ? networkById(network) : null;
  const action = brand ? `/hub/${brand.id}/profile` : "/hub/profile";
  return shell({
    title: brand ? `Your profile · ${brand.name}` : "Your profile",
    session,
    admin,
    network,
    also,
    body: `<p class="eyebrow">${brand ? escapeHtml(brand.name) : "Members"}</p><h1>Your profile</h1>
      <p class="lede">This is the record for ${escapeHtml(session.email)}. Email stays as it is for now.</p>
      ${notice(message)}
      <form class="stack" method="post" action="${action}">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        ${form("name", "Name", profile.name, 'maxlength="120" autocomplete="name"')}
        ${form("company", "Business or company", profile.company, 'maxlength="160" autocomplete="organization"')}
        ${form("role_title", "Role or title", profile.role_title, 'maxlength="120" autocomplete="organization-title"')}
        ${form("phone", "Phone", profile.phone, 'maxlength="40" autocomplete="tel"')}
        ${form("location", "Location", profile.location, 'maxlength="120"')}
        ${form("website", "Website", profile.website, 'maxlength="300" autocomplete="url"')}
        <label>Short bio<textarea name="bio" maxlength="2000">${escapeHtml(profile.bio || "")}</textarea></label>
        <h2>Custom fields</h2>
        <p>Add up to 20 label and value pairs, such as business info or a location detail. Labels can be 60 characters. Values can be 1,000.</p>
        ${rows}${blanks}
        <button class="button" type="submit">Save profile</button>
      </form>`,
  });
}

const RESPONSE_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  role: "Role",
  industry: "Industry",
  years_in_walton: "Years in Walton",
  website: "Website",
  about: "About",
  trade: "Trade",
  business: "Business",
  seasons: "Seasons",
};

const RESPONSE_ORDER = ["name", "email", "phone", "company", "role", "industry", "years_in_walton", "website", "trade", "business", "seasons"];

function responseLabel(key) {
  if (RESPONSE_LABELS[key]) return RESPONSE_LABELS[key];
  const words = String(key).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Field";
  return words.split(" ").map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : "")).join(" ");
}

function orderedResponses(fields) {
  const entries = Object.entries(fields || {}).filter(([key]) => String(key).trim());
  const known = [];
  const extras = [];
  const about = [];
  for (const entry of entries) {
    if (String(entry[0]).toLowerCase() === "about") about.push(entry);
    else if (RESPONSE_ORDER.includes(entry[0])) known.push(entry);
    else extras.push(entry);
  }
  known.sort((a, b) => RESPONSE_ORDER.indexOf(a[0]) - RESPONSE_ORDER.indexOf(b[0]));
  return [...known, ...extras, ...about];
}

function responseValue(key, value) {
  const original = value == null ? "" : String(value);
  const trimmed = original.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return `<span class="response-empty">Not provided</span>`;
  const lower = String(key).toLowerCase();
  if (lower === "email") {
    if (!isEmail(trimmed)) return escapeHtml(trimmed);
    return `<a class="text-link" href="mailto:${escapeHtml(trimmed)}">${escapeHtml(trimmed)}</a>`;
  }
  if (lower === "phone") {
    const display = phoneDisplay(trimmed);
    const href = phoneHref(trimmed);
    if (!href) return escapeHtml(display);
    return `<a class="text-link" href="${escapeHtml(href)}">${escapeHtml(display)}</a>`;
  }
  if (lower === "website") {
    const href = externalUrl(trimmed);
    if (!href) return escapeHtml(trimmed);
    return `<a class="text-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(trimmed)}</a>`;
  }
  return escapeHtml(trimmed);
}

function fieldList(fields) {
  const entries = orderedResponses(fields);
  if (!entries.length) return "<p>No answers were stored.</p>";
  const items = entries.map(([key, value]) => {
    const wide = String(key).toLowerCase() === "about" ? " response-wide" : "";
    return `<div class="response-item${wide}"><dt>${escapeHtml(responseLabel(key))}</dt><dd>${responseValue(key, value)}</dd></div>`;
  }).join("");
  return `<dl class="card response-grid">${items}</dl>`;
}

function statusPill(status) {
  const known = status === "pending" || status === "approved" || status === "denied";
  const label = status === "pending" ? "Pending" : status === "approved" ? "Approved" : status === "denied" ? "Denied" : String(status || "");
  const extra = known ? ` pill-${status}` : "";
  return `<span class="pill${extra}">${escapeHtml(label)}</span>`;
}

function renderNoteList(notes) {
  if (!notes?.length) return `<p class="meta">No notes yet.</p>`;
  return `<ol class="note-list">${notes.map((note) => `<li class="note"><p class="meta">${escapeHtml(formatWhen(note.created_at))} · ${escapeHtml(note.author_email || "")}${note.network ? ` · ${escapeHtml(networkLabel(note.network))}` : ""}</p><p class="note-body">${escapeHtml(note.body || "")}</p></li>`).join("")}</ol>`;
}

function sourceLine(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const href = safeUrl(raw);
  const text = escapeHtml(raw);
  const inner = href ? `<a class="text-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  return `<p class="meta">Source ${inner}</p>`;
}

export function renderApplications({ session, network, status, rows, mailerNote }) {
  const option = (value, current, label) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>
        <td data-label="Name"><a class="text-link" href="/admin/applications/${escapeHtml(row.id)}">${escapeHtml(row.name)}</a><div class="meta">${escapeHtml(row.email)}</div></td>
        <td>${escapeHtml(networkLabel(row.network))}</td>
        <td>${escapeHtml(formatWhen(row.submitted_at))}</td>
        <td><span class="pill">${escapeHtml(row.status)}</span></td>
      </tr>`).join("")
    : `<tr><td colspan="4">No applications match these filters.</td></tr>`;
  return shell({
    title: "Applications · Walton County Business Leaders",
    session,
    admin: true,
    body: `<p class="eyebrow">Admin</p><h1>Applications</h1>
      ${notice(mailerNote)}
      <p class="lede">Join and application forms from Business Leaders, Builders, and Tourism.</p>
      <form class="filters" method="get" action="/admin">
        <label>Network<select name="network">
          ${option("", network, "All networks")}
          ${option("business", network, "Business Leaders")}
          ${option("builders", network, "Builders")}
          ${option("tourism", network, "Tourism")}
        </select></label>
        <label>Status<select name="status">
          ${option("", status, "All statuses")}
          ${option("pending", status, "Pending")}
          ${option("approved", status, "Approved")}
          ${option("denied", status, "Denied")}
        </select></label>
        <button class="button" type="submit">Filter</button>
      </form>
      <table class="hub-table"><thead><tr><th>Person</th><th>Network</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${bodyRows}</tbody></table>`,
  });
}

function networkChecks(applied) {
  return networkList().map((item) => {
    const locked = item.id === applied;
    const box = locked
      ? `<input type="checkbox" name="networks" value="${item.id}" checked disabled><input type="hidden" name="networks" value="${item.id}">`
      : `<input type="checkbox" name="networks" value="${item.id}">`;
    const note = locked ? ` <span class="meta">Applied network</span>` : "";
    return `<label>${box} ${escapeHtml(item.name)}${note}</label>`;
  }).join("");
}

export function renderApplicationDetail({ session, application, fields, notes = [], message, noteDraft = "", notesReady = true }) {
  const applied = networkById(application.network);
  const actions = `<form method="post" action="/admin/applications/${escapeHtml(application.id)}/approve">
      <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
      <fieldset class="check-list">
        <legend>Networks</legend>
        <p class="meta">This application is for ${escapeHtml(applied?.name || "this network")}. That network stays included. Check any other network this person should join too.</p>
        ${networkChecks(application.network)}
      </fieldset>
      <button class="button" type="submit">Approve</button>
    </form>
    <form method="post" action="/admin/applications/${escapeHtml(application.id)}/deny">
      <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
      <button class="button secondary" type="submit">Deny</button>
    </form>`;
  const network = networkLabel(application.network);
  const email = String(application.email || "").trim();
  const emailHtml = isEmail(email)
    ? `<a class="text-link" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
    : escapeHtml(email);
  const reviewed = application.reviewed_at
    ? `<p class="meta">Reviewed ${escapeHtml(formatWhen(application.reviewed_at))}${application.reviewed_by ? ` by ${escapeHtml(application.reviewed_by)}` : ""}</p>`
    : "";
  return shell({
    title: `${application.name} · Application`,
    session,
    admin: true,
    body: `<p class="eyebrow">Application</p><h1>${escapeHtml(application.name)}</h1>
      ${notice(message)}
      <div class="app-summary">
        <p class="app-pills">${statusPill(application.status)}${network ? `<span class="pill">${escapeHtml(network)}</span>` : ""}</p>
        <p class="meta">Submitted ${escapeHtml(formatWhen(application.submitted_at))}</p>
        <p class="meta">${emailHtml}</p>
        ${reviewed}
        <p class="meta">MailerLite: ${escapeHtml(application.mailerlite_detail || "Not sent yet")}</p>
        ${sourceLine(application.source_url)}
      </div>
      <div class="card decision-card">
        <h2>Review</h2>
        <div class="row-actions">${actions}</div>
      </div>
      <h2>Responses</h2>
      ${fieldList(fields)}
      <h2>Private notes</h2>
      <p class="meta">Only admins can see these notes. Applicants and members never see them. They stay listed on the member page, and approving also adds them to that member's notes.</p>
      ${notesReady ? `${renderNoteList(notes)}
      <form class="stack" method="post" action="/admin/applications/${escapeHtml(application.id)}/notes">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>Add a note<textarea name="note" maxlength="4000" required>${escapeHtml(noteDraft || "")}</textarea></label>
        <button class="button" type="submit">Save</button>
      </form>` : `<p class="notice">Application notes need the latest database migration before they can be saved.</p>`}`,
  });
}

export function renderMembers({ session, rows }) {
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>
        <td><a class="text-link" href="/admin/members/${escapeHtml(row.id)}">${escapeHtml(row.display_name)}</a><div class="meta">${escapeHtml(row.email)}</div></td>
        <td>${row.networks.map((network) => `<span class="pill">${escapeHtml(networkLabel(network))}</span>`).join(" ")}</td>
      </tr>`).join("")
    : `<tr><td colspan="2">No approved members yet.</td></tr>`;
  return shell({
    title: "Members · Walton County Business Leaders",
    session,
    admin: true,
    body: `<p class="eyebrow">Admin</p><h1>Members</h1><p class="lede">Approved members and the networks on their account.</p>
      <table class="hub-table"><thead><tr><th>Member</th><th>Networks</th></tr></thead><tbody>${bodyRows}</tbody></table>`,
  });
}

export function renderMemberDetail({ session, member, profile, fields, applications, notes, applicationNotes = [], message }) {
  const apps = applications.length
    ? applications.map((application) => `<section class="card"><h3>${escapeHtml(networkLabel(application.network))} · ${escapeHtml(application.status)}</h3><p class="meta">${escapeHtml(formatWhen(application.submitted_at))}</p><p class="meta"><a class="text-link" href="/admin/applications/${escapeHtml(application.id)}">Open application</a></p>${fieldList(application.fields)}</section>`).join("")
    : "<p>No applications are stored for this email.</p>";
  const carried = applicationNotes.length
    ? `<p class="note-heading">From applications</p>${renderNoteList(applicationNotes)}`
    : "";
  const custom = fields.length
    ? `<dl class="card">${fields.map((field) => `<dt>${escapeHtml(field.label)}</dt><dd style="white-space:pre-wrap">${escapeHtml(field.value)}</dd>`).join("")}</dl>`
    : "<p>No custom fields yet.</p>";
  return shell({
    title: `${member.display_name} · Member`,
    session,
    admin: true,
    body: `<p class="eyebrow">Member</p><h1>${escapeHtml(member.display_name)}</h1>
      ${notice(message)}
      <p class="meta">${escapeHtml(member.email)}</p>
      <p>${member.networks.map((network) => `<span class="pill">${escapeHtml(networkLabel(network))}</span>`).join(" ")}</p>
      <h2>Profile</h2>
      <dl class="card">
        <dt>Name</dt><dd>${escapeHtml(profile.name || "")}</dd>
        <dt>Business or company</dt><dd>${escapeHtml(profile.company || "")}</dd>
        <dt>Role or title</dt><dd>${escapeHtml(profile.role_title || "")}</dd>
        <dt>Phone</dt><dd>${escapeHtml(profile.phone || "")}</dd>
        <dt>Location</dt><dd>${escapeHtml(profile.location || "")}</dd>
        <dt>Website</dt><dd>${escapeHtml(profile.website || "")}</dd>
        <dt>Bio</dt><dd style="white-space:pre-wrap">${escapeHtml(profile.bio || "")}</dd>
      </dl>
      <h2>Custom fields</h2>${custom}
      <h2>Applications</h2>${apps}
      <h2>Private notes</h2>
      <p class="meta">Only admins can see this. It is not shown in the member hub and it is not sent to MailerLite.</p>
      ${carried}
      <form class="stack" method="post" action="/admin/members/${escapeHtml(member.id)}/notes">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>Member notes<textarea name="notes" maxlength="10000">${escapeHtml(notes || "")}</textarea></label>
        <button class="button" type="submit">Save notes</button>
      </form>`,
  });
}

export function renderContentList({ session, network, status, rows }) {
  const option = (value, current, label) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>
        <td><a class="text-link" href="/admin/content/${escapeHtml(row.id)}">${escapeHtml(row.title)}</a><div class="meta">${escapeHtml(row.slug)}</div></td>
        <td>${escapeHtml(row.type)}</td>
        <td><span class="pill">${escapeHtml(row.status)}</span>${row.pinned ? ` <span class="pill">Pinned</span>` : ""}</td>
        <td>${escapeHtml(formatWhen(row.created_at))}</td>
        <td>${escapeHtml(formatWhen(row.updated_at))}</td>
        <td>${escapeHtml(formatWhen(row.published_at))}</td>
      </tr>`).join("")
    : `<tr><td colspan="6">No items match these filters.</td></tr>`;
  return shell({
    title: "Content · Walton County Business Leaders",
    session,
    admin: true,
    body: `<p class="eyebrow">Admin</p><h1>Content</h1>
      <p class="lede">Drafts stay private. Members only see published items for a network they belong to.</p>
      <form class="filters" method="get" action="/admin/content">
        <label>Network<select name="network">
          ${option("business", network, "Business Leaders")}
          ${option("builders", network, "Builders")}
          ${option("tourism", network, "Tourism")}
        </select></label>
        <label>Status<select name="status">
          ${option("", status, "All statuses")}
          ${option("draft", status, "Draft")}
          ${option("published", status, "Published")}
        </select></label>
        <button class="button" type="submit">Filter</button>
        <a class="button" href="/admin/content/new?network=${escapeHtml(network)}">New draft</a>
      </form>
      <table class="hub-table"><thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Created</th><th>Updated</th><th>Published</th></tr></thead><tbody>${bodyRows}</tbody></table>`,
  });
}

export function renderContentEditor({ session, item, message }) {
  const isNew = !item.id;
  const action = isNew ? "/admin/content" : `/admin/content/${item.id}`;
  const option = (value, current, label) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
  const statusLine = isNew
    ? ""
    : `<p class="meta"><span class="pill">${escapeHtml(item.status)}</span> Created ${escapeHtml(formatWhen(item.created_at))} · Updated ${escapeHtml(formatWhen(item.updated_at))}${item.published_at ? ` · First published ${escapeHtml(formatWhen(item.published_at))}` : ""}</p>`;
  const imageBlock = !isNew && item.image_key
    ? `${imageTag(item)}<form method="post" action="/admin/content/${escapeHtml(item.id)}/image/remove"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="button secondary" type="submit">Remove image</button></form>`
    : "";
  const upload = isNew
    ? "<p>Save the draft first, then add a featured image.</p>"
    : `<form class="stack" method="post" action="/admin/content/${escapeHtml(item.id)}/image" enctype="multipart/form-data">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>Featured image<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></label>
        <label>Image description<input name="image_alt" maxlength="180" value="${escapeHtml(item.image_alt || "")}" required></label>
        <button class="button secondary" type="submit">${item.image_key ? "Replace image" : "Upload image"}</button>
      </form>`;
  const publish = isNew
    ? ""
    : `<div class="row-actions">
        <a class="button secondary" href="/admin/content/${escapeHtml(item.id)}/preview">Preview</a>
        <form method="post" action="/admin/content/${escapeHtml(item.id)}/publish"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="button" type="submit">Publish</button></form>
        <form method="post" action="/admin/content/${escapeHtml(item.id)}/unpublish"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="button secondary" type="submit">Unpublish</button></form>
        <form method="post" action="/admin/content/${escapeHtml(item.id)}/pin"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="pinned" value="${item.pinned ? "0" : "1"}"><button class="button secondary" type="submit">${item.pinned ? "Unpin" : "Pin"}</button></form>
        <form method="post" action="/admin/content/${escapeHtml(item.id)}/delete"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="button secondary" type="submit">Delete</button></form>
      </div>`;
  return shell({
    title: isNew ? "New draft · Walton County Business Leaders" : `${item.title} · Edit`,
    session,
    admin: true,
    body: `<p class="eyebrow">Content</p><h1>${isNew ? "New draft" : escapeHtml(item.title)}</h1>
      ${notice(message)}
      ${statusLine}
      ${publish}
      <form class="stack" method="post" action="${action}">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>Network<select name="network" ${isNew ? "" : "disabled"}>
          ${option("business", item.network, "Business Leaders")}
          ${option("builders", item.network, "Builders")}
          ${option("tourism", item.network, "Tourism")}
        </select></label>
        ${isNew ? "" : `<input type="hidden" name="network" value="${escapeHtml(item.network)}">`}
        <label>Type<select name="type">
          ${option("post", item.type, "Post")}
          ${option("page", item.type, "Page")}
          ${option("announcement", item.type, "Announcement")}
          ${option("resource", item.type, "Resource")}
        </select></label>
        <label>Title<input name="title" maxlength="160" required value="${escapeHtml(item.title || "")}"></label>
        <label>Slug<input name="slug" maxlength="80" value="${escapeHtml(item.slug || "")}" placeholder="Leave blank to build one from the title"></label>
        <label>Description<textarea name="description" maxlength="1000">${escapeHtml(item.description || "")}</textarea></label>
        <label>Link<input name="link_url" maxlength="500" value="${escapeHtml(item.link_url || "")}" placeholder="https://example.com"></label>
        <label>Body<textarea name="body" maxlength="20000">${escapeHtml(item.body || "")}</textarea></label>
        <p class="meta">Write plain text or Markdown. Raw HTML is shown as text, not run.</p>
        <label>Pin this item<input type="checkbox" name="pinned" value="1"${item.pinned ? " checked" : ""}></label>
        <label>Image description<input name="image_alt" maxlength="180" value="${escapeHtml(item.image_alt || "")}"></label>
        <button class="button" type="submit">${isNew ? "Save draft" : "Save"}</button>
      </form>
      <h2>Featured image</h2>
      ${imageBlock}
      ${upload}`,
  });
}

export function renderPreview({ session, item }) {
  const banner = item.status === "published"
    ? "Admin preview. Members of this network can see this published item."
    : "Admin preview. Members cannot see this draft.";
  return shell({
    title: `Preview · ${item.title}`,
    session,
    admin: true,
    body: `<div class="preview-banner"><div class="container">${escapeHtml(banner)} <a href="/admin/content/${escapeHtml(item.id)}">Back to editor</a></div></div>${renderItemArticle(item)}`,
  });
}

export function renderMessage({ title, message, session, admin, network, also }) {
  return shell({
    title,
    session,
    admin,
    network,
    also,
    body: `<p class="eyebrow">${network && networkById(network) ? escapeHtml(networkById(network).name) : "Members"}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`,
  });
}

export function renderUnavailable(message) {
  return shell({
    title: "Not ready",
    header: "plain",
    body: `<p class="eyebrow">Members</p><h1>Not ready yet</h1><p>${escapeHtml(message)}</p>`,
  });
}
