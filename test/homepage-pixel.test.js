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

const PIXEL_ID = "1505364711403941";
const LOADER = "https://connect.facebook.net/en_US/fbevents.js";
const NOSCRIPT =
  `<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1"/></noscript>`;
const CSP =
  "default-src 'none'; script-src 'self' 'unsafe-inline' https://*.googletagmanager.com https://*.google-analytics.com https://connect.facebook.net; img-src 'self' https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.facebook.com https://connect.facebook.net; form-action 'self'; base-uri 'none'";

const pages = {
  HOME: extract("HOME"),
  JOIN: extract("JOIN"),
  THANKS_JOIN: extract("THANKS_JOIN"),
  THANKS_CONTACT: extract("THANKS_CONTACT"),
  LOGIN: extract("LOGIN"),
};

test("homepage head includes the Meta Pixel base code after the existing GA4 snippet", () => {
  const home = pages.HOME;
  const head = home.slice(0, home.indexOf("</head>"));
  assert.match(head, /!function\(f,b,e,v,n,t,s\)/);
  assert.ok(head.includes(LOADER));
  assert.ok(head.includes(`fbq('init', '${PIXEL_ID}');`));
  assert.ok(head.includes("fbq('track', 'PageView');"));
  assert.ok(head.includes(NOSCRIPT));
  assert.ok(head.includes("https://www.googletagmanager.com/gtag/js?id=G-SFZ02T5TXS"));
  assert.ok(head.includes("gtag('config', 'G-SFZ02T5TXS');"));
  assert.ok(head.indexOf(LOADER) > head.indexOf("gtag('config', 'G-SFZ02T5TXS');"));
  assert.equal(source.split(LOADER).length - 1, 2);
});

test("the pixel is not on join, login, or the confirmation pages", () => {
  for (const name of ["JOIN", "THANKS_CONTACT", "LOGIN"]) {
    const html = pages[name];
    assert.equal(html.includes("fbq"), false, name);
    assert.equal(html.includes("fbevents.js"), false, name);
    assert.equal(html.includes("facebook.com/tr"), false, name);
    assert.equal(html.includes(PIXEL_ID), false, name);
  }
});

test("homepage is the only route that serves the home document", () => {
  assert.match(source, /if \(path === "\/index\.html"\) return html\(request\.method === "HEAD" \? null : HOME\);/);
  assert.match(source, /if \(path === "\/join" \|\| path === "\/join\.html"\) return html\(request\.method === "HEAD" \? null : JOIN\);/);
});

test("GA4 stays on the pages that already had it", () => {
  for (const name of ["HOME", "JOIN", "THANKS_JOIN", "THANKS_CONTACT"]) {
    assert.ok(pages[name].includes("G-SFZ02T5TXS"), name);
    assert.ok(pages[name].includes("googletagmanager.com/gtag/js"), name);
  }
  assert.equal(pages.LOGIN.includes("googletagmanager.com"), false);
});

test("content security policy allows the pixel loader and keeps the Google hosts", () => {
  assert.equal(source.split("Content-Security-Policy").length - 1, 1);
  assert.ok(source.includes(`"Content-Security-Policy": "${CSP}"`));
});

test("membership thank-you page has the pixel base code and fires Lead after it", () => {
  const t = pages.THANKS_JOIN;
  assert.ok(t.includes(LOADER) && t.includes(NOSCRIPT));
  assert.ok(t.indexOf("fbq('track', 'Lead');") > t.indexOf("fbq('track', 'PageView');"));
  assert.ok(t.indexOf("fbq('track', 'Lead');") < t.indexOf("</body>"));
});
