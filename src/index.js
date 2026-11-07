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
const SENDER = {
  email: "business-leaders@2911studio.com",
  name: "Walton County Business Leaders",
};

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
      return handleContact(request, env);
    }

    if (request.method === "POST" && url.pathname === "/join") {
      return handleJoin(request, env);
    }

    if (request.method === "POST" && url.pathname === "/login") {
      return handleLogin(request);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse("Use the form on this site.", 405);
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

async function handleContact(request, env) {
  const form = await readForm(request);
  if (!form) {
    return htmlResponse(page("Contact us", "<p>Please use the contact form.</p>"), 400);
  }

  const name = fieldValue(form.get("name"));
  const email = fieldValue(form.get("email"));
  const message = fieldValue(form.get("message"));
  const errorText = contactError(name, email, message);

  if (errorText) {
    return htmlResponse(
      page("Contact us", `<p class="form-error">${escapeHtml(errorText)}</p>${contactFields(name, email, message)}`),
      400,
    );
  }

  const sent = await deliver(env, {
    form: "contact",
    replyTo: email,
    subject: "Business Leaders contact",
    text: ["Name: " + name, "Email: " + email, "Message:", message].join("\n"),
  });

  if (!sent) {
    return htmlResponse(
      page(
        "Contact us",
        `<p class="form-error">We could not send your message. Please try again.</p>${contactFields(name, email, message)}`,
      ),
      500,
    );
  }

  return htmlResponse(
    page("Thank you for getting in touch.", "<p>We received your message.</p>"),
    200,
  );
}

async function handleJoin(request, env) {
  const form = await readForm(request);
  if (!form) {
    return htmlResponse(page("Join Walton County Business Leaders", "<p>Please use the application form.</p>"), 400);
  }

  const application = {
    full_name: fieldValue(form.get("full_name")),
    email: fieldValue(form.get("email")),
    phone: fieldValue(form.get("phone")),
    company: fieldValue(form.get("company")),
    role: fieldValue(form.get("role")),
    industry: fieldValue(form.get("industry")),
    time_in_county: fieldValue(form.get("time_in_county")),
    website: fieldValue(form.get("website")),
    note: fieldValue(form.get("note")),
  };
  const errorText = joinError(application);

  if (errorText) {
    return htmlResponse(
      page(
        "Join Walton County Business Leaders",
        `<p class="form-error">${escapeHtml(errorText)}</p>${joinFields(application)}`,
        "apply",
      ),
      400,
    );
  }

  const sent = await deliver(env, {
    form: "join",
    replyTo: application.email,
    subject: "Business Leaders membership application",
    text: [
      "Full name: " + application.full_name,
      "Email: " + application.email,
      "Phone: " + application.phone,
      "Business or company: " + application.company,
      "Role: " + application.role,
      "Industry or type of work: " + application.industry,
      "How long in Walton County: " + application.time_in_county,
      "Business website: " + (application.website || "Not provided"),
      "Note: " + (application.note || "Not provided"),
    ].join("\n"),
  });

  if (!sent) {
    return htmlResponse(
      page(
        "Join Walton County Business Leaders",
        `<p class="form-error">We could not send your application. Please try again.</p>${joinFields(application)}`,
        "apply",
      ),
      500,
    );
  }

  return htmlResponse(
    page(
      "Thank you for your application.",
      "<p>Membership is free. Applications require administrator approval.</p>",
    ),
    200,
  );
}

async function handleLogin(request) {
  const form = await readForm(request);
  if (!form) {
    return htmlResponse(page("Sign in", loginFields(""), "sign-in"), 400);
  }

  const email = fieldValue(form.get("email"));
  const password = fieldValue(form.get("password"));
  if (!email || !password) {
    return htmlResponse(
      page(
        "Sign in",
        `<p class="form-error">Please enter your email and password.</p>${loginFields(email)}`,
        "sign-in",
      ),
      400,
    );
  }

  console.log(JSON.stringify({ message: "login submitted" }));
  return htmlResponse(
    page(
      "Sign in",
      `<p class="sign-in-result">No approved member account matches that email yet.</p>
      <p class="sign-in-join"><a href="/join">Request membership</a></p>`,
      "sign-in",
    ),
    200,
  );
}

function loginFields(email) {
  return `<p class="apply-lead">Members can sign in after their application is approved.</p>
    <form class="contact-form" action="/login" method="post">
      <div class="field">
        <label for="login-email">Email</label>
        <input id="login-email" name="email" type="email" required autocomplete="username" maxlength="200" value="${escapeHtml(email)}">
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" required autocomplete="current-password" maxlength="200">
      </div>
      <button class="button" type="submit">Sign in</button>
    </form>
    <p class="sign-in-join"><a href="/join">Request membership</a></p>`;
}

async function readForm(request) {
  try {
    return await request.formData();
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "form could not be read",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

function fieldValue(value) {
  return typeof value === "string" ? value.replaceAll("\r", "").trim() : "";
}

function contactError(name, email, message) {
  if (!name || !email || !message) {
    return "Please complete your name, email, and message.";
  }
  if (name.length > 120 || email.length > 200 || message.length > 5000) {
    return "Please shorten your name, email, or message and try again.";
  }
  if (!EMAIL_PATTERN.test(email) || /[\n]/.test(email)) {
    return "Please enter a valid email address.";
  }
  return "";
}

function joinError(application) {
  const required = [
    application.full_name,
    application.email,
    application.phone,
    application.company,
    application.role,
    application.industry,
    application.time_in_county,
  ];
  if (required.some((value) => !value)) {
    return "Please complete every required field.";
  }
  if (
    application.full_name.length > 120 ||
    application.email.length > 200 ||
    application.phone.length > 40 ||
    application.company.length > 200 ||
    application.role.length > 200 ||
    application.industry.length > 200 ||
    application.time_in_county.length > 200 ||
    application.website.length > 200 ||
    application.note.length > 2000
  ) {
    return "Please shorten one of your answers and try again.";
  }
  if (!EMAIL_PATTERN.test(application.email) || /[\n]/.test(application.email)) {
    return "Please enter a valid email address.";
  }
  const digits = application.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return "Please enter a phone number.";
  }
  return "";
}

async function deliver(env, { form, replyTo, subject, text }) {
  try {
    await env.EMAIL.send({
      to: "marc@whpinc.com",
      from: SENDER,
      replyTo,
      subject,
      text,
    });
    console.log(JSON.stringify({ message: "email sent", form }));
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "email send failed",
        form,
        error: error instanceof Error ? error.message : String(error),
        code: error && error.code ? error.code : undefined,
      }),
    );
    return false;
  }
}

function contactFields(name, email, message, prefix = "contact") {
  return `<form class="contact-form" action="/contact" method="post">
    <div class="field">
      <label for="${prefix}-name">Name</label>
      <input id="${prefix}-name" name="name" type="text" required autocomplete="name" maxlength="120" value="${escapeHtml(name)}">
    </div>
    <div class="field">
      <label for="${prefix}-email">Email</label>
      <input id="${prefix}-email" name="email" type="email" required autocomplete="email" maxlength="200" value="${escapeHtml(email)}">
    </div>
    <div class="field">
      <label for="${prefix}-message">Message</label>
      <textarea id="${prefix}-message" name="message" required rows="6" maxlength="5000">${escapeHtml(message)}</textarea>
    </div>
    <button class="button" type="submit">Send message</button>
  </form>`;
}

function joinFields(application) {
  return `<p class="apply-lead">Membership is free. Applications require administrator approval.</p>
    <p class="apply-note">Membership is limited to individuals who own, operate, or hold executive leadership positions in businesses operating in or serving Walton County, Florida.</p>
    <form class="contact-form" action="/join" method="post">
      <div class="field">
        <label for="full-name">Full name</label>
        <input id="full-name" name="full_name" type="text" required autocomplete="name" maxlength="120" value="${escapeHtml(application.full_name)}">
      </div>
      <div class="field">
        <label for="join-email">Email</label>
        <input id="join-email" name="email" type="email" required autocomplete="email" maxlength="200" value="${escapeHtml(application.email)}">
      </div>
      <div class="field">
        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" required autocomplete="tel" maxlength="40" value="${escapeHtml(application.phone)}">
      </div>
      <div class="field">
        <label for="company">Business or company</label>
        <input id="company" name="company" type="text" required autocomplete="organization" maxlength="200" value="${escapeHtml(application.company)}">
      </div>
      <div class="field">
        <label for="role">Your role at that company</label>
        <input id="role" name="role" type="text" required autocomplete="organization-title" maxlength="200" value="${escapeHtml(application.role)}">
      </div>
      <div class="field">
        <label for="industry">Industry or type of work</label>
        <input id="industry" name="industry" type="text" required maxlength="200" value="${escapeHtml(application.industry)}">
      </div>
      <div class="field">
        <label for="time-in-county">How long have you been in Walton County</label>
        <input id="time-in-county" name="time_in_county" type="text" required maxlength="200" value="${escapeHtml(application.time_in_county)}">
      </div>
      <div class="field">
        <label for="website">Business website <span class="optional">(optional)</span></label>
        <input id="website" name="website" type="text" inputmode="url" autocomplete="url" maxlength="200" value="${escapeHtml(application.website)}">
      </div>
      <div class="field">
        <label for="note">A short note <span class="optional">(optional)</span></label>
        <textarea id="note" name="note" rows="5" maxlength="2000">${escapeHtml(application.note)}</textarea>
        <span class="field-hint">Who you are, or why you want to join.</span>
      </div>
      <button class="button" type="submit">Submit application</button>
    </form>`;
}

function page(heading, body, mainClass = "missing") {
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
          <span class="nav-actions">
            <a class="nav-login" href="/login">Login</a>
            <a class="button" href="/join">Join the mission</a>
          </span>
        </nav>
      </div>
    </header>
    <main id="content">
      <div class="container ${mainClass}">
        <p class="eyebrow">${mainClass === "sign-in" ? "Members" : mainClass === "apply" || heading.includes("application") ? "Membership" : "Contact"}</p>
        <h1>${escapeHtml(heading)}</h1>
        ${body}
        <a class="button" href="/">Back to the homepage</a>
      </div>
    </main>
    <footer class="footer">
      <div class="container">
        <div class="footer-top">
          <p class="closing">A Stronger Voice. A Stronger Business Community. A Stronger Walton County.</p>
          <button class="button" type="button" popovertarget="contact-dialog">Contact</button>
        </div>
        <div class="footer-bottom">
          <span>Walton County Business Leaders · Walton County, Florida</span>
        </div>
      </div>
    </footer>
    <div id="contact-dialog" class="contact-popover" popover aria-labelledby="contact-heading">
      <div class="popover-toolbar">
        <h2 id="contact-heading">Contact us</h2>
        <button class="contact-close" type="button" popovertarget="contact-dialog" popovertargetaction="hide">Close</button>
      </div>
      <p>Have a question or want to learn more? Send us a message.</p>
      ${contactFields("", "", "", "overlay")}
    </div>
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
