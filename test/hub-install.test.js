import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { HUB_HOME_SCRIPT } from "../src/hub-home-script.js";
import { ACTION_COPY } from "../src/hub-copy.js";
import { emailHref, facebookHref, inviteShare, linkedinHref, smsHref, xHref } from "../src/hub-share.js";
import { renderApplications, renderFlagForm, renderLogin, renderNetworkHub, renderProfile, renderWelcome } from "../src/hub-pages.js";
import { NETWORKS } from "../src/networks.js";
import {
  PWA_SHORT_NAMES,
  SERVICE_WORKER_PATH,
  SERVICE_WORKER_SOURCE,
  installPlatform,
  installStepOrder,
  pwaAppleTouchPath,
  pwaAsset,
  pwaManifest,
  pwaManifestPath,
} from "../src/pwa.js";

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

const session = { email: "ada@example.com", csrf: "csrf" };

function pngSize(bytes) {
  assert.equal(bytes[0], 0x89);
  assert.equal(Buffer.from(bytes.slice(12, 16)).toString(), "IHDR");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function hub(network) {
  return renderNetworkHub({
    session,
    admin: false,
    network,
    profile: { name: "Ada Example", company: "Local" },
    posts: [],
    issues: [],
  });
}

test("install platform detection and step order follow the device", () => {
  assert.equal(installPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "ios");
  assert.equal(installPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "ios");
  assert.equal(installPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), "ios");
  assert.equal(installPlatform("Mozilla/5.0 (Linux; Android 14; Pixel)"), "android");
  assert.equal(installPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), "other");
  assert.deepEqual(installStepOrder("ios"), ["ios", "android"]);
  assert.deepEqual(installStepOrder("other"), ["ios", "android"]);
  assert.deepEqual(installStepOrder("android"), ["android", "ios"]);
});

test("each network manifest uses that network name, hub start url, and generated icons", () => {
  const expectedShort = {
    business: "Walton Leaders",
    builders: "Walton Builders",
    tourism: "Walton Tourism",
  };
  for (const network of ["business", "builders", "tourism"]) {
    const manifest = pwaManifest(network);
    assert.equal(manifest.name, NETWORKS[network].name);
    assert.equal(manifest.short_name, expectedShort[network]);
    assert.ok(manifest.short_name.length <= 15, manifest.short_name);
    assert.equal(manifest.id, `/hub/${network}`);
    assert.equal(manifest.start_url, `/hub/${network}`);
    assert.equal(manifest.scope, "/");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.theme_color, "#f6f3ec");
    assert.equal(manifest.background_color, "#f6f3ec");
    const purposes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);
    assert.deepEqual(purposes, ["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const icon of manifest.icons) {
      const file = pwaAsset(icon.src);
      assert.equal(file.type, "image/png");
      const size = Number(icon.sizes.slice(0, 3));
      assert.deepEqual(pngSize(file.body), { width: size, height: size });
    }
    const apple = pwaAsset(pwaAppleTouchPath(network));
    assert.deepEqual(pngSize(apple.body), { width: 180, height: 180 });
    assert.equal(/[—–]/.test(JSON.stringify(manifest)), false);
  }
  assert.notEqual(pwaAsset("/pwa/business-512.png").body.length, pwaAsset("/pwa/business-maskable-512.png").body.length);
  assert.equal(pwaAsset("/pwa/missing.png"), null);
});

test("the service worker is network only and does not cache hub or sign-in traffic", () => {
  assert.match(SERVICE_WORKER_SOURCE, /addEventListener\("fetch"/);
  assert.equal(SERVICE_WORKER_SOURCE.includes("respondWith"), false);
  assert.equal(SERVICE_WORKER_SOURCE.includes("caches"), false);
  assert.equal(SERVICE_WORKER_PATH, "/sw.js");
});

test("invite copy uses each network join page and the share links", () => {
  const expected = {
    business: "I joined the Walton County Business Leaders, a free group that advocates for local business. Join here: https://waltonleaders.org/join",
    builders: "I joined the Walton County Builders Network, a free group that advocates for our industry. Join here: https://waltonbuildersnetwork.org/join",
    tourism: "I joined the Walton County Tourism Network, a free group that advocates for our tourism industry. Join here: https://waltontourism.org/join",
  };
  for (const network of ["business", "builders", "tourism"]) {
    const share = inviteShare(network);
    assert.equal(share.message, expected[network]);
    assert.equal(share.url, NETWORKS[network].join);
    assert.equal(share.subject, `Join me in the ${NETWORKS[network].name}`);
    assert.equal(/[—–]/.test(share.message + share.subject), false);
    assert.equal(smsHref("ios", share.message), `sms:&body=${encodeURIComponent(share.message)}`);
    assert.equal(smsHref("android", share.message), `sms:?body=${encodeURIComponent(share.message)}`);
    assert.match(emailHref(share), /^mailto:\?subject=/);
    assert.ok(emailHref(share).includes(encodeURIComponent(share.subject)));
    assert.ok(emailHref(share).includes(encodeURIComponent(share.message)));
    assert.equal(facebookHref(share.url), `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(share.url)}`);
    assert.equal(linkedinHref(share.url), `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share.url)}`);
    assert.equal(xHref(share), `https://x.com/intent/post?text=${encodeURIComponent(share.message)}&url=${encodeURIComponent(share.url)}`);
  }
});

test("each hub home has the install card, invite share panel, and home screen tags", () => {
  assert.match(HUB_HOME_SCRIPT, /beforeinstallprompt/);
  assert.match(HUB_HOME_SCRIPT, /navigator\.standalone/);
  assert.match(HUB_HOME_SCRIPT, /display-mode: standalone/);
  assert.match(HUB_HOME_SCRIPT, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(HUB_HOME_SCRIPT, /data-ios/);
  assert.match(HUB_HOME_SCRIPT, /navigator\.share/);
  assert.match(HUB_HOME_SCRIPT, /clipboard\.writeText/);
  assert.equal(/[—–]/.test(HUB_HOME_SCRIPT), false);

  for (const network of ["business", "builders", "tourism"]) {
    const html = hub(network);
    const share = inviteShare(network);
    assert.match(html, /<meta name="theme-color" content="#f6f3ec">/);
    assert.match(html, new RegExp(`<link rel="manifest" href="${pwaManifestPath(network)}">`));
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
    assert.match(html, new RegExp(`<meta name="apple-mobile-web-app-title" content="${PWA_SHORT_NAMES[network]}">`));
    assert.match(html, new RegExp(`<link rel="apple-touch-icon" href="${pwaAppleTouchPath(network)}">`));
    assert.match(html, /@media \(display-mode: standalone\) \{\s*\.install-card \{ display: none; \}/);
    assert.match(html, /\.action-grid \{ display: grid; grid-template-columns: 1fr; gap: 14px; \}/);
    assert.match(html, /@media \(min-width: 801px\) \{[\s\S]*\.action-grid \{ grid-template-columns: 1fr 1fr; gap: 22px; \}/);
    assert.match(html, /@media \(min-width: 1180px\) \{\s*\.action-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);

    const grid = html.slice(html.indexOf('class="action-grid"'), html.indexOf('class="member-main"'));
    assert.match(grid, /class="action-card primary"/);
    assert.match(grid, new RegExp(`href="/hub/${network}/flag"`));
    assert.match(grid, />Flag an Issue</);
    assert.equal(grid.includes(NETWORKS[network].join), false);
    assert.match(grid, /data-open-dialog="invite-dialog"/);
    assert.match(grid, />Invite others</);
    assert.match(grid, /Know someone who belongs here\? Send them our join page\./);
    assert.match(grid, /class="action-card install-card"/);
    assert.equal(grid.includes("install-card primary"), false);
    assert.match(grid, />Get the app</);
    assert.match(grid, /Add the member hub to your home screen for one-tap access\./);
    assert.match(grid, /<rect x="7" y="2\.5" width="10" height="19" rx="2"/);
    assert.match(grid, new RegExp(`href="${NETWORKS[network].facebook.replace(/[.]/g, "\\.")}" target="_blank" rel="noopener noreferrer"`));

    const install = html.slice(html.indexOf('id="install-dialog"'), html.indexOf('id="invite-dialog"'));
    assert.match(install, /Open this page in Safari\. On iPhone it must be opened in Safari\./);
    assert.match(install, /Tap the Share button\./);
    assert.match(install, /Tap Add to Home Screen\./);
    assert.match(install, /Tap Add\./);
    assert.match(install, /Tap the menu \(three dots\)\./);
    assert.match(install, /Tap Install app or Add to Home screen\./);
    assert.match(install, /data-platform="ios"/);
    assert.match(install, /data-platform="android"/);
    assert.ok(install.indexOf('data-platform="ios"') < install.indexOf('data-platform="android"'));
    assert.match(install, /id="install-app-button" hidden>Install</);

    const invite = html.slice(html.indexOf('id="invite-dialog"'), html.indexOf("<script>"));
    assert.match(invite, new RegExp(share.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(invite, /id="invite-text"/);
    assert.match(invite, /data-ios="sms:&amp;body=/);
    assert.match(invite, /href="sms:\?body=/);
    assert.match(invite, /data-android="sms:\?body=/);
    assert.ok(invite.includes(encodeURIComponent(share.url)));
    assert.match(invite, /href="mailto:\?subject=/);
    assert.ok(invite.includes(encodeURIComponent(share.subject)));
    assert.match(invite, /href="https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
    assert.match(invite, /href="https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/);
    assert.match(invite, /href="https:\/\/x\.com\/intent\/post\?text=/);
    assert.match(invite, /&amp;url=/);
    for (const label of ["Facebook", "LinkedIn", "X"]) {
      const link = invite.slice(invite.indexOf(`>${label}</a>`) - 220, invite.indexOf(`>${label}</a>`));
      assert.match(link, /target="_blank"/, label);
      assert.match(link, /rel="noopener"/, label);
    }
    const textLink = invite.slice(invite.indexOf('id="invite-text"'), invite.indexOf(">Text</a>"));
    assert.equal(textLink.includes("target="), false);
    const emailLink = invite.slice(invite.indexOf('href="mailto:'), invite.indexOf(">Email</a>"));
    assert.equal(emailLink.includes("target="), false);
    assert.match(invite, /id="invite-copy"/);
    assert.match(invite, new RegExp(`data-url="${share.url.replace(/[.]/g, "\\.")}"`));
    assert.match(invite, /id="invite-copied"[^>]*>Copied</);
    assert.match(invite, /id="invite-more"[^>]*hidden>More</);
    assert.equal(/[—–]/.test(html), false, network);
  }
  assert.equal(ACTION_COPY.appTitle, "Get the app");
  assert.equal(ACTION_COPY.appBody, "Add the member hub to your home screen for one-tap access.");
});

test("manifest and apple tags are on hub pages and not on the admin list", () => {
  for (const network of ["business", "builders", "tourism"]) {
    for (const html of [
      renderWelcome({ session, network }),
      renderProfile({ session, profile: {}, fields: [], network }),
      renderFlagForm({ session, network }),
      renderLogin({ network }),
    ]) {
      assert.match(html, new RegExp(`href="${pwaManifestPath(network)}"`), network);
      assert.match(html, /apple-mobile-web-app-capable/);
      assert.match(html, new RegExp(`apple-mobile-web-app-title" content="${PWA_SHORT_NAMES[network]}"`));
    }
  }
  const admin = renderApplications({ session, network: "", status: "", rows: [] });
  assert.equal(admin.includes("rel=\"manifest\""), false);
  assert.equal(admin.includes("apple-mobile-web-app-capable"), false);
  const chooser = renderLogin();
  assert.equal(chooser.includes("rel=\"manifest\""), false);
});

test("manifest, icons, and the service worker are public and do not replace sign-in", async () => {
  for (const network of ["business", "builders", "tourism"]) {
    const response = await worker.fetch(new Request(`https://waltonleaders.org${pwaManifestPath(network)}`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/manifest\+json/);
    assert.match(response.headers.get("content-security-policy"), /manifest-src 'self'/);
    assert.match(response.headers.get("content-security-policy"), /worker-src 'self'/);
    assert.deepEqual(await response.json(), pwaManifest(network));
    const icon = await worker.fetch(new Request(`https://waltonleaders.org/pwa/${network}-192.png`));
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get("content-type"), /image\/png/);
    assert.match(icon.headers.get("cache-control"), /max-age=86400/);
  }
  const sw = await worker.fetch(new Request("https://waltonleaders.org/sw.js"));
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get("content-type"), /javascript/);
  assert.equal(sw.headers.get("cache-control"), "no-cache");
  assert.equal(await sw.text(), SERVICE_WORKER_SOURCE);
  const head = await worker.fetch(new Request("https://waltonleaders.org/sw.js", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const verify = await worker.fetch(new Request("https://waltonleaders.org/login/verify?token=not-a-real-token"));
  assert.notEqual(verify.headers.get("content-type"), "text/javascript; charset=utf-8");
  const posted = await worker.fetch(new Request("https://waltonleaders.org/sw.js", { method: "POST" }));
  assert.equal(posted.status, 405);

  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.equal(source.split("Content-Security-Policy").length - 1, 1);
  assert.match(source, /manifest-src 'self'/);
  assert.match(source, /worker-src 'self'/);
});
