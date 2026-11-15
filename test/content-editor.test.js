import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";
import { stripImageMetadata } from "../src/images.js";
import { openHubDb } from "./d1.js";

if (typeof crypto.subtle.timingSafeEqual !== "function") {
  Object.defineProperty(crypto.subtle, "timingSafeEqual", {
    value: (left, right) => timingSafeEqual(Buffer.from(left), Buffer.from(right)),
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:email") {
      return {
        url: new URL("./cloudflare-email-mock.js", import.meta.url).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { handleHub } = await import("../src/hub.js");

const NOW = "2026-11-15T18:00:00.000Z";
const ADMIN_TOKEN = "admin-session-token-admin-session-token-123456";
const ADMIN_CSRF = "admin-csrf-token";

function jpegWithExif() {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x08, 0x45, 0x58, 0x49, 0x46, 0x00, 0x00,
    0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
    0xff, 0xda, 0x00, 0x02,
    0x00, 0xff, 0xd9,
  ]);
}

function ui() {
  return {
    html: (body) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } }),
    text: (status, body) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } }),
  };
}

function memoryMedia() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, options) {
      objects.set(key, { bytes: new Uint8Array(bytes), type: options?.httpMetadata?.contentType || "" });
    },
    async get(key) {
      const item = objects.get(key);
      return item ? { body: item.bytes } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function envFor(db, media) {
  return { DB: db, ADMIN_EMAILS: "marc@whpinc.com", HUB_MEDIA: media };
}

function call(env, path, { method = "GET", token = "", form } = {}) {
  const headers = {};
  if (token) headers.cookie = `wl_session=${token}`;
  const init = { method, headers };
  if (form instanceof FormData) init.body = form;
  else if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = form.toString();
  }
  return handleHub(new Request(`https://waltonleaders.org${path}`, init), env, ui());
}

function contentForm(fields, file) {
  const form = new FormData();
  form.set("csrf", ADMIN_CSRF);
  form.set("network", fields.network || "business");
  form.set("type", fields.type || "post");
  form.set("title", fields.title || "");
  form.set("slug", fields.slug || "");
  form.set("description", fields.description || "");
  form.set("link_url", fields.link_url || "");
  form.set("body", fields.body || "");
  form.set("image_alt", fields.image_alt ?? "");
  if (file) form.set("image", file);
  return form;
}

async function seedAdmin(db) {
  await db.prepare(`INSERT INTO sessions (id, token_hash, email, csrf_token, expires_at, created_at)
    VALUES ('sess-admin', ?, 'marc@whpinc.com', ?, '2099-01-01T00:00:00.000Z', ?)`).bind(await sha256(ADMIN_TOKEN), ADMIN_CSRF, NOW).run();
}

function contentId(response) {
  return new URL(response.headers.get("location")).pathname.split("/").pop();
}

test("a new post can be created with a featured image in one submit", async () => {
  const db = openHubDb();
  const media = memoryMedia();
  await seedAdmin(db);
  const env = envFor(db, media);
  try {
    const fresh = await call(env, "/admin/content/new", { token: ADMIN_TOKEN });
    const freshHtml = await fresh.text();
    assert.match(freshHtml, /enctype="multipart\/form-data"/);
    assert.match(freshHtml, /accept="image\/jpeg,image\/png,image\/webp"/);
    assert.match(freshHtml, /Featured image/);
    assert.match(freshHtml, />Save draft</);
    assert.equal(freshHtml.includes("Save the draft first"), false);
    assert.equal(/action="[^"]+\/image"/.test(freshHtml), false);

    const bad = new FormData();
    bad.set("csrf", "nope");
    bad.set("network", "business");
    bad.set("type", "post");
    bad.set("title", "Nope");
    const forbidden = await call(env, "/admin/content", { method: "POST", token: ADMIN_TOKEN, form: bad });
    assert.equal(forbidden.status, 403);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM content_items").bind().first()).n, 0);

    const jpeg = jpegWithExif();
    const saved = await call(env, "/admin/content", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: contentForm({
        title: "Harbor note",
        slug: "harbor-note",
        body: "The water was calm.",
        image_alt: "Harbor at dusk",
      }, new File([jpeg], "harbor.jpg", { type: "image/jpeg" })),
    });
    assert.equal(saved.status, 303);
    assert.match(saved.headers.get("location"), /notice=saved$/);
    const id = contentId(saved);
    const row = await db.prepare("SELECT title, body, status, image_key, image_alt, image_type, image_bytes FROM content_items WHERE id = ?").bind(id).first();
    assert.equal(row.title, "Harbor note");
    assert.equal(row.body, "The water was calm.");
    assert.equal(row.status, "draft");
    assert.equal(row.image_alt, "Harbor at dusk");
    assert.equal(row.image_type, "image/jpeg");
    assert.match(row.image_key, /^img\//);
    const stored = media.objects.get(row.image_key);
    assert.equal(stored.type, "image/jpeg");
    assert.equal(Buffer.from(stored.bytes).includes(Buffer.from("EXIF")), false);
    assert.equal(row.image_bytes, stored.bytes.byteLength);
    const stripped = stripImageMetadata(jpeg);
    assert.equal(Buffer.compare(Buffer.from(stored.bytes), Buffer.from(stripped.bytes)), 0);

    const editor = await call(env, `/admin/content/${id}`, { token: ADMIN_TOKEN });
    const editorHtml = await editor.text();
    assert.match(editorHtml, /enctype="multipart\/form-data"/);
    assert.match(editorHtml, /Replace image/);
    assert.match(editorHtml, new RegExp(`src="/hub/media/${id}"`));
    assert.match(editorHtml, /Remove image/);
    assert.equal(/action="\/admin\/content\/[^"]+\/image"/.test(editorHtml), false);
    assert.equal(editorHtml.includes("Save the draft first"), false);
  } finally {
    db.close();
  }
});

test("editing a post without a file keeps the featured image", async () => {
  const db = openHubDb();
  const media = memoryMedia();
  await seedAdmin(db);
  const env = envFor(db, media);
  try {
    const jpeg = jpegWithExif();
    const saved = await call(env, "/admin/content", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: contentForm({
        title: "Harbor note",
        slug: "harbor-note",
        body: "The water was calm.",
        image_alt: "Harbor at dusk",
      }, new File([jpeg], "harbor.jpg", { type: "image/jpeg" })),
    });
    const id = contentId(saved);
    const before = await db.prepare("SELECT image_key, image_type, image_bytes, image_alt FROM content_items WHERE id = ?").bind(id).first();
    const beforeBytes = Buffer.from(media.objects.get(before.image_key).bytes);

    const edited = await call(env, `/admin/content/${id}`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: contentForm({
        title: "Harbor note revised",
        slug: "harbor-note",
        body: "The water was calm still.",
        image_alt: "Harbor at dusk",
      }),
    });
    assert.equal(edited.status, 303);
    const after = await db.prepare("SELECT title, body, image_key, image_type, image_bytes, image_alt FROM content_items WHERE id = ?").bind(id).first();
    assert.equal(after.title, "Harbor note revised");
    assert.equal(after.body, "The water was calm still.");
    assert.equal(after.image_key, before.image_key);
    assert.equal(after.image_type, before.image_type);
    assert.equal(after.image_bytes, before.image_bytes);
    assert.equal(after.image_alt, "Harbor at dusk");
    assert.equal(media.objects.size, 1);
    assert.equal(Buffer.compare(Buffer.from(media.objects.get(after.image_key).bytes), beforeBytes), 0);

    const empty = contentForm({
      title: "Harbor note revised again",
      slug: "harbor-note",
      body: "Still calm.",
      image_alt: "Harbor at dusk",
    });
    empty.set("image", new File([], "", { type: "application/octet-stream" }));
    const kept = await call(env, `/admin/content/${id}`, { method: "POST", token: ADMIN_TOKEN, form: empty });
    assert.equal(kept.status, 303);
    const still = await db.prepare("SELECT title, image_key FROM content_items WHERE id = ?").bind(id).first();
    assert.equal(still.title, "Harbor note revised again");
    assert.equal(still.image_key, before.image_key);
    assert.equal(media.objects.size, 1);

    const replaced = await call(env, `/admin/content/${id}`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: contentForm({
        title: "Harbor note revised again",
        slug: "harbor-note",
        body: "Still calm.",
        image_alt: "A new harbor photo",
      }, new File([jpegWithExif()], "harbor-2.jpg", { type: "image/jpeg" })),
    });
    assert.equal(replaced.status, 303);
    const next = await db.prepare("SELECT image_key, image_alt, image_type FROM content_items WHERE id = ?").bind(id).first();
    assert.notEqual(next.image_key, before.image_key);
    assert.equal(next.image_alt, "A new harbor photo");
    assert.equal(next.image_type, "image/jpeg");
    assert.equal(media.objects.has(before.image_key), false);
    assert.equal(media.objects.has(next.image_key), true);
    assert.equal(media.objects.size, 1);
  } finally {
    db.close();
  }
});

test("an invalid image shows the error and keeps the typed text", async () => {
  const db = openHubDb();
  const media = memoryMedia();
  await seedAdmin(db);
  const env = envFor(db, media);
  try {
    const created = await call(env, "/admin/content", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: contentForm({ title: "Saved harbor", slug: "saved-harbor", body: "Original body", image_alt: "" }),
    });
    assert.equal(created.status, 303);
    const id = contentId(created);

    const rejected = await call(env, `/admin/content/${id}`, {
      method: "POST",
      token: ADMIN_TOKEN,
      form: contentForm({
        title: "Unsaved harbor title",
        slug: "saved-harbor",
        body: "Unsaved body text stays.",
        description: "Typed description stays.",
        image_alt: "A bad file",
      }, new File([Buffer.from("not-an-image")], "notes.txt", { type: "text/plain" })),
    });
    assert.equal(rejected.status, 400);
    const html = await rejected.text();
    assert.match(html, /Use a JPEG, PNG, or WebP image up to 5 MB\./);
    assert.match(html, /value="Unsaved harbor title"/);
    assert.match(html, /Unsaved body text stays\./);
    assert.match(html, /Typed description stays\./);
    assert.match(html, /value="A bad file"/);
    const row = await db.prepare("SELECT title, body, description, image_key FROM content_items WHERE id = ?").bind(id).first();
    assert.equal(row.title, "Saved harbor");
    assert.equal(row.body, "Original body");
    assert.equal(row.description, "");
    assert.equal(row.image_key, null);
    assert.equal(media.objects.size, 0);

    const fresh = await call(env, "/admin/content", {
      method: "POST",
      token: ADMIN_TOKEN,
      form: contentForm({
        title: "Typed title stays",
        body: "Typed body stays.",
        image_alt: "Alt stays",
      }, new File([Buffer.from("GIF89a")], "anim.gif", { type: "image/gif" })),
    });
    assert.equal(fresh.status, 400);
    const freshHtml = await fresh.text();
    assert.match(freshHtml, /Use a JPEG, PNG, or WebP image up to 5 MB\./);
    assert.match(freshHtml, /value="Typed title stays"/);
    assert.match(freshHtml, /Typed body stays\./);
    assert.match(freshHtml, /value="Alt stays"/);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM content_items WHERE title = 'Typed title stays'").bind().first()).n, 0);
  } finally {
    db.close();
  }
});
