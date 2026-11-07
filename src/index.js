const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
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

    if (request.method !== "GET" && request.method !== "HEAD") {
      return textResponse("This preview only serves the homepage.", 405);
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
