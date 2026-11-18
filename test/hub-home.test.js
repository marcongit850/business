import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HUB_PRIORITIES, postPlainText, postsForHub, welcomeHeading } from "../src/hub-copy.js";
import { hubHero } from "../src/hub-hero.js";
import { renderApplications, renderContentEditor, renderMemberItem, renderNetworkHub, renderProfile } from "../src/hub-pages.js";
import { renderMarkdown } from "../src/text.js";
import { validateContent } from "../src/validate.js";

const session = { email: "marc@whpinc.com", csrf: "csrf" };

function textOf(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

test("each network hub uses its own priorities, tagline, and links", () => {
  assert.equal(welcomeHeading("Marc Douglass"), "Welcome back, Marc");
  assert.equal(welcomeHeading(""), "Welcome back");
  assert.equal(welcomeHeading("  "), "Welcome back");
  const expected = {
    business: ["Business-Friendly Policies", "Public Participation", "A Stronger Voice. A Stronger Business Community. A Stronger Walton County."],
    builders: ["Fair and Consistent Regulations", "Industry Representation", "A Unified Voice. A Stronger Industry. A Better Walton County."],
    tourism: ["Tourism Economy & Local Jobs", "Tourism Industry Representation", "A Unified Voice. A Stronger Tourism Economy. A Better Walton County."],
  };
  for (const network of ["business", "builders", "tourism"]) {
    assert.equal(HUB_PRIORITIES[network].items.length, network === "business" ? 8 : 10);
    const html = renderNetworkHub({
      session,
      admin: false,
      network,
      profile: { name: "Marc Douglass", company: "Misc", role_title: "" },
      posts: [],
      issues: [],
    });
    const text = textOf(html);
    assert.match(html, /Welcome back, Marc/);
    assert.match(html, /working hard to reach our first 500 members/);
    assert.match(html, /background-image:url\('\/assets\/hub-hero\.jpg'\)/);
    assert.match(html, new RegExp(`href="/hub/${network}/flag"`));
    assert.match(html, new RegExp(`href="/hub/${network}/profile"`));
    assert.match(html, />Sign out</);
    assert.match(html, /name="csrf" value="csrf"/);
    assert.match(html, /Your profile/);
    assert.match(html, /Misc/);
    assert.match(html, /Edit profile/);
    assert.match(html, /popovertarget="contact-dialog"/);
    for (const piece of expected[network]) assert.ok(text.includes(piece), piece);
    for (const other of ["business", "builders", "tourism"].filter((id) => id !== network)) {
      assert.equal(text.includes(HUB_PRIORITIES[other].items[0][0]), false, other);
      assert.equal(text.includes(HUB_PRIORITIES[other].tagline), false, other);
    }
    assert.equal(/[—–]/.test(html), false, network);
  }
  const nameless = renderNetworkHub({
    session,
    admin: false,
    network: "tourism",
    profile: { name: "", company: "", role_title: "" },
  });
  assert.match(nameless, /<h1>Welcome back<\/h1>/);
  assert.equal(nameless.includes("Welcome back,"), false);
  assert.equal(nameless.includes('class="profile-name"'), false);
  assert.equal(nameless.includes('class="profile-company"'), false);
});

test("Latest shows published posts for this network and all-network posts, newest first", () => {
  const posts = [
    { id: "a", network: "business", status: "published", type: "post", title: "Older note", slug: "older-note", body: "A short note.", published_at: "2026-11-01T00:00:00.000Z", pinned: 0 },
    { id: "b", network: "business", status: "published", type: "announcement", title: "Newest <alert>", slug: "newest-alert", body: "Just in.", description: "", published_at: "2026-11-14T00:00:00.000Z", pinned: 0 },
    { id: "c", network: "builders", status: "published", type: "post", title: "Builders only", slug: "builders-only", body: "Not for business.", published_at: "2026-11-15T00:00:00.000Z", pinned: 0 },
    { id: "d", network: "tourism", status: "published", type: "post", title: "For every network", slug: "for-every-network", body: "Shared.", share_all: 1, published_at: "2026-11-10T00:00:00.000Z", pinned: 0 },
    { id: "e", network: "business", status: "draft", type: "post", title: "Secret draft", slug: "secret-draft", body: "Hidden.", published_at: "2026-11-16T00:00:00.000Z", pinned: 0 },
    {
      id: "f",
      network: "business",
      status: "published",
      type: "post",
      title: "A long letter",
      slug: "a-long-letter",
      description: "",
      body: `${"This is a long paragraph about the county meeting. ".repeat(12)}\n\n## Next steps\n\n- Bring the map\n- Send the letter\n\n<script>alert(1)</script>\n\n[Read the agenda](https://example.com/agenda)\n[Bad](javascript:alert(1))\n\n![Shore](https://example.com/shore.jpg)`,
      image_key: "img/1",
      image_alt: "Shore houses",
      published_at: "2026-11-12T00:00:00.000Z",
      pinned: 0,
    },
  ];
  assert.deepEqual(postsForHub(posts, "business").map((item) => item.slug), [
    "newest-alert",
    "a-long-letter",
    "for-every-network",
    "older-note",
  ]);
  const html = renderNetworkHub({
    session,
    admin: true,
    network: "business",
    also: ["tourism"],
    profile: { name: "Marc Douglass", company: "Misc" },
    posts,
    issues: [],
  });
  const newestAt = html.indexOf("Newest &lt;alert&gt;");
  const longAt = html.indexOf("A long letter");
  const sharedAt = html.indexOf("For every network");
  const olderAt = html.indexOf("Older note");
  const welcomeAt = html.indexOf("Welcome from Walton County Business Leaders");
  assert.ok(newestAt < longAt && longAt < sharedAt && sharedAt < olderAt && olderAt < welcomeAt);
  assert.equal(html.includes("Builders only"), false);
  assert.equal(html.includes("Secret draft"), false);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("javascript:"), false);
  assert.match(html, /href="\/hub\/business\/a-long-letter"/);
  assert.match(html, />Read more</);
  assert.match(html, /class="thumb"[^>]*alt="Shore houses"/);
  assert.match(html, /img\.thumb[\s\S]*max-width: 100%/);
  assert.match(html, /border-radius: 10px/);
  assert.match(html, /Also a member of <a href="\/hub\/tourism">Walton County Tourism Network<\/a>\./);
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  assert.equal(nav.includes("Tourism"), false);
  assert.match(nav, /class="admin-link" href="\/admin">Admin</);
  assert.equal(nav.includes("/admin/content"), false);

  const full = renderMemberItem({ session, admin: false, network: "business", item: posts[5] });
  assert.match(full, /<h3>Next steps<\/h3>/);
  assert.match(full, /<li>Bring the map<\/li>/);
  assert.match(full, /href="https:\/\/example\.com\/agenda"/);
  assert.match(full, /class="prose-img"[^>]*alt="Shore"/);
  assert.match(full, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(full.includes("<script>"), false);
  assert.equal(full.includes("javascript:"), false);
  assert.match(full, /max-width: 100%/);

  const tourism = renderNetworkHub({ session, network: "tourism", posts, profile: { name: "Ada" } });
  assert.match(tourism, /For every network/);
  assert.match(tourism, /href="\/hub\/tourism\/for-every-network"/);
  assert.equal(tourism.includes("Older note"), false);
  assert.equal(tourism.includes("Builders only"), false);
  assert.match(tourism, /Welcome back, Ada/);
});

test("markdown images stay inert unless the address is http or https", () => {
  const html = renderMarkdown("![Ok](https://example.com/a.jpg)\n\n![Local](/hub/media/abc)\n\n![Bad](javascript:alert(1))\n");
  assert.match(html, /<img class="prose-img" src="https:\/\/example.com\/a\.jpg" alt="Ok">/);
  assert.match(html, /<img class="prose-img" src="\/hub\/media\/abc" alt="Local">/);
  assert.equal((html.match(/<img/g) || []).length, 2);
  assert.equal(html.includes("javascript:"), false);
  assert.match(html, /<p>Bad<\/p>/);
});

test("photo credits render as small print on the hub and the post page", () => {
  const body = "A short note about the shops.\n\nPhoto: [The Bushranger](https://commons.wikimedia.org/wiki/File:Shops_in_Seaside.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)";
  const item = {
    id: "photo",
    network: "business",
    status: "published",
    type: "post",
    title: "Seaside shops",
    slug: "seaside-shops",
    body,
    description: "",
    published_at: "2026-11-14T00:00:00.000Z",
    pinned: 0,
  };
  const hub = renderNetworkHub({ session, network: "business", posts: [item], profile: { name: "Marc" } });
  assert.match(hub, /<p class="fine-print">Photo: <a href="https:\/\/commons\.wikimedia\.org\/wiki\/File:Shops_in_Seaside\.jpg" rel="noopener noreferrer">The Bushranger<\/a>/);
  assert.match(hub, /class="post-card"[\s\S]*class="fine-print"/);
  assert.match(hub, /\.prose p\.fine-print, \.post-card \.prose p\.fine-print, \.post-read \.prose p\.fine-print \{[^}]*font-size: 12px;[^}]*color: #4a5563;/);
  assert.equal(hub.includes("<small>"), false);
  assert.equal(/[—–]/.test(hub), false);

  const detail = renderMemberItem({ session, network: "business", item });
  assert.match(detail, /class="card post-read"[\s\S]*<p class="fine-print">Photo: /);
  assert.match(detail, /href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/"/);
  assert.equal(detail.includes("<small>"), false);

  const editor = renderContentEditor({
    session,
    item: { network: "business", type: "post", title: "Hello", slug: "hello", body: "", pinned: 0, image_alt: "" },
  });
  assert.match(editor, /A paragraph that starts with Photo: is shown as small print\./);
  assert.match(editor, /Start any other paragraph with \^ and a space for the same small print\./);
  assert.equal(/[—–]/.test(editor), false);
  assert.equal(postPlainText("^ Filed away.\n\nPhoto: credit"), "Filed away. Photo: credit");
});

test("the content editor can target every network and keeps raw html as text", () => {
  const editor = renderContentEditor({
    session,
    item: { id: "11111111-1111-4111-8111-111111111111", network: "business", type: "post", status: "draft", title: "Hello", slug: "hello", body: "<script>no</script>", share_all: 1, pinned: 0, image_alt: "" },
  });
  assert.match(editor, /name="share_all" value="1" checked/);
  assert.match(editor, /&lt;script&gt;no&lt;\/script&gt;/);
  assert.equal(editor.includes("<script>no</script>"), false);
  const shared = validateContent({ network: "tourism", type: "post", title: "Hello hub", share_all: true, body: "Hi" });
  assert.equal(shared.value.share_all, 1);
  assert.equal(shared.value.network, "tourism");
  assert.match(validateContent({ network: "business", type: "post", title: "Welcome" }).error, /reserved/);
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  assert.match(hub, /WHERE network = \? AND status = 'published' OR share_all = 1 AND status = 'published'/);
  assert.match(hub, /WHERE share_all = 1 AND slug = \? AND status = 'published'/);
  const migration = readFileSync(new URL("../migrations/0004_content_share_all.sql", import.meta.url), "utf8");
  assert.match(migration, /ADD COLUMN share_all/);
  assert.equal(/[—–]/.test(migration), false);
});

function accountNav(html) {
  return html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
}

test("an admin sees one Admin link on a network hub and a member sees none", () => {
  for (const network of ["business", "builders", "tourism"]) {
    const adminHtml = renderNetworkHub({
      session,
      admin: true,
      network,
      profile: { name: "Marc Douglass" },
      posts: [],
      issues: [],
    });
    const nav = accountNav(adminHtml);
    const adminHrefs = [...nav.matchAll(/href="([^"]*)"/g)].map((match) => match[1]).filter((href) => href === "/admin" || href.startsWith("/admin/"));
    assert.deepEqual(adminHrefs, ["/admin"], network);
    assert.match(nav, /<a class="admin-link" href="\/admin">Admin<\/a>/, network);
    assert.equal((nav.match(/class="admin-link"/g) || []).length, 1, network);
    assert.equal(nav.includes("Applications"), false, network);
    assert.equal(nav.includes("Flagged issues"), false, network);
    assert.equal(nav.includes(">Members<"), false, network);
    assert.equal(nav.includes(">Content<"), false, network);
    assert.equal(nav.includes("Ideas"), false, network);
    assert.match(nav, new RegExp(`class="hub-label" href="/hub/${network}">Member Hub</a>`), network);
    assert.match(nav, /class="header-link"/, network);
    assert.equal(nav.includes('class="header-link" href="/admin"'), false, network);
    assert.equal(/[—–]/.test(nav), false, network);

    const hidden = adminHtml.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/);
    assert.ok(hidden, network);
    assert.match(hidden[1], /\.hub-nav a\.header-link/);
    assert.equal(hidden[1].includes("admin-link"), false, network);
    assert.match(adminHtml, /\.hub-nav a\.admin-link \{[\s\S]*border: 1px solid var\(--gold\);/);
    assert.match(adminHtml, /body\[data-network\] \.site-header \.brand \{ flex: 1 1 auto; min-width: 0; overflow: hidden; \}/);
    assert.match(adminHtml, /@media \(max-width: 479px\) \{\s*body\[data-network\] \.site-header \.header-inner \{ flex-wrap: wrap; row-gap: 6px; \}/);

    const memberHtml = renderNetworkHub({
      session,
      admin: false,
      network,
      profile: { name: "Ada Example" },
      posts: [],
      issues: [],
    });
    const memberNav = accountNav(memberHtml);
    assert.equal(memberNav.includes("/admin"), false, network);
    assert.equal(memberNav.includes(">Admin<"), false, network);
    assert.equal(memberNav.includes("admin-link"), false, network);
    assert.match(memberNav, /Member Hub/, network);

    const profile = renderProfile({
      session,
      admin: true,
      profile: {},
      fields: [],
      network,
    });
    const profileNav = accountNav(profile);
    assert.deepEqual(
      [...profileNav.matchAll(/href="([^"]*)"/g)].map((match) => match[1]).filter((href) => href.startsWith("/admin")),
      ["/admin"],
      network,
    );
  }

  const adminPage = renderApplications({ session, network: "", status: "", rows: [] });
  const adminNav = accountNav(adminPage);
  assert.match(adminNav, /<a href="\/hub">Hub<\/a>/);
  assert.match(adminNav, /<a href="\/hub\/profile">Profile<\/a>/);
  assert.match(adminNav, /<a href="\/admin">Applications<\/a>/);
  assert.match(adminNav, /<a href="\/admin\/issues">Flagged issues<\/a>/);
  assert.match(adminNav, /<a href="\/admin\/ideas">Ideas<\/a>/);
  assert.match(adminNav, /<a href="\/admin\/members">Members<\/a>/);
  assert.ok(adminNav.indexOf('href="/admin/issues"') < adminNav.indexOf('href="/admin/ideas">Ideas') && adminNav.indexOf('href="/admin/ideas">Ideas') < adminNav.indexOf('href="/admin/members"'));
  assert.match(adminNav, /<a href="\/admin\/content">Content<\/a>/);
  assert.equal(adminNav.includes("admin-link"), false);
  assert.equal(adminNav.includes(">Admin<"), false);
  assert.equal(/[—–]/.test(adminNav), false);
});

test("action cards in the hub grid align to the top and keep equal height", () => {
  const html = renderNetworkHub({
    session,
    network: "business",
    profile: { name: "Marc" },
  });
  assert.match(html, /\.action-grid > \.action-card,\s*\.action-grid > button\.action-card \{\s*display: flex;\s*flex-direction: column;\s*align-items: stretch;\s*align-content: start;\s*justify-content: flex-start;\s*height: 100%;\s*\}/);
  assert.match(html, /button\.action-card \{\s*display: flex;\s*flex-direction: column;\s*align-items: stretch;\s*align-content: start;\s*justify-content: flex-start;/);
  const cardRule = html.slice(html.indexOf(".action-grid > .action-card"), html.indexOf(".action-card.primary"));
  assert.equal(cardRule.includes("justify-content: center"), false);
  assert.equal(cardRule.includes("align-items: center"), false);
  const grid = html.slice(html.indexOf('class="action-grid"'), html.indexOf('class="action-card idea-card"'));
  assert.equal((grid.match(/class="action-card/g) || []).length, 4);
  assert.match(html, /class="action-card idea-card"/);
});

test("the hero photo is the file in this repo", () => {
  const photo = hubHero("/assets/hub-hero.jpg");
  const bytes = readFileSync(new URL("../assets/hub-hero.jpg", import.meta.url));
  assert.equal(photo.type, "image/jpeg");
  assert.equal(Buffer.compare(Buffer.from(photo.bytes), bytes), 0);
  assert.ok(bytes.length < 120000);
  assert.equal(hubHero("/assets/networks/walton-county-business-leaders-logo.png"), null);
});
