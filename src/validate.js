import { networkId, NETWORK_IDS } from "./networks.js";
import { cleanLine, isEmail, isSlug, safeUrl, slugify } from "./text.js";

export const NETWORKS = NETWORK_IDS;
export const CONTENT_TYPES = ["page", "announcement", "resource", "post"];

export const PROFILE_LIMITS = {
  name: 120,
  company: 160,
  role_title: 120,
  phone: 40,
  location: 120,
  website: 300,
  bio: 2000,
};

export function normalizeEmail(value) {
  return cleanLine(value).toLowerCase();
}

export function validateIngest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Invalid input" };
  if (body.network !== "builders" && body.network !== "tourism") return { error: "Invalid input" };
  const name = cleanLine(body.name);
  const email = normalizeEmail(body.email);
  if (!name || name.length > 200 || !isEmail(email)) return { error: "Invalid input" };
  const submitted = Date.parse(body.submitted_at);
  if (!Number.isFinite(submitted)) return { error: "Invalid input" };
  if (submitted < Date.parse("2020-01-01T00:00:00.000Z") || submitted > Date.now() + 24 * 60 * 60 * 1000) return { error: "Invalid input" };
  const source = String(body.source_url ?? "").trim();
  if (!safeUrl(source)) return { error: "Invalid input" };
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return { error: "Invalid input" };
  const keys = Object.keys(body.fields);
  if (keys.length > 40) return { error: "Invalid input" };
  const fields = {};
  for (const key of keys) {
    if (!cleanLine(key) || key.length > 80) return { error: "Invalid input" };
    const value = body.fields[key];
    if (typeof value !== "string" || value.length > 4000) return { error: "Invalid input" };
    fields[key] = value;
  }
  return {
    value: {
      network: body.network,
      name,
      email,
      submitted_at: new Date(submitted).toISOString(),
      source_url: safeUrl(source),
      fields,
    },
  };
}

export function validateProfile(input, fieldRows) {
  const profile = {};
  for (const [key, limit] of Object.entries(PROFILE_LIMITS)) {
    const value = key === "bio" ? String(input[key] ?? "").replace(/\r\n/g, "\n").trim() : cleanLine(input[key]);
    if (value.length > limit) return { error: `${key.replaceAll("_", " ")} is too long.` };
    profile[key] = value;
  }
  if (profile.website && !safeUrl(profile.website)) return { error: "Website must be an http or https link." };
  if (profile.website) profile.website = safeUrl(profile.website);
  if (!Array.isArray(fieldRows)) return { error: "Custom fields are invalid." };
  const fields = [];
  for (const row of fieldRows) {
    const label = cleanLine(row.label);
    const value = String(row.value ?? "").replace(/\r\n/g, "\n").trim();
    if (!label && !value) continue;
    if (row.remove) continue;
    if (!label) return { error: "Each custom field needs a label." };
    if (label.length > 60) return { error: "A custom field label is too long." };
    if (value.length > 1000) return { error: "A custom field value is too long." };
    fields.push({ id: cleanLine(row.id), label, value });
  }
  if (fields.length > 20) return { error: "You can save up to 20 custom fields." };
  return { value: { profile, fields } };
}

export function validateContent(input) {
  const network = input.network;
  const type = input.type;
  if (!NETWORKS.includes(network) || !CONTENT_TYPES.includes(type)) return { error: "Choose a network and a type." };
  const title = cleanLine(input.title);
  if (!title || title.length > 160) return { error: "Title is required and must be 160 characters or fewer." };
  const requested = cleanLine(input.slug).toLowerCase();
  const slug = requested || slugify(title);
  if (!isSlug(slug)) return { error: "Use a slug of lowercase letters, numbers, and hyphens." };
  if (slug === "profile" || slug === "flag" || slug === "welcome") return { error: "That slug is reserved. Pick another one." };
  const body = String(input.body ?? "").replace(/\r\n/g, "\n");
  if (body.length > 20000) return { error: "Body is too long." };
  const description = String(input.description ?? "").replace(/\r\n/g, "\n").trim();
  if (description.length > 1000) return { error: "Description is too long." };
  let link = String(input.link_url ?? "").trim();
  if (link) {
    if (!safeUrl(link)) return { error: "Link must be an http or https URL." };
    link = safeUrl(link);
  }
  if (type === "resource" && !link) return { error: "A resource needs a link." };
  const alt = cleanLine(input.image_alt);
  if (alt.length > 180) return { error: "Image description is too long." };
  return {
    value: {
      network,
      type,
      title,
      slug,
      body,
      description,
      link_url: link,
      pinned: input.pinned ? 1 : 0,
      share_all: input.share_all ? 1 : 0,
      image_alt: alt,
    },
  };
}

export function groupIdsForApproval(env, network) {
  const suffix = network.toUpperCase();
  const names = [`MAILERLITE_GROUP_MASTER`, `MAILERLITE_GROUP_${suffix}`, `MAILERLITE_GROUP_${suffix}_APPROVED`];
  return names.map((name) => String(env?.[name] ?? "").trim()).filter(Boolean);
}

export function approvalNetworks(applied, selected) {
  const base = networkId(applied);
  if (!base) return [];
  const picked = new Set([base]);
  const values = Array.isArray(selected) ? selected : [];
  for (const value of values) {
    const id = networkId(value);
    if (id) picked.add(id);
  }
  return [base, ...NETWORK_IDS.filter((id) => id !== base && picked.has(id))];
}

export function groupIdsForApprovals(env, networks) {
  const ids = [];
  for (const network of networks) {
    for (const id of groupIdsForApproval(env, network)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export function mailerLitePayload(email, name, groupIds) {
  const payload = {
    email,
    fields: { name },
    status: "active",
  };
  if (groupIds.length) payload.groups = groupIds;
  return payload;
}

export function firstPublishedAt(current, now, publishing) {
  if (!publishing) return current || null;
  return current || now;
}
