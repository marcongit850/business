export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cleanLine(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function safeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 500 || /[\s<>"']/.test(raw)) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  return url.toString();
}

export function slugify(value) {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug;
}

export function isSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

export function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function networkLabel(network) {
  if (network === "business") return "Business Leaders";
  if (network === "builders") return "Builders";
  if (network === "tourism") return "Tourism";
  return "";
}

export function phoneDisplay(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw;
}

export function phoneHref(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (!digits || !/^[\d+().\-\s]+$/.test(raw)) return "";
  return `tel:${raw.replace(/\s/g, "")}`;
}

export function externalUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 500 || /[\s<>"'\\]/.test(raw) || raw.startsWith("//")) return "";
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (!hasScheme) {
    const host = raw.split("/")[0].split("?")[0].split("#")[0].replace(/:\d+$/, "");
    if (!/^[a-z0-9.-]*\.[a-z]{2,}\.?$/i.test(host)) return "";
  }
  return safeUrl(hasScheme ? raw : `https://${raw}`);
}

export function safeReturnPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 500 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "";
  let url;
  try {
    url = new URL(raw, "https://waltonleaders.org");
  } catch {
    return "";
  }
  if (url.origin !== "https://waltonleaders.org" || url.username || url.password) return "";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/admin" && path !== "/hub" && !path.startsWith("/admin/") && !path.startsWith("/hub/")) return "";
  return `${path}${url.search}`;
}

export function signInDestination(isAdmin, next) {
  const safe = safeReturnPath(next);
  if (safe) return safe;
  return isAdmin ? "/admin" : "/hub";
}

export function loginPath({ notice = "", sent = false, next = "" } = {}) {
  const params = new URLSearchParams();
  if (sent) params.set("sent", "1");
  if (notice) params.set("notice", notice);
  const safe = safeReturnPath(next);
  if (safe) params.set("next", safe);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

export function verifyLinkPath(token, next) {
  const params = new URLSearchParams();
  params.set("token", String(token ?? ""));
  const safe = safeReturnPath(next);
  if (safe) params.set("next", safe);
  return `/login/verify?${params.toString()}`;
}

export function applicationNoteText(note, network) {
  const when = formatWhen(note?.created_at) || "Unknown time";
  const author = String(note?.author_email || "").trim() || "Admin";
  const where = networkLabel(network) || "Network";
  const body = String(note?.body || "").replace(/\r\n/g, "\n").trim();
  return `${when} · ${author} · ${where} application\n${body}`;
}

export function mergeAdminNotes(existing, blocks, limit = 10000) {
  let body = String(existing ?? "");
  const start = body;
  const fitted = [];
  blocks.forEach((block, index) => {
    const text = String(block ?? "");
    if (!text) return;
    if (body.includes(text)) {
      fitted.push(index);
      return;
    }
    const next = body ? `${body}\n\n${text}` : text;
    if (next.length > limit) return;
    body = next;
    fitted.push(index);
  });
  return { body, fitted, changed: body !== start };
}

function inlineMarkdown(raw) {
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;
  const parts = [];
  let last = 0;
  for (const match of raw.matchAll(pattern)) {
    parts.push(escapeHtml(raw.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(`<code>${escapeHtml(token.slice(1, -1))}</code>`);
    } else if (token.startsWith("**")) {
      parts.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith("*")) {
      parts.push(`<em>${escapeHtml(token.slice(1, -1))}</em>`);
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const href = safeUrl(link[2]);
      const label = escapeHtml(link[1]);
      parts.push(href ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>` : label);
    }
    last = match.index + token.length;
  }
  parts.push(escapeHtml(raw.slice(last)));
  return parts.join("");
}

export function renderMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length + 1;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote><p>${inlineMarkdown(quote.join(" "))}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^[-*]\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inlineMarkdown(lines[i].replace(/^\d+\.\s+/, ""))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    paragraph.push(line.trim());
    i += 1;
  }
  flush();
  return out.join("\n");
}
