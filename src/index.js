const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    console.log(
      JSON.stringify({
        message: "request",
        method: request.method,
        path: url.pathname,
      }),
    );

    if (request.method === "POST" && url.pathname === "/contact") {
      return handleContact(request);
    }

    if (request.method === "GET" && url.pathname === "/contact") {
      return Response.redirect(new URL("/#contact", url.origin), 303);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse("Use the contact form on the homepage.", 405);
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status === 404 && url.pathname !== "/404.html") {
      const missing = await env.ASSETS.fetch(
        new Request(new URL("/404.html", url.origin), { method: request.method }),
      );
      if (missing.ok) {
        return withSecurityHeaders(missing, 404);
      }
    }

    return withSecurityHeaders(assetResponse, assetResponse.status);
  },
};

async function handleContact(request) {
  let form;
  try {
    form = await request.formData();
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "contact form could not be read",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return htmlResponse(messagePage("Please use the contact form on the homepage."), 400);
  }

  const name = fieldValue(form.get("name"));
  const email = fieldValue(form.get("email"));
  const message = fieldValue(form.get("message"));
  const errorText = validationMessage(name, email, message);

  if (errorText) {
    return htmlResponse(
      messagePage(
        "Contact us",
        `<p class="form-error">${escapeHtml(errorText)}</p>${contactForm(name, email, message)}`,
      ),
      400,
    );
  }

  console.log(JSON.stringify({ message: "contact received" }));
  return htmlResponse(
    messagePage("Thank you for getting in touch.", "<p>We received your message.</p>"),
    200,
  );
}

function fieldValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validationMessage(name, email, message) {
  if (!name || !email || !message) {
    return "Please complete your name, email, and message.";
  }
  if (name.length > 120 || email.length > 200 || message.length > 5000) {
    return "Please shorten your name, email, or message and try again.";
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "Please enter a valid email address.";
  }
  return "";
}

function contactForm(name, email, message) {
  return `<form class="contact-form" action="/contact" method="post">
    <div class="field">
      <label for="name">Name</label>
      <input id="name" name="name" type="text" required autocomplete="name" maxlength="120" value="${escapeHtml(name)}">
    </div>
    <div class="field">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="email" maxlength="200" value="${escapeHtml(email)}">
    </div>
    <div class="field">
      <label for="message">Message</label>
      <textarea id="message" name="message" required rows="6" maxlength="5000">${escapeHtml(message)}</textarea>
    </div>
    <button class="button" type="submit">Send message</button>
  </form>`;
}

function messagePage(heading, extra = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(heading)} | Walton County Business Leaders</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#f6f3ec">
    <link rel="icon" href="/favicon.png" type="image/png">
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="/" aria-label="Walton County Business Leaders home">
          <img src="/walton-county-business-leaders-logo.png" alt="" width="49" height="49">
          <div class="brand-name"><span>Walton County</span>Business Leaders</div>
        </a>
        <nav class="nav" aria-label="Main">
          <a href="/#about">About</a>
          <a href="/#issues">Issues</a>
          <a href="/#home">News</a>
          <a href="/#home">Calendar</a>
          <a class="button" href="/#join">Join the mission</a>
        </nav>
      </div>
    </header>
    <main id="content">
      <div class="container missing">
        <p class="eyebrow">Contact</p>
        <h1>${escapeHtml(heading)}</h1>
        ${extra}
        <a class="button" href="/">Back to the homepage</a>
      </div>
    </main>
    <footer class="footer">
      <div class="container">
        <p class="closing">A Stronger Voice. A Stronger Business Community. A Stronger Walton County.</p>
        <div class="footer-bottom">
          <span>Walton County Business Leaders · Walton County, Florida</span>
        </div>
      </div>
    </footer>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlResponse(html, status) {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(html, { status, headers });
}

function withSecurityHeaders(response, status) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status, headers });
}

function textResponse(message, status) {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(`${message}\n`, { status, headers });
}
