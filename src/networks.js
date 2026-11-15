// Shared catalog for the three member networks.
// Seals are copied into assets/networks and served by this Worker.
// Business and Tourism seals are round. The Builders mark is a square tile.
// All three public sites use the same navy (#001840) and gold (#d0a040).

export const NETWORK_IDS = ["business", "builders", "tourism"];

export const NETWORKS = {
  business: {
    id: "business",
    name: "Walton County Business Leaders",
    kicker: "Walton County",
    title: "Business Leaders",
    logo: "/assets/networks/walton-county-business-leaders-logo.png",
    mark: "seal",
    site: "https://waltonleaders.org/",
    siteLabel: "waltonleaders.org",
    join: "https://waltonleaders.org/join",
    facebook: "https://www.facebook.com/groups/waltonbusinessleaders/",
    accent: "#d0a040",
  },
  builders: {
    id: "builders",
    name: "Walton County Builders Network",
    kicker: "Walton County",
    title: "Builders Network",
    logo: "/assets/networks/walton-county-builders-network-logo.jpg",
    mark: "tile",
    site: "https://waltonbuildersnetwork.org/",
    siteLabel: "waltonbuildersnetwork.org",
    join: "https://waltonbuildersnetwork.org/join",
    facebook: "https://www.facebook.com/groups/waltonbuildersnetwork/",
    accent: "#d0a040",
  },
  tourism: {
    id: "tourism",
    name: "Walton County Tourism Network",
    kicker: "Walton County",
    title: "Tourism Network",
    logo: "/assets/networks/walton-county-tourism-network-logo.webp",
    mark: "seal",
    site: "https://waltontourism.org/",
    siteLabel: "waltontourism.org",
    join: "https://waltontourism.org/join",
    facebook: "https://www.facebook.com/groups/waltontourism",
    accent: "#d0a040",
  },
};

export function networkId(value) {
  const id = String(value ?? "").trim();
  return NETWORK_IDS.includes(id) ? id : "";
}

export function networkById(value) {
  const id = networkId(value);
  return id ? NETWORKS[id] : null;
}

export function networkList() {
  return NETWORK_IDS.map((id) => NETWORKS[id]);
}

export function loginNetworkFromUrl(url) {
  const path = url.pathname || "";
  const fromPath = /^\/login\/(business|builders|tourism)$/.exec(path);
  if (fromPath) return fromPath[1];
  if (path === "/login" || path === "/login.html") return networkId(url.searchParams.get("network"));
  return "";
}

export function approvalSummary(networks) {
  return networks.map((id) => networkById(id)?.name || "").filter(Boolean).join(", ");
}
