import { cleanLine } from "./text.js";
import { PROFILE_LIMITS } from "./validate.js";

// Application answers that match a profile column. The first non-empty key wins.
// company_fax is the public form honeypot and is never a profile field.
const PROFILE_SOURCES = {
  name: ["name"],
  company: ["company", "business"],
  role_title: ["role_title", "role"],
  phone: ["phone"],
  location: ["location"],
  website: ["website"],
  bio: ["bio", "about"],
};

export const PROFILE_COLUMNS = Object.keys(PROFILE_SOURCES);

const BLANK_SQL = "trim(member_profiles.$col, char(9) || char(10) || char(13) || ' ') = ''";

export function emptyProfile() {
  return { name: "", company: "", role_title: "", phone: "", location: "", website: "", bio: "" };
}

export function profileHasBlank(profile) {
  return PROFILE_COLUMNS.some((key) => !String(profile?.[key] ?? "").trim());
}

function fieldBag(application) {
  const fields = application?.fields;
  if (fields && typeof fields === "object" && !Array.isArray(fields)) return fields;
  try {
    const value = JSON.parse(application?.fields_json || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  } catch {
    return {};
  }
}

function answerText(value, multiline) {
  if (multiline) return String(value ?? "").replace(/\r\n/g, "\n").trim();
  return cleanLine(value);
}

export function profileAnswersFromApplication(application) {
  const fields = fieldBag(application);
  const answers = {};
  for (const [column, keys] of Object.entries(PROFILE_SOURCES)) {
    let value = "";
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
      const text = answerText(fields[key], column === "bio");
      if (!text) continue;
      value = text;
      break;
    }
    if (!value && column === "name") value = cleanLine(application?.name);
    if (!value || value.length > PROFILE_LIMITS[column]) continue;
    answers[column] = value;
  }
  return answers;
}

export function fillEmptyProfile(existing, answers) {
  const profile = { ...emptyProfile(), ...(existing || {}) };
  let changed = false;
  for (const key of PROFILE_COLUMNS) {
    if (String(profile[key] ?? "").trim()) continue;
    if (!answers?.[key]) continue;
    profile[key] = answers[key];
    changed = true;
  }
  return { profile, changed };
}

function fillSql() {
  const sets = PROFILE_COLUMNS.map((column) => {
    const blank = BLANK_SQL.replace("$col", column);
    return `${column} = CASE WHEN ${blank} THEN excluded.${column} ELSE member_profiles.${column} END`;
  });
  return `INSERT INTO member_profiles (member_id, ${PROFILE_COLUMNS.join(", ")}, updated_at)
    VALUES (?, ${PROFILE_COLUMNS.map(() => "?").join(", ")}, ?)
    ON CONFLICT(member_id) DO UPDATE SET
      ${sets.join(",\n      ")},
      updated_at = excluded.updated_at`;
}

export async function fillProfileFromApplications(db, memberId, existing, applications, now) {
  let profile = { ...emptyProfile(), ...(existing || {}) };
  let changed = false;
  for (const application of applications || []) {
    const merged = fillEmptyProfile(profile, profileAnswersFromApplication(application));
    profile = merged.profile;
    changed = changed || merged.changed;
  }
  if (!changed) return { profile, changed: false };
  await db.prepare(fillSql()).bind(
    memberId,
    ...PROFILE_COLUMNS.map((key) => profile[key] || ""),
    now,
  ).run();
  const stored = await db.prepare(
    `SELECT ${PROFILE_COLUMNS.join(", ")} FROM member_profiles WHERE member_id = ?`,
  ).bind(memberId).first();
  return { profile: { ...emptyProfile(), ...(stored || profile) }, changed: true };
}
