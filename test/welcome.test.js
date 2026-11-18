import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FLAG_PROMPT, FLAG_THANKS, WELCOME_COPY, renderNetworkHub, renderWelcome } from "../src/hub-pages.js";
import { welcomeExcerpt } from "../src/hub-copy.js";
import { NETWORKS } from "../src/networks.js";

function textOf(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

test("each hub shows only that network's welcome, with the join and Facebook links", () => {
  assert.equal(WELCOME_COPY.heading, "Welcome. We're glad you're here.");
  assert.equal(WELCOME_COPY.opening, "We're a brand new organization, and we're working hard to reach our first 500 members. Thank you for being one of them. This is your member hub. As we grow, we'll use it to share updates, resources, and issue pages with members.");
  assert.equal(WELCOME_COPY.networks.business, "Walton County Business Leaders is here so local owners, operators, and executives have a meaningful voice in the decisions shaping our county's future. We are more than a networking organization. We advocate on taxes, fees, regulations, infrastructure, government spending, and economic development, and we work for a stronger business community and a stronger Walton County.");
  assert.equal(WELCOME_COPY.networks.builders, "Walton County Builders Network gives the professionals who build, develop, sell, improve, and maintain Walton County a unified voice. We support responsible growth and transparent, consistent, and predictable government processes, and we give industry professionals an organized forum to raise concerns and recommend practical improvements.");
  assert.equal(WELCOME_COPY.networks.tourism, "Walton County Tourism Network is an independent advocacy group for businesses that depend on tourism. We promote policies that support a thriving visitor economy, and we advocate for responsible investments, fair regulations, and a strong business environment that benefits residents, visitors, and local businesses alike.");
  assert.equal(WELCOME_COPY.closing, "We'll share current issues, documents, and our positions here as they're ready. In the meantime, two things help a lot: invite others who belong here, and join the conversation in our Facebook group.");
  assert.equal(/[—–]/.test(JSON.stringify(WELCOME_COPY)), false);

  for (const network of ["business", "builders", "tourism"]) {
    const html = renderNetworkHub({
      session: { email: "ada@example.com", csrf: "csrf" },
      admin: false,
      network,
      top: [],
      resources: [],
      stories: [],
    });
    assert.match(html, new RegExp(`Welcome from ${NETWORKS[network].name}`));
    assert.match(html, new RegExp(`href="/hub/${network}/welcome"`));
    assert.match(textOf(html), new RegExp(welcomeExcerpt(WELCOME_COPY.networks[network]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const page = renderWelcome({
      session: { email: "ada@example.com", csrf: "csrf" },
      admin: false,
      network,
    });
    const welcome = page.slice(page.indexOf('<section class="welcome"'), page.indexOf("Back to the hub"));
    const paragraphs = [...welcome.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => textOf(match[1]));
    assert.deepEqual(paragraphs, [
      WELCOME_COPY.opening,
      WELCOME_COPY.networks[network],
      WELCOME_COPY.closing,
    ]);
    for (const other of ["business", "builders", "tourism"].filter((id) => id !== network)) {
      assert.equal(welcome.includes(WELCOME_COPY.networks[other]), false, other);
      assert.equal(html.includes(WELCOME_COPY.networks[other]), false, other);
    }
    assert.match(welcome, new RegExp(`href="${NETWORKS[network].join.replace(/[.]/g, "\\.")}"`));
    assert.match(welcome, /target="_blank" rel="noopener"/);
    assert.equal(welcome.includes("noreferrer"), false);
    assert.match(welcome, new RegExp(`href="${NETWORKS[network].facebook.replace(/[.]/g, "\\.")}"`));
    assert.match(html, new RegExp(`href="/hub/${network}/flag"`));
    assert.match(html, />Flag an Issue</);
    assert.match(html, new RegExp(FLAG_PROMPT.replace(/[?]/g, "\\?")));
    assert.match(html, /Your flagged issues/);
    assert.match(html, /None yet/);
    assert.match(html, /a\.flag-button[\s\S]*background: var\(--accent/);
    assert.match(html, /@media \(max-width: 800px\)[\s\S]*\.welcome \{ padding: 16px 14px 2px; \}/);
  }
  assert.equal(FLAG_PROMPT, "Something happening in Walton County that the network should weigh in on? Let us know.");
  assert.equal(FLAG_THANKS, "Thanks, we'll look into it.");
  assert.equal(NETWORKS.business.join, "https://waltonleaders.org/join");
  assert.equal(NETWORKS.builders.join, "https://waltonbuildersnetwork.org/join");
  assert.equal(NETWORKS.tourism.join, "https://waltontourism.org/join");
  assert.equal(NETWORKS.tourism.facebook, "https://www.facebook.com/groups/waltontourism");
});

test("welcome, issue, and profile copy files do not use em or en dashes", () => {
  for (const file of ["../src/issues.js", "../src/profile-prefill.js", "../migrations/0003_flagged_issues.sql"]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(/[—–]/.test(text), false, file);
  }
});
