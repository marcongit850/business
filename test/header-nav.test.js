import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

const pages = {
  HOME: extract("HOME"),
  JOIN: extract("JOIN"),
  THANKS_JOIN: extract("THANKS_JOIN"),
  THANKS_CONTACT: extract("THANKS_CONTACT"),
  LOGIN: extract("LOGIN"),
};

test("every page header keeps a one-tap Login link and an accessible menu button", () => {
  for (const [name, html] of Object.entries(pages)) {
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    assert.match(header, /<button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-menu">/);
    assert.match(header, /<span class="visually-hidden">Menu<\/span>/);
    assert.match(header, /<a class="nav-login" href="\/login">Login<\/a>/);
    assert.match(header, /<a class="button" href="\/join">Join the mission<\/a>/);
    assert.match(header, /<a href="\/login">Login<\/a>/);
    assert.equal(header.includes("onclick"), false, name);
    assert.equal(/[—–]/.test(header), false, name);
    const about = name === "HOME" ? 'href="#about"' : 'href="/#about"';
    const issues = name === "HOME" ? 'href="#issues"' : 'href="/#issues"';
    assert.ok(header.includes(about), name);
    assert.ok(header.includes(issues), name);
    assert.ok(html.includes('addEventListener("click"'), name);
    assert.ok(html.includes('event.key === "Escape"'), name);
    assert.equal(html.includes("onclick="), false, name);
  }
});

test("narrow screens reveal the menu from aria-expanded and desktop hides the extra controls", () => {
  const home = pages.HOME;
  const style = home.slice(home.indexOf("<style>"), home.indexOf("</style>"));
  assert.match(style, /\.nav-toggle\[aria-expanded="true"\] \+ \.nav-menu \{\s*display: flex;/);
  assert.match(style, /@media \(max-width: 800px\)/);
  assert.match(style, /@media \(min-width: 801px\) \{\s*\.nav-toggle,\s*\.nav > a\.nav-login \{ display: none; \}/);
  assert.match(style, /\.nav-menu,\s*\.nav-toggle\[aria-expanded="true"\] \+ \.nav-menu \{ display: contents; \}/);
});
