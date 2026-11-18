import { ACTION_COPY, HERO_LINE, HERO_PHOTO, HUB_PRIORITIES, clipText, postPlainText, postsForHub, welcomeExcerpt, welcomeHeading } from "./hub-copy.js";
import { HUB_HOME_CSS } from "./hub-home-css.js";
import { HUB_HOME_SCRIPT } from "./hub-home-script.js";
import { emailHref, facebookHref, inviteShare, linkedinHref, smsHref, xHref } from "./hub-share.js";
import { actionEarnText, emptyPoints, POINT_VALUES, POINTS_EARN, pointsBreakdown } from "./points.js";
import { ISSUE_STATUSES, issueStatusLabel } from "./issues.js";
import { NETWORK_IDS, networkById, networkList } from "./networks.js";
import { PWA_SHORT_NAMES, pwaAppleTouchPath, pwaManifestPath } from "./pwa.js";
import { escapeHtml, externalUrl, formatLoginWhen, formatWhen, isEmail, networkLabel, phoneDisplay, phoneHref, renderMarkdown, safeUrl } from "./text.js";

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
.hub-table .col-label { display: none; }
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
.prose p.fine-print, .post-card .prose p.fine-print, .post-read .prose p.fine-print {
  font-size: 12px;
  line-height: 1.45;
  font-weight: 400;
  color: #4a5563;
}
.prose p.fine-print a { color: inherit; }
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
.member-view.hub-main { padding: 18px 0 40px; }
.member-view h1 { margin: 0 0 6px; }
.member-view h2 { margin: 12px 0 6px; font-size: 28px; line-height: 1.1; }
.member-view .notice { margin: 0 0 10px; }
.member-view .card { padding: 8px 12px; margin: 0 0 8px; }
.member-view .stack { gap: 10px; }
.member-view .note-list { margin: 0 0 10px; }
.member-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 0 0 8px; }
.member-contact { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; font-size: 15px; line-height: 1.4; }
.member-tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
.member-tags .pill { margin: 0; }
.member-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 4px; }
.member-actions .button { padding: 8px 12px; }
.member-view .button.danger { background: #9b2335; color: #fff; border-color: #9b2335; }
.member-view .button.danger:hover,
.member-view .button.danger:focus-visible { background: #7d1c2b; color: #fff; }
.kv-grid { display: grid; grid-template-columns: 1fr; gap: 0; margin: 0; }
.kv-row { display: grid; grid-template-columns: 1fr; gap: 2px; padding: 5px 0; border-bottom: 1px solid var(--line); }
.kv-grid .kv-row:last-child { border-bottom: 0; }
.member-view dt, .member-view dd { margin: 0; }
.kv-row dt { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(0, 24, 64, 0.55); }
.kv-row dd { font-size: 16px; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; }
.member-missing { margin: 6px 0 0; font-size: 13px; line-height: 1.4; color: rgba(0, 24, 64, 0.55); }
.app-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.app-line .meta, .app-line .pill { margin: 0; }
.app-network { font-weight: 700; }
.app-answers { margin-top: 4px; }
.app-answers summary { cursor: pointer; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }
.member-view details.app-answers:not([open]) > :not(summary) { display: none; }
.app-answers .kv-grid { margin-top: 2px; }
.welcome, .flag-issue, .my-issues { max-width: 760px; }
.welcome {
  background: #fff; border: 1px solid var(--line); border-top: 4px solid var(--accent, var(--gold));
  padding: 20px 18px 6px; margin: 0 0 22px;
}
.welcome h2 { font-size: clamp(28px, 5vw, 40px); line-height: 1.15; margin: 0 0 12px; }
.welcome p { margin: 0 0 14px; font-size: 17px; line-height: 1.55; overflow-wrap: anywhere; }
.flag-issue { margin: 0 0 28px; }
a.flag-button, button.flag-button {
  display: inline-block; max-width: 100%; background: var(--accent, #d0a040); color: #001840;
  border: 1px solid var(--accent, #d0a040); text-decoration: none; font-weight: 700; text-align: center;
}
.flag-note { margin: 10px 0 0; font-size: 15px; line-height: 1.45; }
.my-issues { margin: 0 0 28px; }
.my-issues ul { list-style: none; margin: 0; padding: 0; }
.my-issue {
  display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: space-between;
  background: #fff; border: 1px solid var(--line); padding: 12px 14px; margin: 0 0 10px;
}
.my-issue-title { font-weight: 700; overflow-wrap: anywhere; }
.issue-body { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
@media (max-width: 800px) {
  .welcome { padding: 16px 14px 2px; }
  .my-issue { display: grid; }
}
@media (min-width: 800px) {
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .field-row { grid-template-columns: 1fr 1.4fr auto; align-items: end; }
  .response-grid { grid-template-columns: 1fr 1fr; }
  .response-wide { grid-column: 1 / -1; }
  .kv-row { grid-template-columns: minmax(148px, 210px) minmax(0, 1fr); column-gap: 16px; align-items: start; }
}
@media (max-width: 800px) {
  body:has(.member-view) .site-header .header-inner { height: auto; min-height: 0; padding: 12px 0; }
  .hub-table thead { display: none; }
  .hub-table .col-label { display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(0, 24, 64, 0.55); }
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

function networkFooter(brand) {
  if (!brand) return "";
  return `<footer class="hub-foot">
    <p class="hub-links"><a href="${escapeHtml(brand.site)}">${escapeHtml(brand.siteLabel)}</a><a href="${escapeHtml(brand.facebook)}" target="_blank" rel="noopener noreferrer">Facebook group</a></p>
  </footer>`;
}

function pwaHead(brand) {
  if (!brand || !PWA_SHORT_NAMES[brand.id]) return "";
  return `<link rel="manifest" href="${pwaManifestPath(brand.id)}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(PWA_SHORT_NAMES[brand.id])}">
  <link rel="apple-touch-icon" href="${pwaAppleTouchPath(brand.id)}">`;
}

function shell({ title, body, session, admin, network, also, header, mainClass = "", bare = false }) {
  const brand = network ? networkById(network) : null;
  const mode = header || (brand ? "network" : admin ? "admin" : "plain");
  const adminLinks = admin ? `<a href="/admin">Applications</a><a href="/admin/issues">Flagged issues</a><a href="/admin/members">Members</a><a href="/admin/content">Content</a>` : "";
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
    const signOut = session
      ? `<form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="sign-out" type="submit">Sign out</button></form>`
      : "";
    links = session
      ? `<a class="hub-label" href="/hub/${brand.id}">Member Hub</a><a class="header-link" href="/hub/${brand.id}/profile">Profile</a>${adminLinks}${signOut}`
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
  const switchLine = mode === "network" ? alsoLine(also) : "";
  const main = bare
    ? body
    : `<main id="content" class="container hub-main${mainClass ? ` ${mainClass}` : ""}">${body}${mode === "network" ? networkFooter(brand) : ""}</main>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#f6f3ec">
  <link rel="icon" href="/favicon.png" type="image/png">
  ${pwaHead(brand)}
  <link rel="stylesheet" href="/styles.css">
  <style>${CSS}${HUB_HOME_CSS}</style>
</head>
<body${accent}>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="container header-inner">
      ${brandHtml}
      <nav class="hub-nav" aria-label="Account">${links}</nav>
    </div>
    ${switchLine ? `<div class="container header-also">${switchLine}</div>` : ""}
  </header>
  ${main}
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
  return `<article class="card post-read">
    <p class="eyebrow">${escapeHtml(networkName)} · ${escapeHtml(item.type)}</p>
    <h1>${escapeHtml(item.title)}</h1>
    <p class="meta">${item.published_at ? `Published ${escapeHtml(formatWhen(item.published_at))}` : "Draft"}</p>
    ${imageTag(item)}
    ${item.description ? `<p class="lede">${escapeHtml(item.description)}</p>` : ""}
    ${link ? `<p><a class="text-link" href="${escapeHtml(link)}" rel="noopener noreferrer">${escapeHtml(link)}</a></p>` : ""}
    <div class="prose">${renderMarkdown(item.body || "")}</div>
  </article>`;
}

export const WELCOME_COPY = {
  heading: "Welcome. We're glad you're here.",
  opening: "We're a brand new organization, and we're working hard to reach our first 500 members. Thank you for being one of them. This is your member hub. As we grow, we'll use it to share updates, resources, and issue pages with members.",
  networks: {
    business: "Walton County Business Leaders is here so local owners, operators, and executives have a meaningful voice in the decisions shaping our county's future. We are more than a networking organization. We advocate on taxes, fees, regulations, infrastructure, government spending, and economic development, and we work for a stronger business community and a stronger Walton County.",
    builders: "Walton County Builders Network gives the professionals who build, develop, sell, improve, and maintain Walton County a unified voice. We support responsible growth and transparent, consistent, and predictable government processes, and we give industry professionals an organized forum to raise concerns and recommend practical improvements.",
    tourism: "Walton County Tourism Network is an independent advocacy group for businesses that depend on tourism. We promote policies that support a thriving visitor economy, and we advocate for responsible investments, fair regulations, and a strong business environment that benefits residents, visitors, and local businesses alike.",
  },
  closingLead: "We'll share current issues, documents, and our positions here as they're ready. In the meantime, two things help a lot:",
  closing: "We'll share current issues, documents, and our positions here as they're ready. In the meantime, two things help a lot: invite others who belong here, and join the conversation in our Facebook group.",
};

export const FLAG_PROMPT = "Something happening in Walton County that the network should weigh in on? Let us know.";
export const FLAG_THANKS = "Thanks, we'll look into it.";

function welcomeSection(network) {
  const brand = networkById(network);
  const paragraph = WELCOME_COPY.networks[network];
  if (!brand || !paragraph) return "";
  const invite = `<a class="text-link" href="${escapeHtml(brand.join)}">invite others</a>`;
  const facebook = `<a class="text-link" href="${escapeHtml(brand.facebook)}" target="_blank" rel="noopener">our Facebook group</a>`;
  return `<section class="welcome" aria-labelledby="welcome-heading">
    <h2 id="welcome-heading">${escapeHtml(WELCOME_COPY.heading)}</h2>
    <p>${escapeHtml(WELCOME_COPY.opening)}</p>
    <p>${escapeHtml(paragraph)}</p>
    <p>${escapeHtml(WELCOME_COPY.closingLead)} ${invite} who belong here, and join the conversation in ${facebook}.</p>
  </section>`;
}

const FLAG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;
const INVITE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.1"/><path d="M4 19c.3-2.8 2.4-4.4 5-4.4s4.7 1.6 5 4.4"/><path d="M17 8v6M14 11h6"/></svg>`;
const PHONE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><line x1="11" y1="18.5" x2="13" y2="18.5"/></svg>`;
const SHARE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.15"/><circle cx="6" cy="12" r="2.15"/><circle cx="18" cy="19" r="2.15"/><path d="M8.05 10.85 15.7 6.4M8.05 13.15 15.7 17.6"/></svg>`;
const FACEBOOK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14 13.5h2.75l.42-2.88H14V8.79c0-.79.22-1.33 1.35-1.33H17.5V4.82A18.3 18.3 0 0 0 14.86 4C12.15 4 10.25 5.66 10.25 8.45v2.17H7.5v2.88h2.75V20h3.75z"/></svg>`;
const LINKEDIN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g transform="translate(4 4) scale(0.0357143)"><path fill="currentColor" d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z"/></g></svg>`;
const LINKEDIN_URL = "https://www.linkedin.com/company/walton-county-business-leaders";

function earnLine(text) {
  if (!text) return "";
  return `<p class="points-earn">${escapeHtml(text)}</p>`;
}

function actionCard({ href, title, body, icon, primary = false, external = false, earn = "" }) {
  const extra = external ? ` target="_blank" rel="noopener noreferrer"` : "";
  const klass = primary ? "action-card primary" : "action-card";
  return `<a class="${klass}" href="${escapeHtml(href)}"${extra}>
    <span class="action-icon">${icon}</span>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(body)}</p>
    ${earnLine(earn)}
  </a>`;
}

function actionButton({ title, body, icon, dialog, extraClass = "", earn = "" }) {
  const klass = extraClass ? `action-card ${extraClass}` : "action-card";
  return `<button type="button" class="${klass}" data-open-dialog="${escapeHtml(dialog)}">
    <span class="action-icon">${icon}</span>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(body)}</p>
    ${earnLine(earn)}
  </button>`;
}

function installDialog() {
  return `<dialog id="install-dialog" class="contact-dialog hub-dialog" aria-labelledby="install-dialog-title">
    <div class="contact-dialog-inner">
      <div class="contact-dialog-head">
        <div>
          <p class="eyebrow">Member Hub</p>
          <h2 id="install-dialog-title">${escapeHtml(ACTION_COPY.appTitle)}</h2>
        </div>
        <button type="button" class="contact-close" data-close-dialog>Close</button>
      </div>
      <p>${escapeHtml(ACTION_COPY.appBody)}</p>
      <p class="install-note">On a computer, choose Install if your browser offers it. On a phone, follow the steps for your device.</p>
      <p class="install-actions"><button type="button" class="button" id="install-app-button" hidden>Install</button></p>
      <div class="install-steps-list">
        <section class="install-steps" data-platform="ios">
          <h3>iPhone and iPad</h3>
          <p>Open this page in Safari. On iPhone it must be opened in Safari.</p>
          <ol>
            <li>Tap the Share button.</li>
            <li>Tap Add to Home Screen.</li>
            <li>Tap Add.</li>
          </ol>
        </section>
        <section class="install-steps" data-platform="android">
          <h3>Android</h3>
          <p>Open this page in Chrome.</p>
          <ol>
            <li>Tap the menu (three dots).</li>
            <li>Tap Install app or Add to Home screen.</li>
          </ol>
        </section>
      </div>
    </div>
  </dialog>`;
}

function inviteDialog(network, referralCode = "") {
  const share = inviteShare(network, referralCode);
  if (!share) return "";
  const ios = smsHref("ios", share.message);
  const android = smsHref("android", share.message);
  return `<dialog id="invite-dialog" class="contact-dialog hub-dialog" aria-labelledby="invite-dialog-title">
    <div class="contact-dialog-inner">
      <div class="contact-dialog-head">
        <div>
          <p class="eyebrow">Member Hub</p>
          <h2 id="invite-dialog-title">${escapeHtml(ACTION_COPY.inviteTitle)}</h2>
        </div>
        <button type="button" class="contact-close" data-close-dialog>Close</button>
      </div>
      <p class="invite-message">${escapeHtml(share.message)}</p>
      <div class="share-actions">
        <a class="button secondary" id="invite-text" href="${escapeHtml(android)}" data-ios="${escapeHtml(ios)}" data-android="${escapeHtml(android)}">Text</a>
        <a class="button secondary" href="${escapeHtml(emailHref(share))}">Email</a>
        <a class="button secondary" href="${escapeHtml(facebookHref(share.url))}" target="_blank" rel="noopener">Facebook</a>
        <a class="button secondary" href="${escapeHtml(linkedinHref(share.url))}" target="_blank" rel="noopener">LinkedIn</a>
        <a class="button secondary" href="${escapeHtml(xHref(share))}" target="_blank" rel="noopener">X</a>
        <button type="button" class="button secondary" id="invite-copy" data-url="${escapeHtml(share.url)}">Copy link</button>
        <button type="button" class="button secondary" id="invite-more" data-title="${escapeHtml(share.subject)}" data-text="${escapeHtml(share.message)}" data-url="${escapeHtml(share.url)}" hidden>More</button>
      </div>
      <p id="invite-copied" class="invite-copied" role="status" hidden>Copied</p>
    </div>
  </dialog>`;
}

function socialLinkRow(kind, href, name, done, points) {
  const linkedin = kind === "linkedin";
  const label = done
    ? (linkedin ? "Followed on LinkedIn" : "Followed on Facebook")
    : (linkedin ? "I followed on LinkedIn" : "I followed on Facebook");
  return `<div class="social-row">
      <a class="button secondary" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>
      <span class="social-meta">
        <button type="button" class="follow-button" data-follow="${kind}" data-points="${escapeHtml(String(points))}"${done ? " disabled" : ""}>${escapeHtml(label)}</button>
        <span class="follow-status" data-follow-status role="status"></span>
      </span>
    </div>`;
}

function socialCard(network, points) {
  const brand = networkById(network);
  if (!brand) return "";
  const summary = points || emptyPoints();
  return `<article class="action-card social-card">
    <span class="action-icon">${SHARE_ICON}</span>
    <h2>${escapeHtml(ACTION_COPY.socialTitle)}</h2>
    <p>${escapeHtml(ACTION_COPY.socialBody)}</p>
    ${earnLine(actionEarnText("social"))}
    <div class="social-actions">
      ${socialLinkRow("facebook", brand.facebook, "Facebook", summary.followedFacebook, POINT_VALUES.facebook)}
      ${socialLinkRow("linkedin", brand.linkedin, "LinkedIn", summary.followedLinkedin, POINT_VALUES.linkedin)}
    </div>
  </article>`;
}

function pointsPanel(network, session, points) {
  const summary = points || emptyPoints();
  return `<section class="points-panel" id="hub-points" data-network="${escapeHtml(network)}" data-csrf="${escapeHtml(session?.csrf || "")}" data-installed="${summary.installed ? "1" : "0"}" aria-labelledby="points-heading">
    <h2 id="points-heading">Your points: <span data-points-total>${escapeHtml(String(summary.total || 0))}</span></h2>
    <p data-points-breakdown>${escapeHtml(pointsBreakdown(summary))}</p>
    <p>${escapeHtml(POINTS_EARN)}</p>
  </section>`;
}

function prioritySection(network) {
  const block = HUB_PRIORITIES[network];
  if (!block?.items?.length) return "";
  const items = block.items.map(([title, body], index) => `<li class="priority">
    <span class="priority-num" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
    <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>
  </li>`).join("");
  return `<section aria-labelledby="priorities-heading">
    <div class="section-heading">
      <p class="eyebrow">What we stand for</p>
      <h2 id="priorities-heading">What we're working on</h2>
      <p class="section-note">${escapeHtml(block.note)}</p>
    </div>
    <ol class="priority-list">${items}</ol>
  </section>`;
}

function postIsLong(item) {
  const body = String(item.body || "");
  const plain = postPlainText(body);
  const description = String(item.description || "").trim();
  return plain.length > 280 || description.length > 280 || body.split("\n").filter((line) => line.trim()).length > 8;
}

function latestCard(item, network) {
  const href = `/hub/${escapeHtml(network)}/${escapeHtml(item.slug)}`;
  const long = postIsLong(item);
  const plain = postPlainText(item.description || item.body || "");
  const excerpt = clipText(plain, 280);
  const link = safeUrl(item.link_url);
  const bodyHtml = long
    ? `${excerpt ? `<p class="excerpt">${escapeHtml(excerpt)}</p>` : ""}<a class="text-link" href="${href}">Read more</a>`
    : `${item.description ? `<p class="excerpt">${escapeHtml(item.description)}</p>` : ""}<div class="prose">${renderMarkdown(item.body || "")}</div>${link ? `<p><a class="text-link" href="${escapeHtml(link)}" rel="noopener noreferrer">Open resource</a></p>` : ""}`;
  return `<article class="post-card">
    ${imageTag(item)}
    <p class="meta">${item.pinned ? `<span class="pill">Pinned</span>` : ""}${item.published_at ? escapeHtml(formatWhen(item.published_at)) : ""}</p>
    <h3><a href="${href}">${escapeHtml(item.title)}</a></h3>
    ${bodyHtml}
  </article>`;
}

function welcomeCard(network) {
  const brand = networkById(network);
  const paragraph = WELCOME_COPY.networks[network];
  if (!brand || !paragraph) return "";
  const excerpt = welcomeExcerpt(paragraph);
  return `<article class="post-card">
    <h3><a href="/hub/${escapeHtml(network)}/welcome">Welcome from ${escapeHtml(brand.name)}</a></h3>
    <p class="excerpt">${escapeHtml(excerpt)}</p>
    <a class="text-link" href="/hub/${escapeHtml(network)}/welcome">Read more</a>
  </article>`;
}

function latestSection(network, posts) {
  const cards = posts.map((item) => latestCard(item, network)).join("");
  const welcome = welcomeCard(network);
  if (!cards && !welcome) return "";
  return `<section class="latest" aria-labelledby="latest-heading">
    <div class="section-heading">
      <p class="eyebrow">Pages and posts</p>
      <h2 id="latest-heading">Latest</h2>
    </div>
    ${cards}${welcome}
  </section>`;
}

function issueSidebar(network, issues) {
  const rows = (issues || []).length
    ? `<ul class="issue-list">${issues.map((issue) => `<li><span class="my-issue-title">${escapeHtml(issue.title)}</span><span class="meta">${escapeHtml(formatWhen(issue.created_at))} · ${escapeHtml(issueStatusLabel(issue.status))}</span></li>`).join("")}</ul>`
    : `<p class="empty-state">None yet</p>`;
  return `<section class="side-panel">
    <h2>Your flagged issues</h2>
    ${rows}
    <a class="text-link" href="/hub/${escapeHtml(network)}/flag">${escapeHtml(ACTION_COPY.flagLink)}</a>
  </section>`;
}

function profileSidebar(network, profile) {
  const name = String(profile?.name || "").trim();
  const company = String(profile?.company || "").trim() || String(profile?.role_title || "").trim();
  return `<section class="side-panel">
    <h2>Your profile</h2>
    ${name ? `<p class="profile-name">${escapeHtml(name)}</p>` : ""}
    ${company ? `<p class="profile-company">${escapeHtml(company)}</p>` : ""}
    <a class="text-link" href="/hub/${escapeHtml(network)}/profile">Edit profile</a>
  </section>`;
}

function contactDialog() {
  return `<div id="contact-dialog" class="contact-dialog" popover>
    <div class="contact-dialog-inner">
      <div class="contact-dialog-head">
        <div>
          <p class="eyebrow">Get in touch</p>
          <h2>Contact us</h2>
        </div>
        <button type="button" class="contact-close" popovertarget="contact-dialog" popovertargetaction="hide">Close</button>
      </div>
      <p>Have a question or want to learn more? Send us a message.</p>
      <form class="contact-form" action="/contact" method="post">
        <label>Name<input type="text" name="name" required autocomplete="name"></label>
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label class="hp-field" aria-hidden="true">Company<input type="text" name="company_fax" tabindex="-1" autocomplete="off"></label>
        <label>Message<textarea name="message" rows="5" required></textarea></label>
        <button class="button" type="submit">Send message</button>
      </form>
    </div>
  </div>`;
}

function memberFooter(brand) {
  if (!brand) return "";
  const block = HUB_PRIORITIES[brand.id];
  if (!block?.tagline) return "";
  return `<footer class="footer member-footer">
    <div class="container">
      <div class="footer-top">
        <p class="closing">${escapeHtml(block.tagline)}</p>
        <button type="button" class="button" popovertarget="contact-dialog">Contact</button>
      </div>
      ${contactDialog()}
      <div class="footer-bottom">
        <span><a href="${escapeHtml(brand.site)}">${escapeHtml(brand.name)}</a> · Walton County, Florida</span>
        <span class="footer-socials">
          <a class="footer-social" href="${escapeHtml(brand.facebook)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(brand.name)} Facebook group">${FACEBOOK_ICON}</a>
          <a class="footer-social" href="${LINKEDIN_URL}" target="_blank" rel="noopener noreferrer" aria-label="Walton County Business Leaders on LinkedIn">${LINKEDIN_ICON}</a>
        </span>
      </div>
    </div>
  </footer>`;
}

export function renderWelcome({ session, admin, network, also = [] }) {
  const brand = networkById(network);
  const name = brand?.name || networkLabel(network);
  return shell({
    title: `Welcome from ${name}`,
    session,
    admin,
    network,
    also,
    body: `${welcomeSection(network)}<p><a class="text-link" href="/hub/${escapeHtml(network)}">Back to the hub</a></p>`,
  });
}

export function renderNetworkHub({ session, admin, network, top = [], resources = [], stories = [], posts, also = [], issues = [], flagged = false, profile = {}, referralCode = "", points = null }) {
  const brand = networkById(network);
  const name = brand?.name || networkLabel(network);
  const source = Array.isArray(posts) ? posts : [...top, ...resources, ...stories];
  const visible = postsForHub(source, network);
  const displayName = String(profile.name || "").trim();
  const priorities = prioritySection(network);
  const latest = latestSection(network, visible);
  return shell({
    title: `${name} hub`,
    session,
    admin,
    network,
    also,
    bare: true,
    body: `<div class="member-home" id="content">
      <section class="hub-hero">
        <div class="hub-hero-photo" style="background-image:url('${HERO_PHOTO}')" role="img" aria-label="South Walton shoreline at sunset"></div>
        <div class="hub-hero-overlay"></div>
        <div class="container hub-hero-inner">
          <div class="hub-hero-copy">
            <p class="eyebrow">Member Hub</p>
            <h1>${escapeHtml(welcomeHeading(displayName))}</h1>
            <p class="hub-hero-sub">${escapeHtml(HERO_LINE)}</p>
          </div>
          ${brand ? `<img class="hub-hero-seal ${brand.mark}" src="${brand.logo}" alt="${escapeHtml(brand.name)} logo" width="168" height="168">` : ""}
        </div>
      </section>
      <div class="container actions-wrap">
        <div class="action-grid">
          ${actionCard({ href: `/hub/${network}/flag`, title: ACTION_COPY.flagTitle, body: FLAG_PROMPT, icon: FLAG_ICON, primary: true })}
          ${brand ? actionButton({ title: ACTION_COPY.inviteTitle, body: ACTION_COPY.inviteBody, icon: INVITE_ICON, dialog: "invite-dialog", earn: actionEarnText("referral") }) : ""}
          ${socialCard(network, points)}
          ${actionButton({ title: ACTION_COPY.appTitle, body: ACTION_COPY.appBody, icon: PHONE_ICON, dialog: "install-dialog", extraClass: "install-card", earn: actionEarnText("install") })}
        </div>
        ${pointsPanel(network, session, points)}
      </div>
      <div class="member-main">
        <div class="container hub-layout">
          <div class="hub-col">
            ${flagged ? notice(FLAG_THANKS) : ""}
            ${priorities}
            ${latest}
          </div>
          <aside class="side-stack">
            ${issueSidebar(network, issues)}
            ${profileSidebar(network, profile)}
          </aside>
        </div>
      </div>
      ${memberFooter(brand)}
      ${installDialog()}
      ${brand ? inviteDialog(network, referralCode) : ""}
      <script>${HUB_HOME_SCRIPT}</script>
    </div>`,
  });
}

export function renderMemberItem({ session, admin, item, also = [], network }) {
  const shown = network || item.network;
  const name = networkById(shown)?.name || networkById(item.network)?.name || "";
  return shell({
    title: name ? `${item.title} · ${name}` : item.title,
    session,
    admin,
    network: shown,
    also,
    body: `<p><a class="text-link" href="/hub/${escapeHtml(shown)}">Back to the hub</a></p>${renderItemArticle(item)}`,
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

function extraNetworkLabels(applied, networks) {
  const have = new Set(Array.isArray(networks) ? networks : String(networks || "").split(",").map((item) => item.trim()).filter(Boolean));
  return NETWORK_IDS.filter((id) => id !== applied && have.has(id)).map((id) => networkLabel(id)).filter(Boolean);
}

function loginLine(logins = {}) {
  const count = Number(logins.login_count) || 0;
  return `<p class="meta">Logins: ${escapeHtml(String(count))}</p>
        <p class="meta">Last login: ${escapeHtml(formatLoginWhen(logins.last_login_at))}</p>`;
}

function networkMembershipCell(row) {
  const primary = escapeHtml(networkLabel(row.network));
  if (row.status !== "approved") return primary;
  const extras = extraNetworkLabels(row.network, row.member_networks);
  if (!extras.length) return primary;
  return `${primary}<div class="meta">Also added: ${escapeHtml(extras.join(", "))}</div>`;
}

export function renderApplications({ session, network, status, rows, mailerNote }) {
  const option = (value, current, label) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>
        <td data-label="Name"><a class="text-link" href="/admin/applications/${escapeHtml(row.id)}">${escapeHtml(row.name)}</a><div class="meta">${escapeHtml(row.email)}</div></td>
        <td>${networkMembershipCell(row)}</td>
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

function networkChecks(applied, memberNetworks = []) {
  const member = new Set(memberNetworks || []);
  return networkList().map((item) => {
    const locked = item.id === applied;
    const isMember = member.has(item.id);
    const box = locked
      ? `<input type="checkbox" name="networks" value="${item.id}" checked disabled><input type="hidden" name="networks" value="${item.id}">`
      : `<input type="checkbox" name="networks" value="${item.id}"${isMember ? " checked" : ""}>`;
    const note = locked
      ? ` <span class="meta">Applied network</span>`
      : (isMember ? ` <span class="meta">Member</span>` : "");
    return `<label>${box} ${escapeHtml(item.name)}${note}</label>`;
  }).join("");
}

export function renderApplicationDetail({ session, application, fields, notes = [], message, noteDraft = "", notesReady = true, memberNetworks = [], logins = {}, referrerName = "" }) {
  const applied = networkById(application.network);
  const actions = `<form method="post" action="/admin/applications/${escapeHtml(application.id)}/approve">
      <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
      <fieldset class="check-list">
        <legend>Networks</legend>
        <p class="meta">This application is for ${escapeHtml(applied?.name || "this network")}. That network stays included. Check every other network this person should belong to. Unchecking a network removes it.</p>
        ${networkChecks(application.network, memberNetworks)}
      </fieldset>
      <button class="button" type="submit">${application.status === "approved" ? "Save networks" : "Approve"}</button>
    </form>
    <form method="post" action="/admin/applications/${escapeHtml(application.id)}/deny">
      <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
      <button class="button secondary" type="submit">Deny</button>
    </form>`;
  const network = networkLabel(application.network);
  const also = application.status === "approved" ? extraNetworkLabels(application.network, memberNetworks) : [];
  const alsoLine = also.length ? `<p class="meta">Also added: ${escapeHtml(also.join(", "))}</p>` : "";
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
        ${alsoLine}
        <p class="meta">Submitted ${escapeHtml(formatWhen(application.submitted_at))}</p>
        <p class="meta">${emailHtml}</p>
        ${referrerName ? `<p class="meta">Referred by ${escapeHtml(referrerName)}</p>` : ""}
        ${loginLine(logins)}
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

function memberSortLink(label, sort, current) {
  const href = sort === "name" ? "/admin/members" : `/admin/members?sort=${sort}`;
  const currentAttr = sort === current ? ` aria-current="true"` : "";
  return `<a class="text-link" href="${href}"${currentAttr}>${escapeHtml(label)}</a>`;
}

export function renderMembers({ session, rows, sort = "name", message = "" }) {
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>
        <td><a class="text-link" href="/admin/members/${escapeHtml(row.id)}">${escapeHtml(row.display_name)}</a><div class="meta">${escapeHtml(row.email)}</div></td>
        <td>${row.networks.map((network) => `<span class="pill">${escapeHtml(networkLabel(network))}</span>`).join(" ")}</td>
        <td><span class="col-label">Logins</span>${escapeHtml(String(Number(row.login_count) || 0))}</td>
        <td><span class="col-label">Last login</span>${escapeHtml(formatLoginWhen(row.last_login_at))}</td>
        <td><span class="col-label">Points</span>${escapeHtml(String(Number(row.points) || 0))}</td>
      </tr>`).join("")
    : `<tr><td colspan="5">No approved members yet.</td></tr>`;
  return shell({
    title: "Members · Walton County Business Leaders",
    session,
    admin: true,
    body: `<p class="eyebrow">Admin</p><h1>Members</h1>
      ${notice(message)}
      <p class="lede">Approved members and the networks on their account. Logins count each successful sign-in. Points are that member's own total.</p>
      <table class="hub-table"><thead><tr><th>${memberSortLink("Member", "name", sort)}</th><th>Networks</th><th>${memberSortLink("Logins", "logins", sort)}</th><th>${memberSortLink("Last login", "last", sort)}</th><th>Points</th></tr></thead><tbody>${bodyRows}</tbody></table>`,
  });
}

const PROFILE_ROWS = [
  ["name", "Name"],
  ["company", "Business or company"],
  ["role_title", "Role or title"],
  ["phone", "Phone"],
  ["location", "Location"],
  ["website", "Website"],
  ["bio", "Bio"],
];

function sameAccount(session, member) {
  return String(session?.email || "").trim().toLowerCase() === String(member?.email || "").trim().toLowerCase();
}

function profileText(key, value) {
  const raw = String(value ?? "");
  return key === "bio" ? raw.replace(/\r\n/g, "\n").trim() : raw.trim();
}

function profileValueHtml(key, value) {
  const text = profileText(key, value);
  if (!text) return "";
  if (key === "phone") {
    const display = phoneDisplay(text);
    const href = phoneHref(text);
    return href ? `<a class="text-link" href="${escapeHtml(href)}">${escapeHtml(display)}</a>` : escapeHtml(display);
  }
  if (key === "website") {
    const href = externalUrl(text);
    if (!href) return escapeHtml(text);
    return `<a class="text-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
  }
  return escapeHtml(text);
}

function kvGrid(rows) {
  if (!rows.length) return "";
  return `<dl class="kv-grid">${rows.map(([label, value]) => `<div class="kv-row"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}

function memberContact(email, phone) {
  const parts = [];
  const mail = String(email || "").trim();
  if (mail) {
    parts.push(isEmail(mail)
      ? `<a class="text-link" href="mailto:${escapeHtml(mail)}">${escapeHtml(mail)}</a>`
      : escapeHtml(mail));
  }
  const rawPhone = String(phone || "").trim();
  if (rawPhone) {
    const display = phoneDisplay(rawPhone);
    const href = phoneHref(rawPhone);
    parts.push(href
      ? `<a class="text-link" href="${escapeHtml(href)}">${escapeHtml(display)}</a>`
      : escapeHtml(display));
  }
  return parts.length ? `<p class="member-contact">${parts.join("")}</p>` : "";
}

function memberAnswerList(fields) {
  const entries = orderedResponses(fields);
  if (!entries.length) return `<p class="member-missing">No answers were stored.</p>`;
  const rows = entries.map(([key, value]) => [responseLabel(key), escapeHtml(value == null ? "" : String(value))]);
  return `<details class="app-answers"><summary>Answers</summary>${kvGrid(rows)}</details>`;
}

function profileEditor({ action, session, profile, fields }) {
  const rows = (fields || []).map((field, index) => `<div class="field-row">
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
  return `<form class="stack" method="post" action="${action}">
    <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
    ${form("name", "Name", profile.name, 'maxlength="120" autocomplete="name"')}
    ${form("company", "Business or company", profile.company, 'maxlength="160" autocomplete="organization"')}
    ${form("role_title", "Role or title", profile.role_title, 'maxlength="120" autocomplete="organization-title"')}
    ${form("phone", "Phone", profile.phone, 'maxlength="40" autocomplete="tel"')}
    ${form("location", "Location", profile.location, 'maxlength="120"')}
    ${form("website", "Website", profile.website, 'maxlength="300" autocomplete="url"')}
    <label>Short bio<textarea name="bio" maxlength="2000">${escapeHtml(profile.bio || "")}</textarea></label>
    <h2>Custom fields</h2>
    <p>Add up to 20 label and value pairs. Labels can be 60 characters. Values can be 1,000.</p>
    ${rows}${blanks}
    <button class="button" type="submit">Save profile</button>
  </form>`;
}

export function renderMemberDetail({ session, member, profile, fields, applications, notes, applicationNotes = [], message, logins = {}, points = null }) {
  const filled = [];
  const missing = [];
  for (const [key, label] of PROFILE_ROWS) {
    const html = profileValueHtml(key, profile?.[key]);
    if (html) filled.push([label, html]);
    else missing.push(label);
  }
  const missingLine = missing.length ? `<p class="member-missing">Not provided: ${escapeHtml(missing.join(", "))}</p>` : "";
  const custom = fields.length
    ? `<h2>Custom fields</h2><section class="card">${kvGrid(fields.map((field) => [field.label, escapeHtml(field.value ?? "")]))}</section>`
    : "";
  const apps = applications.length
    ? applications.map((application) => `<section class="card app-card">
        <div class="app-line">
          <span class="app-network">${escapeHtml(networkLabel(application.network) || String(application.network || "Application"))}</span>
          ${statusPill(application.status)}
          <span class="meta">${escapeHtml(formatWhen(application.submitted_at))}</span>
          <a class="text-link" href="/admin/applications/${escapeHtml(application.id)}">Open application</a>
        </div>
        ${memberAnswerList(application.fields)}
      </section>`).join("")
    : `<p class="member-missing">No applications are stored for this email.</p>`;
  const tags = member.networks.map((network) => `<span class="pill">${escapeHtml(networkLabel(network))}</span>`).join("");
  const carried = applicationNotes.length
    ? `<p class="note-heading">From applications</p>${renderNoteList(applicationNotes)}`
    : "";
  const remove = sameAccount(session, member)
    ? ""
    : `<a class="button danger" href="/admin/members/${escapeHtml(member.id)}/delete">Delete member</a>`;
  return shell({
    title: `${member.display_name} · Member`,
    session,
    admin: true,
    mainClass: "member-view",
    body: `<p class="eyebrow">Member</p><h1>${escapeHtml(member.display_name)}</h1>
      ${notice(message)}
      <div class="member-meta">
        ${memberContact(member.email, profile?.phone)}
        ${tags ? `<div class="member-tags">${tags}</div>` : ""}
      </div>
      ${loginLine(logins)}
      <p class="meta">Points: ${escapeHtml(String((points || emptyPoints()).total || 0))}</p>
      <p class="meta">${escapeHtml(pointsBreakdown(points || emptyPoints()))}</p>
      <div class="member-actions">
        <a class="button" href="/admin/members/${escapeHtml(member.id)}/edit">Edit profile</a>
        ${remove}
      </div>
      <h2>Profile</h2>
      <section class="card">${kvGrid(filled)}${missingLine}</section>
      ${custom}
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

export function renderMemberEdit({ session, member, profile, fields, message }) {
  return shell({
    title: `Edit profile · ${member.display_name}`,
    session,
    admin: true,
    mainClass: "member-view",
    body: `<p class="eyebrow">Member</p><h1>Edit profile</h1>
      ${notice(message)}
      <p class="meta">${escapeHtml(member.display_name)}</p>
      ${memberContact(member.email, "")}
      <p class="meta">Email stays as it is. Sign-in uses this address.</p>
      <p class="meta"><a class="text-link" href="/admin/members/${escapeHtml(member.id)}">Back to member</a></p>
      ${profileEditor({
        action: `/admin/members/${escapeHtml(member.id)}/edit`,
        session,
        profile,
        fields,
      })}`,
  });
}

export function renderMemberDelete({ session, member, message }) {
  return shell({
    title: `Delete member · ${member.display_name}`,
    session,
    admin: true,
    mainClass: "member-view",
    body: `<p class="eyebrow">Member</p><h1>Delete member</h1>
      ${notice(message)}
      <p>This removes ${escapeHtml(member.display_name)} (${escapeHtml(member.email)}) from the hub. The profile, network memberships, sign-in sessions, and flagged issues are deleted. Applications stay on file and are marked denied so they no longer grant membership.</p>
      <p class="meta">Type the email address to confirm. This cannot be undone.</p>
      <form class="stack" method="post" action="/admin/members/${escapeHtml(member.id)}/delete">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>Email<input name="confirm_email" type="email" autocomplete="off" required value=""></label>
        <button class="button danger" type="submit">Delete member</button>
      </form>
      <p class="meta"><a class="text-link" href="/admin/members/${escapeHtml(member.id)}">Back to member</a></p>`,
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
  const hasImage = Boolean(!isNew && item.image_key);
  const imagePreview = hasImage ? imageTag(item) : "";
  const removeImage = hasImage
    ? `<form method="post" action="/admin/content/${escapeHtml(item.id)}/image/remove"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="button secondary" type="submit">Remove image</button></form>`
    : "";
  const fileLabel = hasImage ? "Replace image" : "Featured image";
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
      <form class="stack" method="post" action="${action}" enctype="multipart/form-data">
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
        <p class="meta">Write plain text or Markdown. Raw HTML is shown as text, not run. A paragraph that starts with Photo: is shown as small print. Start any other paragraph with ^ and a space for the same small print.</p>
        <label>Pin this item<input type="checkbox" name="pinned" value="1"${item.pinned ? " checked" : ""}></label>
        <label>Show on all networks<input type="checkbox" name="share_all" value="1"${item.share_all ? " checked" : ""}></label>
        <p class="meta">Checked items appear in Latest for every network. Leave it unchecked to keep this item on the network above.</p>
        <h2>Featured image</h2>
        ${imagePreview}
        <label>${fileLabel}<input type="file" name="image" accept="image/jpeg,image/png,image/webp"></label>
        <label>Image description<input name="image_alt" maxlength="180" value="${escapeHtml(item.image_alt || "")}"${hasImage ? " required" : ""}></label>
        <button class="button" type="submit">${isNew ? "Save draft" : "Save"}</button>
      </form>
      ${removeImage}`,
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

function issueField(label, value) {
  const text = String(value ?? "").trim();
  return `<div class="response-item"><dt>${escapeHtml(label)}</dt><dd>${text ? escapeHtml(text) : `<span class="response-empty">Not provided</span>`}</dd></div>`;
}

export function renderFlagForm({ session, admin, network, also = [], draft = {}, message = "" }) {
  const brand = networkById(network);
  const name = brand?.name || networkLabel(network);
  const checked = draft.contact_ok ? " checked" : "";
  return shell({
    title: `Flag an Issue · ${name}`,
    session,
    admin,
    network,
    also,
    body: `<p class="eyebrow">${escapeHtml(name)}</p><h1>Flag an Issue</h1>
      <p class="lede">${escapeHtml(FLAG_PROMPT)}</p>
      ${notice(message)}
      <form class="stack" method="post" action="/hub/${escapeHtml(network)}/flag" enctype="multipart/form-data">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>What's the issue?<input name="title" maxlength="160" required value="${escapeHtml(draft.title || "")}"></label>
        <label>What's happening?<textarea name="body" maxlength="8000" required>${escapeHtml(draft.body || "")}</textarea></label>
        <label>Where is it?<input name="where" maxlength="300" value="${escapeHtml(draft.where_text || "")}" placeholder="Address, road, or countywide"></label>
        <label>Is there a meeting or deadline coming up?<input type="date" name="deadline" value="${escapeHtml(draft.deadline || "")}"></label>
        <label>Links or documents<input name="link_url" maxlength="500" value="${escapeHtml(draft.link_url || "")}" placeholder="https://example.com" inputmode="url"></label>
        <label>Files<input type="file" name="files" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,application/pdf,image/jpeg,image/png,image/webp,image/gif,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label>
        <p class="meta">PDF, images, or Word documents. Up to 5 files, 10 MB each.</p>
        <label>How does it affect you or your business?<textarea name="effect" maxlength="4000">${escapeHtml(draft.effect || "")}</textarea></label>
        <fieldset class="check-list">
          <label><input type="checkbox" name="contact_ok" value="1"${checked}> OK to contact me about this</label>
        </fieldset>
        <button class="button" type="submit">Send</button>
      </form>`,
  });
}

export function renderFlaggedIssues({ session, rows }) {
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>
        <td><span class="pill">${escapeHtml(networkLabel(row.network))}</span></td>
        <td>${escapeHtml(row.display_name || "")}<div class="meta">${escapeHtml(row.email || "")}</div></td>
        <td><a class="text-link" href="/admin/issues/${escapeHtml(row.id)}">${escapeHtml(row.title)}</a></td>
        <td>${escapeHtml(formatWhen(row.created_at))}</td>
        <td><span class="pill">${escapeHtml(issueStatusLabel(row.status))}</span></td>
      </tr>`).join("")
    : `<tr><td colspan="5">No flagged issues yet.</td></tr>`;
  return shell({
    title: "Flagged issues · Walton County Business Leaders",
    session,
    admin: true,
    body: `<p class="eyebrow">Admin</p><h1>Flagged issues</h1>
      <p class="lede">Issues members sent from their network hub.</p>
      <table class="hub-table"><thead><tr><th>Network</th><th>Member</th><th>Title</th><th>Date</th><th>Status</th></tr></thead><tbody>${bodyRows}</tbody></table>`,
  });
}

export function renderFlaggedIssue({ session, issue, files = [], message = "" }) {
  const options = ISSUE_STATUSES.map((item) => `<option value="${item.id}"${item.id === issue.status ? " selected" : ""}>${item.label}</option>`).join("");
  const fileList = files.length
    ? `<ul>${files.map((file) => `<li><a class="text-link" href="/admin/issues/${escapeHtml(issue.id)}/files/${escapeHtml(file.id)}">${escapeHtml(file.filename)}</a></li>`).join("")}</ul>`
    : `<p>No files attached.</p>`;
  const link = safeUrl(issue.link_url);
  const linkHtml = link
    ? `<a class="text-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(issue.link_url)}</a>`
    : `<span class="response-empty">Not provided</span>`;
  return shell({
    title: `${issue.title} · Flagged issue`,
    session,
    admin: true,
    body: `<p class="eyebrow">Flagged issue</p><h1>${escapeHtml(issue.title)}</h1>
      ${notice(message)}
      <p class="meta"><a class="text-link" href="/admin/issues">All flagged issues</a></p>
      <p class="app-pills"><span class="pill">${escapeHtml(networkLabel(issue.network))}</span><span class="pill">${escapeHtml(issueStatusLabel(issue.status))}</span></p>
      <p class="meta">${escapeHtml(issue.display_name || "")} · ${escapeHtml(issue.email || "")}</p>
      <p class="meta">Flagged ${escapeHtml(formatWhen(issue.created_at))}</p>
      <form class="filters" method="post" action="/admin/issues/${escapeHtml(issue.id)}/status">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
        <label>Status<select name="status">${options}</select></label>
        <button class="button" type="submit">Save status</button>
      </form>
      <dl class="response-grid">
        ${issueField("What's the issue?", issue.title)}
        <div class="response-item response-wide"><dt>What's happening?</dt><dd class="issue-body">${escapeHtml(issue.body || "")}</dd></div>
        ${issueField("Where is it?", issue.where_text)}
        ${issueField("Is there a meeting or deadline coming up?", issue.deadline)}
        <div class="response-item"><dt>Links or documents</dt><dd>${linkHtml}</dd></div>
        <div class="response-item response-wide"><dt>How does it affect you or your business?</dt><dd class="issue-body">${String(issue.effect || "").trim() ? escapeHtml(issue.effect) : `<span class="response-empty">Not provided</span>`}</dd></div>
        ${issueField("OK to contact me about this", issue.contact_ok ? "Yes" : "No")}
      </dl>
      <h2>Files</h2>
      ${fileList}`,
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
