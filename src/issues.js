import { APPLICATION_SENDERS } from "./application-email.js";
import { networkById, networkId } from "./networks.js";
import { cleanLine, escapeHtml, isEmail, safeUrl } from "./text.js";

export const ISSUE_NOTICE_TO = "marc@whpinc.com";
export const MAX_ISSUE_FILES = 5;
export const MAX_ISSUE_FILE_BYTES = 10 * 1024 * 1024;
export const FLAG_EMAIL_LIMIT = 5;
export const FLAG_IP_LIMIT = 20;

export const ISSUE_STATUSES = [
  { id: "new", label: "New" },
  { id: "looking", label: "Looking into it" },
  { id: "action", label: "Taking action" },
  { id: "closed", label: "Closed" },
];

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const LIMITS = {
  title: 160,
  body: 8000,
  where_text: 300,
  effect: 4000,
  link_url: 500,
};

export function issueStatusLabel(status) {
  return ISSUE_STATUSES.find((item) => item.id === status)?.label || "New";
}

function asciiAt(bytes, offset, length) {
  let text = "";
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(bytes[offset + i]);
  return text;
}

function includesAscii(bytes, needle) {
  const codes = [...needle].map((char) => char.charCodeAt(0));
  const last = bytes.length - codes.length;
  for (let i = 0; i <= last; i += 1) {
    let found = true;
    for (let j = 0; j < codes.length; j += 1) {
      if (bytes[i + j] !== codes[j]) {
        found = false;
        break;
      }
    }
    if (found) return true;
  }
  return false;
}

export function sniffIssueFile(bytes) {
  if (!bytes || bytes.length < 4 || bytes.length > MAX_ISSUE_FILE_BYTES) return "";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 6 && (asciiAt(bytes, 0, 6) === "GIF87a" || asciiAt(bytes, 0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") return "image/webp";
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  if (zip && includesAscii(bytes, "word/")) return DOCX_TYPE;
  return "";
}

export function issueFilename(name, type) {
  const base = String(name || "").replace(/[/\\]/g, " ").replace(/[\u0000-\u001f"]/g, "").trim();
  const clean = base.replace(/[^\w.\- ()]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (clean) return clean;
  if (type === "application/pdf") return "document.pdf";
  if (type === "image/jpeg") return "image.jpg";
  if (type === "image/png") return "image.png";
  if (type === "image/gif") return "image.gif";
  if (type === "image/webp") return "image.webp";
  if (type === DOCX_TYPE) return "document.docx";
  return "file";
}

function realDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateIssue(input) {
  const title = cleanLine(input?.title);
  const body = String(input?.body ?? "").replace(/\r\n/g, "\n").trim();
  const whereText = cleanLine(input?.where_text);
  const effect = String(input?.effect ?? "").replace(/\r\n/g, "\n").trim();
  const deadline = cleanLine(input?.deadline);
  let link = String(input?.link_url ?? "").trim();
  if (!title) return { error: "Tell us what the issue is." };
  if (title.length > LIMITS.title) return { error: "The title is too long." };
  if (!body) return { error: "Tell us what is happening." };
  if (body.length > LIMITS.body) return { error: "That description is too long." };
  if (whereText.length > LIMITS.where_text) return { error: "The location is too long." };
  if (effect.length > LIMITS.effect) return { error: "That note is too long." };
  if (deadline && !realDate(deadline)) return { error: "Use a real date, or leave the date blank." };
  if (link) {
    if (link.length > LIMITS.link_url || !safeUrl(link)) return { error: "The link must be an http or https URL." };
    link = safeUrl(link);
  }
  return {
    value: {
      title,
      body,
      where_text: whereText,
      deadline,
      link_url: link,
      effect,
      contact_ok: input?.contact_ok ? 1 : 0,
    },
  };
}

export async function createFlaggedIssue(db, media, { memberId, network, issue, files, now, id }) {
  const networkOk = networkId(network);
  if (!networkOk) return { ok: false, status: 404, error: "That page is not available." };
  const membership = await db.prepare(
    "SELECT status FROM memberships WHERE member_id = ? AND network = ? AND status = 'approved'",
  ).bind(memberId, networkOk).first();
  if (!membership) return { ok: false, status: 404, error: "That page is not available." };
  const parsed = validateIssue(issue);
  if (parsed.error) return { ok: false, status: 400, error: parsed.error };
  const uploads = (Array.isArray(files) ? files : []).filter((file) => file?.bytes?.length);
  if (uploads.length > MAX_ISSUE_FILES) return { ok: false, status: 400, error: "You can attach up to 5 files." };
  const prepared = [];
  for (const file of uploads) {
    if (file.bytes.length > MAX_ISSUE_FILE_BYTES) return { ok: false, status: 400, error: "Each file must be 10 MB or less." };
    const type = sniffIssueFile(file.bytes);
    if (!type) return { ok: false, status: 400, error: "Files must be a PDF, an image, or a Word document." };
    prepared.push({ filename: issueFilename(file.filename, type), type, bytes: file.bytes });
  }
  if (prepared.length && (!media || typeof media.put !== "function")) {
    return { ok: false, status: 503, error: "File storage is not ready." };
  }
  const issueId = id || crypto.randomUUID();
  const stamp = now || new Date().toISOString();
  const value = parsed.value;
  await db.prepare(`INSERT INTO flagged_issues
    (id, network, member_id, title, body, where_text, deadline, link_url, effect, contact_ok, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`).bind(
    issueId,
    networkOk,
    memberId,
    value.title,
    value.body,
    value.where_text,
    value.deadline,
    value.link_url,
    value.effect,
    value.contact_ok,
    stamp,
    stamp,
  ).run();
  const stored = [];
  try {
    for (const file of prepared) {
      const fileId = crypto.randomUUID();
      const key = `issues/${issueId}/${fileId}`;
      await media.put(key, file.bytes, { httpMetadata: { contentType: file.type } });
      stored.push(key);
      await db.prepare(`INSERT INTO flagged_issue_files
        (id, issue_id, storage_key, filename, content_type, byte_size, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        fileId, issueId, key, file.filename, file.type, file.bytes.length, stamp,
      ).run();
    }
  } catch (error) {
    await db.prepare("DELETE FROM flagged_issue_files WHERE issue_id = ?").bind(issueId).run();
    await db.prepare("DELETE FROM flagged_issues WHERE id = ?").bind(issueId).run();
    if (media && typeof media.delete === "function") {
      for (const key of stored) {
        try {
          await media.delete(key);
        } catch {
          // The issue row is already removed. A leftover object stays private.
        }
      }
    }
    throw error;
  }
  return {
    ok: true,
    issue: { id: issueId, network: networkOk, ...value },
    files: prepared.map((file) => ({ filename: file.filename })),
  };
}

export async function listMemberIssues(db, memberId, network) {
  const result = await db.prepare(
    `SELECT id, title, status, created_at FROM flagged_issues
     WHERE member_id = ? AND network = ?
     ORDER BY created_at DESC`,
  ).bind(memberId, network).all();
  return result.results || [];
}

export async function listFlaggedIssues(db) {
  const result = await db.prepare(
    `SELECT i.id, i.network, i.title, i.status, i.created_at, m.email,
        COALESCE(NULLIF(p.name, ''), NULLIF(m.name, ''), m.email) AS display_name
     FROM flagged_issues i
     JOIN members m ON m.id = i.member_id
     LEFT JOIN member_profiles p ON p.member_id = m.id
     ORDER BY i.created_at DESC
     LIMIT ?`,
  ).bind(200).all();
  return result.results || [];
}

export async function loadFlaggedIssue(db, id) {
  const issue = await db.prepare(
    `SELECT i.id, i.network, i.member_id, i.title, i.body, i.where_text, i.deadline, i.link_url, i.effect,
        i.contact_ok, i.status, i.created_at, i.updated_at, m.email,
        COALESCE(NULLIF(p.name, ''), NULLIF(m.name, ''), m.email) AS display_name
     FROM flagged_issues i
     JOIN members m ON m.id = i.member_id
     LEFT JOIN member_profiles p ON p.member_id = m.id
     WHERE i.id = ?`,
  ).bind(id).first();
  if (!issue) return null;
  const files = await db.prepare(
    "SELECT id, filename, content_type, byte_size FROM flagged_issue_files WHERE issue_id = ? ORDER BY created_at, filename",
  ).bind(id).all();
  return { issue, files: files.results || [] };
}

export async function updateIssueStatus(db, id, status, now) {
  if (!ISSUE_STATUSES.some((item) => item.id === status)) return { ok: false, error: "Choose a status." };
  const result = await db.prepare(
    "UPDATE flagged_issues SET status = ?, updated_at = ? WHERE id = ?",
  ).bind(status, now || new Date().toISOString(), id).run();
  if (!result?.meta || result.meta.changes < 1) return { ok: false, error: "That issue is not available." };
  return { ok: true };
}

export async function readIssueFile(db, media, issueId, fileId) {
  const row = await db.prepare(
    "SELECT storage_key, filename, content_type FROM flagged_issue_files WHERE id = ? AND issue_id = ?",
  ).bind(fileId, issueId).first();
  if (!row || !media || typeof media.get !== "function") return null;
  const object = await media.get(row.storage_key);
  if (!object) return null;
  return { filename: row.filename, contentType: row.content_type, body: object.body };
}

function noticeOrigin(origin) {
  try {
    const url = new URL(String(origin || ""));
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // Fall through to the public site.
  }
  return "https://waltonleaders.org";
}

export function buildFlagNotice({ network, memberEmail, memberName, issue, files, origin }) {
  const sender = APPLICATION_SENDERS[network];
  const replyTo = String(memberEmail ?? "").trim();
  if (!sender || !issue?.id || !isEmail(replyTo)) return null;
  const adminUrl = `${noticeOrigin(origin)}/admin/issues/${issue.id}`;
  const who = cleanLine(memberName) || replyTo;
  const networkName = networkById(network)?.name || sender.name;
  const fileLines = (files || []).map((file) => file.filename).filter(Boolean);
  const lines = [
    `A member flagged an issue for ${networkName}.`,
    "",
    `Title: ${issue.title}`,
    `Member: ${who} <${replyTo}>`,
    `Where: ${issue.where_text || "(not provided)"}`,
    `Deadline: ${issue.deadline || "(not provided)"}`,
    `Link: ${issue.link_url || "(not provided)"}`,
    `OK to contact: ${issue.contact_ok ? "Yes" : "No"}`,
    "",
    "What's happening:",
    issue.body || "",
    "",
    "How it affects them:",
    issue.effect || "(not provided)",
    "",
    "Files:",
    fileLines.length ? fileLines.map((name) => `- ${name}`).join("\n") : "(none)",
    "",
    "Open it in the admin hub:",
    adminUrl,
  ];
  const text = lines.join("\n");
  const subject = `Flagged issue: ${cleanLine(issue.title)}`;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f6f3ec;color:#001840;font-family:Georgia,serif;">
  <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(networkName)}</p>
  <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">${escapeHtml(subject)}</h1>
  <p>Member: ${escapeHtml(who)} &lt;${escapeHtml(replyTo)}&gt;</p>
  <p style="white-space:pre-wrap;">${escapeHtml(text)}</p>
  <p><a href="${escapeHtml(adminUrl)}" style="color:#001840;">Open this issue</a></p>
</body>
</html>`;
  const boundary = `walton-${crypto.randomUUID()}`;
  const raw = [
    `From: ${sender.name} <${sender.email}>`,
    `To: ${ISSUE_NOTICE_TO}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { from: sender.email, to: ISSUE_NOTICE_TO, replyTo, subject, raw };
}
