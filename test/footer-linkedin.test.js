import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderNetworkHub } from "../src/hub-pages.js";
import { NETWORKS } from "../src/networks.js";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

function extract(name) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, name);
  const jsonStart = start + marker.length;
  let i = jsonStart + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === '"') break;
    i += 1;
  }
  return JSON.parse(source.slice(jsonStart, i + 1));
}

const LINKEDIN = "https://www.linkedin.com/company/walton-county-business-leaders";
const LINK = `<a class="footer-social" href="${LINKEDIN}" target="_blank" rel="noopener noreferrer" aria-label="Walton County Business Leaders on LinkedIn">`;

const pages = {
  HOME: extract("HOME"),
  JOIN: extract("JOIN"),
  THANKS_JOIN: extract("THANKS_JOIN"),
  THANKS_CONTACT: extract("THANKS_CONTACT"),
};

function footerOf(html) {
  const start = html.lastIndexOf("<footer");
  assert.notEqual(start, -1);
  return html.slice(start, html.indexOf("</footer>", start) + "</footer>".length);
}

test("every public footer places a LinkedIn icon link beside the Facebook icon", () => {
  for (const [name, html] of Object.entries(pages)) {
    const footer = footerOf(html);
    const facebook = footer.indexOf('aria-label="Walton County Business Leaders Facebook group"');
    const linkedin = footer.indexOf(LINK);
    assert.ok(facebook > -1, name);
    assert.ok(linkedin > facebook, name);
    assert.equal(footer.split(LINK).length - 1, 1, name);
    assert.match(footer, /<span class="footer-socials">[\s\S]*Facebook group[\s\S]*Walton County Business Leaders on LinkedIn[\s\S]*<\/span>/);
    const icon = footer.slice(footer.indexOf("<svg", linkedin), footer.indexOf("</svg>", linkedin));
    assert.match(icon, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">/);
    assert.equal(/<(image|use|script|img)\b/i.test(icon), false, name);
    assert.equal(icon.includes("linkedin.com"), false, name);
    const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    assert.match(style, /\.footer-socials \{ display: inline-flex; align-items: center; gap: 10px; flex: none; \}/);
    assert.match(style, /\.footer-social:hover,\s*\.footer-social:focus-visible \{ color: #f6f3ec; background: rgba\(208, 160, 64, 0\.18\); border-color: #d0a040; \}/);
    assert.equal(html.split(LINKEDIN).length - 1, 1, name);
  }
});

test("the LinkedIn icon is inline, so the existing content security policy stays unchanged", () => {
  const csp = source.slice(source.indexOf('"Content-Security-Policy":'), source.indexOf("form-action 'self'"));
  assert.equal(csp.includes("linkedin"), false);
  for (const html of Object.values(pages)) {
    assert.equal(/<(script|img|link)[^>]+linkedin/i.test(html), false);
  }
});

test("each member hub footer uses the same LinkedIn icon link beside that network's Facebook icon", () => {
  for (const network of ["business", "builders", "tourism"]) {
    const html = renderNetworkHub({
      session: { email: "member@example.com", csrf: "csrf" },
      admin: false,
      network,
      profile: { name: "Ada", company: "Local", role_title: "" },
      posts: [],
      issues: [],
    });
    const footer = footerOf(html);
    const facebook = `aria-label="${NETWORKS[network].name} Facebook group"`;
    assert.ok(footer.includes(facebook), network);
    assert.ok(footer.indexOf(LINK) > footer.indexOf(facebook), network);
    assert.match(footer, new RegExp(`href="${NETWORKS[network].facebook.replace(/[.]/g, "\\.")}"`));
    assert.equal(footer.split(LINK).length - 1, 1, network);
    assert.match(html, /\.footer-socials \{ display: inline-flex; align-items: center; gap: 10px; flex: none; \}/);
    const actions = html.slice(html.indexOf('class="action-grid"'), html.indexOf('class="points-panel"'));
    assert.ok(actions.includes(NETWORKS[network].linkedin), network);
    assert.match(actions, />Join us on social</);
    if (network !== "business") assert.equal(actions.includes(LINKEDIN), false, network);
  }
});
