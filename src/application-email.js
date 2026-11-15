import { escapeHtml, isEmail } from "./text.js";

// Applicant thank-you copy. Edit this file, then match docs/welcome-emails.md.
export const APPLICATION_SENDERS = {
  business: {
    name: "Walton County Business Leaders",
    email: "hello@waltonleaders.org",
  },
  builders: {
    name: "Walton County Builders Network",
    email: "hello@waltonbuildersnetwork.org",
  },
  tourism: {
    name: "Walton County Tourism Network",
    email: "hello@waltontourism.org",
  },
};

const REACH = "We're a brand new organization, and we're working hard to reach our first 500 members.";

export function applicantGreeting(name) {
  const first = String(name ?? "").trim().split(/\s+/)[0] || "";
  return first ? `Hi ${first},` : "Hi there,";
}

export function applicationThankYouCopy(network, name) {
  const sender = APPLICATION_SENDERS[network];
  if (!sender) return null;
  const greeting = applicantGreeting(name);
  const paragraphs = [
    `Thank you for applying to join ${sender.name}. ${REACH}`,
    "We'll review your application and get back to you shortly.",
  ];
  return {
    fromName: sender.name,
    fromEmail: sender.email,
    replyTo: sender.email,
    subject: `Thanks for applying to ${sender.name}`,
    greeting,
    paragraphs,
    signoff: sender.name,
    text: [greeting, "", paragraphs[0], "", paragraphs[1], "", sender.name].join("\n"),
  };
}

function thankYouHtml(copy) {
  const paragraph = (text, margin) =>
    `<p style="margin:${margin};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#001840;">${escapeHtml(text)}</p>`;
  const blocks = [
    paragraph(copy.greeting, "0 0 16px"),
    ...copy.paragraphs.map((text) => paragraph(text, "0 0 16px")),
    `<p style="margin:24px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.4;color:#001840;">${escapeHtml(copy.signoff)}</p>`,
  ].join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f3ec;color:#001840;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec;">
<tr>
<td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-top:4px solid #d0a040;">
<tr>
<td style="padding:32px 28px;">
${blocks}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function buildApplicationThankYou({ network, name, email }) {
  const copy = applicationThankYouCopy(network, name);
  const to = String(email ?? "").trim();
  if (!copy || !isEmail(to)) return null;
  return {
    to,
    from: { email: copy.fromEmail, name: copy.fromName },
    replyTo: copy.replyTo,
    subject: copy.subject,
    text: copy.text,
    html: thankYouHtml(copy),
  };
}

function logError(message, error) {
  console.error(JSON.stringify({ message, error: error instanceof Error ? error.message : String(error) }));
}

export async function sendApplicationThankYou(env, application) {
  const message = buildApplicationThankYou(application);
  if (!message) return;
  if (!env?.EMAIL || typeof env.EMAIL.send !== "function") {
    console.error(JSON.stringify({ message: "email binding missing", action: "application-thank-you" }));
    return;
  }
  await env.EMAIL.send({
    to: message.to,
    from: message.from,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export function scheduleApplicationThankYou(ctx, env, application) {
  try {
    if (!buildApplicationThankYou(application)) return;
    const run = sendApplicationThankYou(env, application).catch((error) => {
      logError("application thank-you email failed", error);
    });
    if (!ctx || typeof ctx.waitUntil !== "function") {
      logError("application thank-you email was not scheduled", new Error("missing ctx.waitUntil"));
      return;
    }
    ctx.waitUntil(run);
  } catch (error) {
    logError("application thank-you email was not scheduled", error);
  }
}
