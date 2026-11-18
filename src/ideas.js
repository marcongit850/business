import { APPLICATION_SENDERS } from "./application-email.js";
import { networkById, networkId } from "./networks.js";
import { cleanLine, escapeHtml, isEmail } from "./text.js";

export const IDEA_NOTICE_TO = "marc@whpinc.com";
export const IDEA_BODY_LIMIT = 2000;
export const IDEA_EMAIL_LIMIT = 5;
export const IDEA_IP_LIMIT = 20;

export const IDEA_STATUSES = [
  { id: "new", label: "New" },
  { id: "read", label: "Read" },
];

export function ideaStatusLabel(status) {
  return IDEA_STATUSES.find((item) => item.id === status)?.label || "New";
}

export function validateIdea(input) {
  const body = String(input?.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) return { error: "Share your idea before sending." };
  if (body.length > IDEA_BODY_LIMIT) return { error: "Keep the idea to 2000 characters." };
  return { value: { body } };
}

export async function createMemberIdea(db, { memberId, network, body, now, id }) {
  const networkOk = networkId(network);
  if (!networkOk) return { ok: false, status: 404, error: "That page is not available." };
  const membership = await db.prepare(
    "SELECT status FROM memberships WHERE member_id = ? AND network = ? AND status = 'approved'",
  ).bind(memberId, networkOk).first();
  if (!membership) return { ok: false, status: 404, error: "That page is not available." };
  const parsed = validateIdea({ body });
  if (parsed.error) return { ok: false, status: 400, error: parsed.error };
  const ideaId = id || crypto.randomUUID();
  const stamp = now || new Date().toISOString();
  await db.prepare(`INSERT INTO member_ideas
    (id, member_id, network, body, created_at, status)
    VALUES (?, ?, ?, ?, ?, 'new')`).bind(
    ideaId,
    memberId,
    networkOk,
    parsed.value.body,
    stamp,
  ).run();
  return {
    ok: true,
    idea: { id: ideaId, network: networkOk, body: parsed.value.body, created_at: stamp, status: "new" },
  };
}

export async function listMemberIdeas(db) {
  const result = await db.prepare(
    `SELECT i.id, i.network, i.body, i.status, i.created_at, m.email,
        COALESCE(NULLIF(p.name, ''), NULLIF(m.name, ''), m.email) AS display_name
     FROM member_ideas i
     JOIN members m ON m.id = i.member_id
     LEFT JOIN member_profiles p ON p.member_id = m.id
     ORDER BY i.created_at DESC
     LIMIT ?`,
  ).bind(200).all();
  return result.results || [];
}

export async function markIdeaRead(db, id) {
  const existing = await db.prepare("SELECT id, status FROM member_ideas WHERE id = ?").bind(id).first();
  if (!existing) return { ok: false, error: "That idea is not available." };
  if (existing.status !== "read") {
    await db.prepare("UPDATE member_ideas SET status = 'read' WHERE id = ?").bind(id).run();
  }
  return { ok: true };
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

export function buildIdeaNotice({ network, memberEmail, memberName, idea, origin }) {
  const sender = APPLICATION_SENDERS[network];
  const replyTo = String(memberEmail ?? "").trim();
  if (!sender || !idea?.id || !isEmail(replyTo)) return null;
  const adminUrl = `${noticeOrigin(origin)}/admin/ideas#idea-${idea.id}`;
  const who = cleanLine(memberName) || replyTo;
  const networkName = networkById(network)?.name || sender.name;
  const lines = [
    `A member shared an idea for ${networkName}.`,
    "",
    `Member: ${who} <${replyTo}>`,
    `Network: ${networkName}`,
    "",
    "Idea:",
    idea.body || "",
    "",
    "Open it in the admin hub:",
    adminUrl,
  ];
  const text = lines.join("\n");
  const subject = `Member idea for ${networkName}`;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f6f3ec;color:#001840;font-family:Georgia,serif;">
  <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(networkName)}</p>
  <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">${escapeHtml(subject)}</h1>
  <p>Member: ${escapeHtml(who)} &lt;${escapeHtml(replyTo)}&gt;</p>
  <p>Network: ${escapeHtml(networkName)}</p>
  <p style="white-space:pre-wrap;">${escapeHtml(idea.body || "")}</p>
  <p><a href="${escapeHtml(adminUrl)}" style="color:#001840;">Open this idea</a></p>
</body>
</html>`;
  const boundary = `walton-${crypto.randomUUID()}`;
  const raw = [
    `From: ${sender.name} <${sender.email}>`,
    `To: ${IDEA_NOTICE_TO}`,
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
  return { from: sender.email, to: IDEA_NOTICE_TO, replyTo, subject, raw };
}
