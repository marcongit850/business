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

function followEarnPhrase() {
  if (POINT_VALUES.facebook === POINT_VALUES.linkedin) {
    return `+${POINT_VALUES.facebook} points each for Facebook and LinkedIn`;
  }
  return `+${POINT_VALUES.facebook} points for Facebook and +${POINT_VALUES.linkedin} points for LinkedIn`;
}

export const POINTS_EARN = `Ways to earn: welcome bonus +${POINT_VALUES.welcome}, +${POINT_VALUES.referral} points for each invite who is approved, +${POINT_VALUES.install} points for installing the app, and ${followEarnPhrase()}. Follows count once on each network.`;

export function actionEarnText(kind) {
  if (kind === "referral") return `+${POINT_VALUES.referral} points for each invite who is approved`;
  if (kind === "install") return `+${POINT_VALUES.install} points`;
  if (kind === "social") {
    if (POINT_VALUES.facebook === POINT_VALUES.linkedin) return `+${POINT_VALUES.facebook} points each`;
    return `+${POINT_VALUES.facebook} points for Facebook, +${POINT_VALUES.linkedin} points for LinkedIn`;
  }
  return "";
}

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

function shownPoints(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? `+${amount}` : "0";
}

export function pointsBreakdown(summary) {
  const value = summary || emptyPoints();
  return `Welcome bonus ${shownPoints(value.welcome)}. Referrals ${shownPoints(value.referral)}. App install ${shownPoints(value.install)}. Facebook ${shownPoints(value.facebook)}. LinkedIn ${shownPoints(value.linkedin)}.`;
}
