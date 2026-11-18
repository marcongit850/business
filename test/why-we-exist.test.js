import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { renderWhyArticleBody, renderWhyWeExistPage, WHY_CANONICAL, WHY_DESCRIPTION, WHY_TITLE } from "../src/why-we-exist.js";

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

const { default: worker } = await import("../src/index.js");

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const CSP =
  "default-src 'none'; script-src 'self' 'unsafe-inline' https://*.googletagmanager.com https://*.google-analytics.com https://connect.facebook.net; img-src 'self' https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.facebook.com https://connect.facebook.net; manifest-src 'self'; worker-src 'self'; form-action 'self'; base-uri 'none'";

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

function sliceBetween(html, startMark, endMark) {
  const start = html.indexOf(startMark);
  assert.notEqual(start, -1, startMark);
  const end = html.indexOf(endMark, start);
  assert.notEqual(end, -1, endMark);
  return html.slice(start, end);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function paragraphs(html) {
  return [...html.matchAll(/<p(?: class="[^"]*")?>([\s\S]*?)<\/p>/g)].map((match) =>
    match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

const HOME = extract("HOME");
const JOIN = extract("JOIN");
const page = renderWhyWeExistPage(JOIN);
const article = renderWhyArticleBody();

const HOME_PARAGRAPHS = [
  "You're busy managing employees, serving customers, paying bills, and providing for your family. Meanwhile, local government continues considering new rules, fees, and regulations that could affect your livelihood.",
  "By the time you hear about a proposed change, the opportunity to influence it may have already passed.",
  "That's why Walton County Business Leaders exists.",
];

const ARTICLE_PARAGRAPHS = [
  "You may not think you need a business advocacy group. That's exactly why you should know what we're doing.",
  "You're busy. You have employees to manage, customers to serve, bills to pay, and a family to provide for. The last thing you have time to do is read county commission agendas, attend government meetings, or monitor every proposed ordinance.",
  "But here's the problem: Local government doesn't stop making decisions just because you're busy.",
  "A new business registration requirement. Another fee. A change in zoning. Additional licensing restrictions. New regulations that increase your operating costs.",
  "Individually, these changes might seem insignificant. But little by little, they add up. What was once simple becomes complicated. What was once affordable becomes expensive. And freedoms you took for granted can slowly become restricted.",
  "By the time most business owners discover what's changed, the public hearings are over, the votes have been counted, and the new rules are already in place.",
  "Why wasn't anyone paying attention?",
  "Because most business owners were doing exactly what they're supposed to be doing: working hard, creating jobs, serving customers, and supporting their families.",
  "That is precisely why Walton County Business Leaders exists.",
  "We're here to monitor local government proposals, identify policies affecting businesses, inform our community, and help ensure business owners have an opportunity to be heard before decisions become law.",
  "We believe government works best when the people affected by its decisions are informed and involved. Whether limited public awareness is intentional or simply the result of a complicated government process, the outcome can be the same: decisions get made without meaningful input from those who will live with the consequences.",
  "You shouldn't have to become a government watchdog just to run your business.",
  "That's why we're building a network of people who understand what's at stake.",
  "Because the time to speak up isn't after a new regulation takes effect.",
  "It's before the vote.",
  "Walton County Business Leaders",
  "A Unified Voice for Walton County's Business Community.",
];

test("homepage places Why We Exist after the hero and before Our Shared Purpose", () => {
  const hero = HOME.indexOf('class="container hero"');
  const section = HOME.indexOf('<section class="why-exist" id="why-we-exist" aria-labelledby="why-exist-heading">');
  const purpose = HOME.indexOf('<section class="purpose" id="about">');
  assert.ok(hero < section && section < purpose);
  assert.equal(HOME.indexOf('class="why-exist"'), HOME.lastIndexOf('class="why-exist"'));
  const block = sliceBetween(HOME, '<section class="why-exist"', '<section class="purpose"');
  assert.equal(block.includes('class="eyebrow">WHY WE EXIST</p>'), true);
  assert.match(block, /<h2 id="why-exist-heading">While You're Running Your Business, Who's Watching Out for You\?<\/h2>/);
  assert.deepEqual(paragraphs(block).filter((item) => item !== "WHY WE EXIST"), HOME_PARAGRAPHS);
  assert.match(block, /<p><strong>That's why Walton County Business Leaders exists\.<\/strong><\/p>/);
  assert.match(block, /<a class="button" href="\/why-we-exist">Learn Why We Exist <span aria-hidden="true">→<\/span><\/a>/);
  assert.equal(/[—–]/.test(block), false);
  const style = HOME.slice(HOME.indexOf("<style>"), HOME.indexOf("</style>"));
  assert.match(style, /\.why-exist \{[^}]*border-top: 2px solid var\(--gold\);/);
  assert.match(style, /\.why-exist \.eyebrow::before \{[^}]*background: var\(--gold\);/);
});

test("why we exist is a public article with the site chrome, meta tags, and exact copy", () => {
  assert.equal(page.includes("<header"), true);
  assert.equal(page.includes("<footer"), true);
  assert.equal(
    sliceBetween(page, "<header", "</header>"),
    sliceBetween(JOIN, "<header", "</header>")
  );
  assert.equal(
    page.slice(page.lastIndexOf("<footer"), page.indexOf("</footer>") + "</footer>".length),
    JOIN.slice(JOIN.lastIndexOf("<footer"), JOIN.indexOf("</footer>") + "</footer>".length)
  );
  assert.match(page, /<a class="skip-link" href="#why-we-exist">/);
  assert.match(page, /<title>While You&#39;re Busy Running Your Business, Who&#39;s Watching Out for You\? · Walton County Business Leaders<\/title>/);
  assert.match(page, new RegExp(`<meta name="description" content="${escapeRegExp(WHY_DESCRIPTION.replace(/'/g, "&#39;"))}">`));
  assert.match(page, /<meta name="robots" content="index, follow">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/waltonleaders\.org\/why-we-exist">/);
  assert.match(page, /<meta property="og:type" content="website">/);
  assert.match(page, /<meta property="og:site_name" content="Walton County Business Leaders">/);
  assert.match(page, /<meta property="og:title" content="While You&#39;re Busy Running Your Business, Who&#39;s Watching Out for You\? · Walton County Business Leaders">/);
  assert.match(page, /<meta property="og:description" content="You may not think you need a business advocacy group\. That&#39;s exactly why you should know what we&#39;re doing\.">/);
  assert.match(page, /<meta property="og:url" content="https:\/\/waltonleaders\.org\/why-we-exist">/);
  assert.match(page, /<meta property="og:image" content="https:\/\/waltonleaders\.org\/walton-county-business-leaders-logo\.png">/);
  assert.match(page, /<meta name="twitter:card" content="summary">/);
  assert.match(page, /<meta name="twitter:title" content="While You&#39;re Busy Running Your Business, Who&#39;s Watching Out for You\? · Walton County Business Leaders">/);
  assert.match(page, /<meta name="twitter:description" content="You may not think you need a business advocacy group\. That&#39;s exactly why you should know what we&#39;re doing\.">/);
  assert.match(page, /<meta name="twitter:image" content="https:\/\/waltonleaders\.org\/walton-county-business-leaders-logo\.png">/);
  assert.equal(page.split("<h1>").length - 1, 1);
  assert.match(page, new RegExp(`<h1>${escapeRegExp(WHY_TITLE.replace(/'/g, "&#39;"))}</h1>`));
  assert.deepEqual(paragraphs(article), ARTICLE_PARAGRAPHS);
  assert.match(article, /<strong>You may not think you need a business advocacy group\. That&#39;s exactly why you should know what we&#39;re doing\.<\/strong>/);
  assert.match(article, /<strong>Local government doesn&#39;t stop making decisions just because you&#39;re busy\.<\/strong>/);
  assert.match(article, /<strong>Why wasn&#39;t anyone paying attention\?<\/strong>/);
  assert.match(article, /<strong>You shouldn&#39;t have to become a government watchdog just to run your business\.<\/strong>/);
  assert.match(article, /<strong>It&#39;s before the vote\.<\/strong>/);
  assert.match(article, /<em>A Unified Voice for Walton County&#39;s Business Community\.<\/em>/);
  assert.match(article, /<p><strong><a href="https:\/\/waltonleaders\.org\/">Walton County Business Leaders<\/a><\/strong><\/p>/);
  assert.equal(article.includes("waltoncountybusinessleaders.org"), false);
  assert.equal(page.includes("waltoncountybusinessleaders.org"), false);
  assert.match(page, /<a class="button" href="\/join">Join Walton County Business Leaders<\/a>/);
  assert.equal(page.includes("fbq"), false);
  assert.equal(page.includes("fbevents.js"), false);
  assert.ok(page.includes("G-SFZ02T5TXS"));
  assert.equal(/[—–]/.test(page), false);
  assert.equal(WHY_CANONICAL, "https://waltonleaders.org/why-we-exist");
});

test("article rendering escapes html", () => {
  const html = renderWhyArticleBody('See <script>alert(1)</script> & "quotes"\n');
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&quot;quotes&quot;/);
});

test("the public route, sitemap, and content security policy include the article without new hosts", async () => {
  assert.match(source, /if \(path === "\/why-we-exist" \|\| path === "\/why-we-exist\.html"\) return html\(request\.method === "HEAD" \? null : WHY_WE_EXIST\);/);
  assert.equal(source.split("Content-Security-Policy").length - 1, 1);
  assert.ok(source.includes(`"Content-Security-Policy": "${CSP}"`));

  const response = await worker.fetch(new Request("https://waltonleaders.org/why-we-exist"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.equal(response.headers.get("content-security-policy"), CSP);
  const html = await response.text();
  assert.match(html, /<h1>While You&#39;re Busy Running Your Business, Who&#39;s Watching Out for You\?<\/h1>/);
  assert.match(html, /href="https:\/\/waltonleaders\.org\/"/);
  assert.match(html, /<a class="button" href="\/join">Join Walton County Business Leaders<\/a>/);
  assert.equal(html.includes("waltoncountybusinessleaders.org"), false);

  const head = await worker.fetch(new Request("https://waltonleaders.org/why-we-exist", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("content-security-policy"), CSP);

  const slash = await worker.fetch(new Request("https://waltonleaders.org/why-we-exist/"));
  assert.equal(slash.status, 301);
  assert.equal(slash.headers.get("location"), "https://waltonleaders.org/why-we-exist");

  const sitemap = await worker.fetch(new Request("https://waltonleaders.org/sitemap.xml"));
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type"), /application\/xml/);
  const xml = await sitemap.text();
  assert.match(xml, /<loc>https:\/\/waltonleaders\.org\/why-we-exist<\/loc>/);
  assert.match(xml, /<loc>https:\/\/waltonleaders\.org\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/waltonleaders\.org\/join<\/loc>/);

  const home = await worker.fetch(new Request("https://waltonleaders.org/"));
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  const section = homeHtml.indexOf('class="why-exist"');
  const purpose = homeHtml.indexOf('class="purpose"');
  assert.ok(section > -1 && section < purpose);
});
