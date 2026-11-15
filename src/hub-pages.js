import { escapeHtml, formatWhen, networkLabel, renderMarkdown, safeUrl } from "./text.js";

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
.notice { border: 1px solid rgba(208, 160, 64, 0.7); background: #fff; padding: 12px 14px; margin: 0 0 18px; }
.prose p, .prose ul, .prose ol, .prose blockquote { margin: 0 0 14px; }
.prose ul, .prose ol { padding-left: 1.2em; }
.prose a, .text-link { text-decoration: underline; text-underline-offset: 3px; }
.thumb { width: min(100%, 720px); height: auto; margin: 0 0 16px; }
.grid-2 { display: grid; gap: 18px; }
.preview-banner { background: var(--navy); color: var(--cream); padding: 10px 0; font-size: 14px; }
.field-row { display: grid; gap: 8px; grid-template-columns: 1fr; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
@media (min-width: 800px) {
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .field-row { grid-template-columns: 1fr 1.4fr auto; align-items: end; }
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

function shell({ title, body, session, admin }) {
  const links = session
    ? `<a href="/hub">Hub</a><a href="/hub/profile">Profile</a>${admin ? `<a href="/admin">Applications</a><a href="/admin/members">Members</a><a href="/admin/content">Content</a>` : ""}<form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="button secondary" type="submit">Log out</button></form>`
    : `<a href="/login">Login</a>`;
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
<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="/" aria-label="Walton County Business Leaders home">
        <img src="/walton-county-business-leaders-logo.png" alt="" width="42" height="42">
        <div class="brand-name"><span>Walton County</span>Business Leaders</div>
      </a>
      <nav class="hub-nav" aria-label="Account">${links}</nav>
    </div>
  </header>
  <main id="content" class="container hub-main">${body}</main>
</body>
</html>`;
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
  return `<article class="card">
    <p class="eyebrow">${escapeHtml(networkLabel(item.network))} · ${escapeHtml(item.type)}</p>
    <h1>${escapeHtml(item.title)}</h1>
    <p class="meta">${item.published_at ? `Published ${escapeHtml(formatWhen(item.published_at))}` : "Draft"}</p>
    ${imageTag(item)}
    ${item.description ? `<p class="lede">${escapeHtml(item.description)}</p>` : ""}
    ${link ? `<p><a class="text-link" href="${escapeHtml(link)}" rel="noopener noreferrer">${escapeHtml(link)}</a></p>` : ""}
    <div class="prose">${renderMarkdown(item.body || "")}</div>
  </article>`;
}

export function renderHubHome({ session, admin, memberships }) {
  const cards = memberships.length
    ? memberships.map((network) => `<a class="card" href="/hub/${escapeHtml(network)}"><p class="eyebrow">Network</p><h2>${escapeHtml(networkLabel(network))}</h2><p>Open this network hub.</p></a>`).join("")
    : `<p>You are signed in, and no network hub is on this account yet.</p>`;
  return shell({
    title: "Member hub · Walton County Business Leaders",
    session,
    admin,
    body: `<p class="eyebrow">Members</p><h1>Your networks</h1>${cards}`,
  });
}

export function renderNetworkHub({ session, admin, network, top, resources, stories }) {
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
  return shell({
    title: `${networkLabel(network)} hub · Walton County Business Leaders`,
    session,
    admin,
    body: `<p class="eyebrow">Member hub</p><h1>${escapeHtml(networkLabel(network))}</h1>
      <h2>Announcements</h2>${topHtml}
      <h2>Resources</h2>${resourceHtml}
      <h2>Pages and posts</h2>${storyHtml}`,
  });
}

export function renderMemberItem({ session, admin, item }) {
  return shell({
    title: `${item.title} · Walton County Business Leaders`,
    session,
    admin,
    body: renderItemArticle(item),
  });
}

export function renderProfile({ session, admin, profile, fields, message }) {
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
  return shell({
    title: "Your profile · Walton County Business Leaders",
    session,
    admin,
    body: `<p class="eyebrow">Members</p><h1>Your profile</h1>
      <p class="lede">This is the record for ${escapeHtml(session.email)}. Email stays as it is for now.</p>
      ${notice(message)}
      <form class="stack" method="post" action="/hub/profile">
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

function fieldList(fields) {
  const entries = Object.entries(fields || {});
  if (!entries.length) return "<p>No answers were stored.</p>";
  return `<dl class="card">${entries.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd style="white-space:pre-wrap">${escapeHtml(value)}</dd>`).join("")}</dl>`;
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

export function renderApplicationDetail({ session, application, fields, message }) {
  const actions = `<form class="row-actions" method="post" action="/admin/applications/${escapeHtml(application.id)}/approve">
      <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
      <button class="button" type="submit">Approve</button>
    </form>
    <form class="row-actions" method="post" action="/admin/applications/${escapeHtml(application.id)}/deny">
      <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
      <button class="button secondary" type="submit">Deny</button>
    </form>`;
  return shell({
    title: `${application.name} · Application`,
    session,
    admin: true,
    body: `<p class="eyebrow">Application</p><h1>${escapeHtml(application.name)}</h1>
      ${notice(message)}
      <p><span class="pill">${escapeHtml(application.status)}</span> <span class="pill">${escapeHtml(networkLabel(application.network))}</span></p>
      <p class="meta">${escapeHtml(application.email)} · ${escapeHtml(formatWhen(application.submitted_at))}</p>
      <p class="meta">MailerLite: ${escapeHtml(application.mailerlite_detail || "Not sent yet")}</p>
      <p>${escapeHtml(application.source_url || "")}</p>
      <div class="row-actions">${actions}</div>
      <h2>Responses</h2>
      ${fieldList(fields)}`,
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

export function renderMemberDetail({ session, member, profile, fields, applications, notes, message }) {
  const apps = applications.length
    ? applications.map((application) => `<section class="card"><h3>${escapeHtml(networkLabel(application.network))} · ${escapeHtml(application.status)}</h3><p class="meta">${escapeHtml(formatWhen(application.submitted_at))}</p>${fieldList(application.fields)}</section>`).join("")
    : "<p>No applications are stored for this email.</p>";
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
      <form class="stack" method="post" action="/admin/members/${escapeHtml(member.id)}/notes">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>Notes<textarea name="notes" maxlength="10000">${escapeHtml(notes || "")}</textarea></label>
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

export function renderMessage({ title, message, session, admin }) {
  return shell({
    title,
    session,
    admin,
    body: `<p class="eyebrow">Members</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`,
  });
}

export function renderUnavailable(message) {
  return shell({
    title: "Not ready · Walton County Business Leaders",
    body: `<p class="eyebrow">Members</p><h1>Not ready yet</h1><p>${escapeHtml(message)}</p>`,
  });
}
