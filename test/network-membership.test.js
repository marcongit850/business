import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderApplicationDetail, renderLogin, renderNetworkHub, renderProfile } from "../src/hub-pages.js";
import { networkLogo } from "../src/network-logos.js";
import { loginNetworkFromUrl } from "../src/networks.js";
import { buildSignInEmail, loginPath, signInDestination, verifyLinkPath } from "../src/text.js";
import { approvalNetworks, groupIdsForApprovals } from "../src/validate.js";

const session = { email: "ada@example.com", csrf: "csrf-token" };

test("plain login lists the three networks and does not use a business leaders brand", () => {
  const html = renderLogin({ next: "/admin" });
  assert.match(html, /Choose a network/);
  assert.match(html, /href="\/login\/business\?next=%2Fadmin"/);
  assert.match(html, /href="\/login\/builders\?next=%2Fadmin"/);
  assert.match(html, /href="\/login\/tourism\?next=%2Fadmin"/);
  assert.match(html, /Walton County Business Leaders/);
  assert.match(html, /Walton County Builders Network/);
  assert.match(html, /Walton County Tourism Network/);
  assert.equal(html.includes('src="/walton-county-business-leaders-logo.png"'), false);
  assert.match(html, /src="\/assets\/networks\/walton-county-business-leaders-logo.png"/);
  assert.equal(html.includes("Your networks"), false);
  assert.equal(html.includes("Walton County Networks"), false);
  assert.equal(html.includes("<form"), false);
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  assert.equal(header.includes("<img"), false);
});

test("a network login shows only that network", () => {
  const html = renderLogin({ network: "tourism", notice: "If that email is approved, a link is on its way." });
  assert.match(html, /Sign in to Walton County Tourism Network/);
  assert.match(html, /src="\/assets\/networks\/walton-county-tourism-network-logo.webp"/);
  assert.match(html, /action="\/login\/tourism"/);
  assert.match(html, /href="https:\/\/waltontourism.org\/join"/);
  assert.match(html, /data-network="tourism"/);
  assert.equal(html.includes("Walton County Business Leaders"), false);
  assert.equal(html.includes("Walton County Builders Network"), false);
  assert.equal(html.includes("Choose a network"), false);
  assert.match(html, /If that email is approved, a link is on its way\./);
  const builders = renderLogin({ network: "builders" });
  assert.match(builders, /walton-county-builders-network-logo.jpg/);
  assert.match(builders, /class="tile"/);
  assert.equal(builders.includes("Walton County Business Leaders"), false);
  assert.equal(builders.includes("Tourism Network"), false);
});

test("network hub and profile use that network and mention other memberships only in the footer", () => {
  const html = renderNetworkHub({
    session,
    admin: false,
    network: "builders",
    also: ["tourism"],
    top: [],
    resources: [],
    stories: [],
  });
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  assert.match(header, /Walton County Builders Network home|Builders Network/);
  assert.match(header, /src="\/assets\/networks\/walton-county-builders-network-logo.jpg"/);
  assert.match(nav, /href="\/hub\/builders"/);
  assert.match(nav, /href="\/hub\/builders\/profile"/);
  assert.equal(nav.includes("Tourism"), false);
  assert.equal(nav.includes("Business Leaders"), false);
  assert.match(html, /href="https:\/\/waltonbuildersnetwork.org\/"/);
  assert.match(html, /href="https:\/\/www\.facebook\.com\/groups\/waltonbuildersnetwork\/"/);
  assert.match(html, /Also a member of <a href="\/hub\/tourism">Walton County Tourism Network<\/a>\./);
  assert.equal(html.includes("Your networks"), false);
  const alone = renderNetworkHub({
    session,
    admin: false,
    network: "business",
    top: [],
    resources: [],
    stories: [],
  });
  assert.equal(alone.includes("Also a member"), false);
  assert.match(alone, /href="https:\/\/www\.facebook\.com\/groups\/waltonbusinessleaders\/"/);
  const profile = renderProfile({
    session,
    admin: false,
    network: "tourism",
    also: ["builders", "business"],
    profile: { name: "Ada", company: "", role_title: "", phone: "", location: "", website: "", bio: "" },
    fields: [],
  });
  assert.match(profile, /action="\/hub\/tourism\/profile"/);
  assert.match(profile, /src="\/assets\/networks\/walton-county-tourism-network-logo.webp"/);
  assert.match(profile, /Also a member of <a href="\/hub\/business">Walton County Business Leaders<\/a> and <a href="\/hub\/builders">Walton County Builders Network<\/a>\./);
  const profileNav = profile.slice(profile.indexOf("<nav"), profile.indexOf("</nav>"));
  assert.equal(profileNav.includes("Builders"), false);
  assert.equal(profileNav.includes("Business Leaders"), false);
});

test("login urls and sign-in landing stay on the requested network", () => {
  assert.equal(loginNetworkFromUrl(new URL("https://waltonleaders.org/login/builders")), "builders");
  assert.equal(loginNetworkFromUrl(new URL("https://waltonleaders.org/login?network=tourism")), "tourism");
  assert.equal(loginNetworkFromUrl(new URL("https://waltonleaders.org/login?network=nope")), "");
  assert.equal(loginNetworkFromUrl(new URL("https://waltonleaders.org/login/verify?network=builders")), "");
  assert.equal(loginPath({ network: "tourism", sent: true }), "/login/tourism?sent=1");
  assert.match(verifyLinkPath("token", "/admin", "builders"), /network=builders/);
  assert.equal(verifyLinkPath("token", "https://evil.com"), "/login/verify?token=token");
  assert.equal(signInDestination(false, "", "builders", ["tourism", "builders"]), "/hub/builders");
  assert.equal(signInDestination(false, "", "business", ["tourism"]), "/hub");
  assert.equal(signInDestination(true, "", "builders", []), "/admin");
  assert.equal(signInDestination(true, "/admin", "builders", ["builders"]), "/admin");
  assert.equal(signInDestination(true, "", "builders", ["builders"]), "/hub/builders");
});

test("magic link copy uses the network name and the shared from address", () => {
  const message = buildSignInEmail(
    "ada@example.com",
    "https://waltonleaders.org/login/verify?token=abc&network=tourism",
    "hello@waltonleaders.org",
    "Walton County Tourism Network",
  );
  assert.equal(message.from, "hello@waltonleaders.org");
  assert.match(message.raw, /From: Walton County Tourism Network <hello@waltonleaders\.org>/);
  assert.match(message.raw, /Subject: Sign in to Walton County Tourism Network/);
  assert.match(message.raw, /Sign in to Walton County Tourism Network/);
  assert.equal(message.raw.includes("Business Leaders"), false);
  assert.equal(/[—–]/.test(message.raw), false);
});

test("approval can add every checked network and keeps the applied network", () => {
  assert.deepEqual(approvalNetworks("builders", ["builders", "tourism", "nope"]), ["builders", "tourism"]);
  assert.deepEqual(approvalNetworks("business", ["tourism", "builders"]), ["business", "builders", "tourism"]);
  assert.deepEqual(approvalNetworks("tourism", []), ["tourism"]);
  assert.deepEqual(approvalNetworks("other", ["business"]), []);
  const env = {
    MAILERLITE_GROUP_MASTER: " master ",
    MAILERLITE_GROUP_BUSINESS: "b",
    MAILERLITE_GROUP_BUSINESS_APPROVED: "ba",
    MAILERLITE_GROUP_BUILDERS: "u",
    MAILERLITE_GROUP_BUILDERS_APPROVED: "ua",
    MAILERLITE_GROUP_TOURISM: "",
    MAILERLITE_GROUP_TOURISM_APPROVED: "ta",
  };
  assert.deepEqual(groupIdsForApprovals(env, ["builders", "tourism"]), ["master", "u", "ua", "ta"]);
  const html = renderApplicationDetail({
    session: { email: "marc@whpinc.com", csrf: "csrf-token" },
    application: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ada Example",
      email: "ada@example.com",
      network: "builders",
      status: "pending",
      submitted_at: "2026-11-15T15:24:00.000Z",
    },
    fields: {},
    notesReady: false,
  });
  assert.match(html, /name="networks" value="builders" checked disabled/);
  assert.match(html, /type="hidden" name="networks" value="builders"/);
  assert.match(html, /name="networks" value="business"(?! checked)/);
  assert.match(html, /name="networks" value="tourism"/);
  assert.equal(/value="tourism"[^>]*disabled/.test(html), false);
  assert.equal(/value="business"[^>]*disabled/.test(html), false);
  const deny = html.slice(html.indexOf('action="/admin/applications/11111111-1111-4111-8111-111111111111/deny"'));
  assert.equal(deny.includes('name="networks"'), false);
  assert.match(html, /That network stays included/);
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  const approve = hub.slice(hub.indexOf("async function approveApplication"), hub.indexOf("async function denyApplication"));
  const denyFn = hub.slice(hub.indexOf("async function denyApplication"), hub.indexOf("async function listMembers"));
  assert.match(approve, /for \(const network of networks\)/);
  assert.match(approve, /approvalNetworks\(/);
  assert.match(approve, /groupIdsForApprovals\(env, networks\)/);
  assert.match(approve, /Approved for \$\{summary\}\./);
  assert.match(approve, /INSERT INTO memberships/);
  assert.equal(denyFn.includes("approvalNetworks"), false);
  assert.equal(denyFn.includes("groupIdsForApprovals"), false);
});

test("copied logos match the files in this repo", () => {
  const files = {
    "/assets/networks/walton-county-business-leaders-logo.png": "assets/networks/walton-county-business-leaders-logo.png",
    "/assets/networks/walton-county-builders-network-logo.jpg": "assets/networks/walton-county-builders-network-logo.jpg",
    "/assets/networks/walton-county-tourism-network-logo.webp": "assets/networks/walton-county-tourism-network-logo.webp",
  };
  for (const [path, file] of Object.entries(files)) {
    const logo = networkLogo(path);
    const bytes = readFileSync(new URL(`../${file}`, import.meta.url));
    assert.equal(Buffer.compare(Buffer.from(logo.bytes), bytes), 0, path);
  }
  assert.equal(networkLogo("/walton-county-business-leaders-logo.png"), null);
});

test("member network copy does not use em or en dashes", () => {
  for (const file of ["../src/networks.js", "../src/hub-pages.js", "../src/hub.js", "../docs/member-hub.md"]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.equal(/[—–]/.test(text), false, file);
  }
});
