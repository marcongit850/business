import { NETWORKS } from "./networks.js";
import { PWA_ICONS } from "./pwa-icons.js";

export const PWA_THEME_COLOR = "#f6f3ec";
export const PWA_BACKGROUND_COLOR = "#f6f3ec";

// Home screen labels stay within 15 characters. The manifest name is the full network name.
export const PWA_SHORT_NAMES = {
  business: "Walton Leaders",
  builders: "Walton Builders",
  tourism: "Walton Tourism",
};

export const SERVICE_WORKER_PATH = "/sw.js";

// Empty fetch listener: the browser keeps handling every request, including
// magic-link redirects and session cookies. Nothing is cached.
export const SERVICE_WORKER_SOURCE = `self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function () {});
`;

export function installPlatform(userAgent, platformName = "", maxTouchPoints = 0) {
  const ua = String(userAgent || "");
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (platformName === "MacIntel" && Number(maxTouchPoints) > 1);
  if (appleMobile) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function installStepOrder(platform) {
  return platform === "android" ? ["android", "ios"] : ["ios", "android"];
}

export function pwaManifest(network) {
  const brand = NETWORKS[network];
  const shortName = PWA_SHORT_NAMES[network];
  if (!brand || !shortName) return null;
  const start = `/hub/${network}`;
  return {
    id: start,
    name: brand.name,
    short_name: shortName,
    start_url: start,
    scope: "/",
    display: "standalone",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons: [
      { src: `/pwa/${network}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa/${network}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/pwa/${network}-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export function pwaManifestPath(network) {
  return `/pwa/${network}.webmanifest`;
}

export function pwaAppleTouchPath(network) {
  return `/pwa/${network}-180.png`;
}

function decodeIcon(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pwaAsset(pathname) {
  if (pathname === SERVICE_WORKER_PATH) {
    return { type: "text/javascript; charset=utf-8", cache: "no-cache", body: SERVICE_WORKER_SOURCE };
  }
  const manifestMatch = /^\/pwa\/(business|builders|tourism)\.webmanifest$/.exec(pathname);
  if (manifestMatch) {
    const manifest = pwaManifest(manifestMatch[1]);
    if (!manifest) return null;
    return {
      type: "application/manifest+json; charset=utf-8",
      cache: "public, max-age=3600",
      body: JSON.stringify(manifest),
    };
  }
  const icon = PWA_ICONS[pathname];
  if (!icon) return null;
  return { type: "image/png", cache: "public, max-age=86400", body: decodeIcon(icon) };
}
