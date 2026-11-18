// Points are one total per member, across every network.
// Welcome and app install are once per person. A referral is once per
// referred person. Facebook and LinkedIn follows are once per network,
// and those points add into the same total.

export const POINT_VALUES = {
  welcome: 10,
  referral: 10,
  install: 5,
  facebook: 2,
  linkedin: 2,
};

export const CLAIMABLE_POINTS = ["install", "facebook", "linkedin"];

export const POINTS_EARN = "How to earn more: 10 points when someone you invite is approved, 5 points once for installing the app, and 2 points each for following on Facebook and on LinkedIn. Follows count once on each network.";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;

export function randomReferralCode(bytes) {
  const source = bytes || crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[source[index] % ALPHABET.length];
  }
  return code;
}

export function normalizeReferralCode(value) {
  const code = String(value ?? "").trim().toLowerCase();
  if (code.length !== CODE_LENGTH) return "";
  for (const char of code) {
    if (!ALPHABET.includes(char)) return "";
  }
  return code;
}

export function referralJoinUrl(joinUrl, code) {
  const normalized = normalizeReferralCode(code);
  const base = String(joinUrl || "");
  if (!normalized || !base) return base;
  const url = new URL(base);
  url.searchParams.set("ref", normalized);
  return url.toString();
}

export function emptyPoints() {
  return {
    total: 0,
    welcome: 0,
    referral: 0,
    install: 0,
    facebook: 0,
    linkedin: 0,
    installed: false,
    followedFacebook: false,
    followedLinkedin: false,
  };
}

export function summarizePoints(rows, network = "") {
  const summary = emptyPoints();
  for (const row of rows || []) {
    const points = Number(row.points) || 0;
    const kind = row.kind;
    if (!Object.hasOwn(POINT_VALUES, kind)) continue;
    summary.total += points;
    summary[kind] += points;
    if (kind === "install") summary.installed = true;
    if (kind === "facebook" && row.network === network) summary.followedFacebook = true;
    if (kind === "linkedin" && row.network === network) summary.followedLinkedin = true;
  }
  return summary;
}

export function pointsBreakdown(summary) {
  const value = summary || emptyPoints();
  return `Welcome bonus ${value.welcome || 0}. Referrals ${value.referral || 0}. App install ${value.install || 0}. Facebook ${value.facebook || 0}. LinkedIn ${value.linkedin || 0}.`;
}
