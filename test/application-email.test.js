import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applicationThankYouCopy,
  buildApplicationThankYou,
  scheduleApplicationThankYou,
} from "../src/application-email.js";

const REACH = "We're a brand new organization, and we're working hard to reach our first 500 members.";
const APPROVED_REACH = `${REACH} Thanks for being one of them!`;

function textFor(networkName, greeting) {
  return [
    greeting,
    "",
    `Thank you for applying to join ${networkName}. ${REACH}`,
    "",
    "We'll review your application and get back to you shortly.",
    "",
    networkName,
  ].join("\n");
}

test("thank-you copy uses the first name, network sender, and shared sentence", () => {
  const networks = [
    ["business", "Walton County Business Leaders", "hello@waltonleaders.org"],
    ["builders", "Walton County Builders Network", "hello@waltonbuildersnetwork.org"],
    ["tourism", "Walton County Tourism Network", "hello@waltontourism.org"],
  ];
  for (const [network, networkName, email] of networks) {
    const message = buildApplicationThankYou({ network, name: "Ada Example", email: "Ada@Example.com" });
    assert.equal(message.to, "Ada@Example.com");
    assert.deepEqual(message.from, { email, name: networkName });
    assert.equal(message.replyTo, email);
    assert.equal(message.subject, `Thanks for applying to ${networkName}`);
    assert.equal(message.text, textFor(networkName, "Hi Ada,"));
    assert.equal(message.text.includes("excited to welcome"), false);
    assert.equal(message.text.includes("Thanks for being one of them!"), false);
    assert.equal(/[—–]/.test(message.text), false);
    assert.equal(/[—–]/.test(message.html), false);
    assert.match(message.html, /#001840/);
    assert.match(message.html, /#d0a040/);
    assert.match(message.html, new RegExp(message.subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(applicationThankYouCopy("business", "   ").greeting, "Hi there,");
  assert.equal(buildApplicationThankYou({ network: "business", name: "", email: "ada@example.com" }).text, textFor("Walton County Business Leaders", "Hi there,"));
  assert.equal(applicationThankYouCopy("tourism", "Jean-Luc Picard").greeting, "Hi Jean-Luc,");
});

test("thank-you html escapes the name and the copy", () => {
  const message = buildApplicationThankYou({
    network: "builders",
    name: "<b>Ada</b> Lovelace",
    email: "ada@example.com",
  });
  assert.match(message.text, /Hi <b>Ada<\/b>,/);
  assert.match(message.html, /Hi &lt;b&gt;Ada&lt;\/b&gt;,/);
  assert.equal(message.html.includes("<b>Ada</b>"), false);
  assert.match(message.html, /We&#39;re a brand new organization/);
  assert.match(message.text, /We're a brand new organization/);
  const ampersand = buildApplicationThankYou({
    network: "builders",
    name: "A&B Rest",
    email: "ada@example.com",
  });
  assert.match(ampersand.text, /Hi A&B,/);
  assert.match(ampersand.html, /Hi A&amp;B,/);
});

test("invalid email or unknown network is not sent", () => {
  assert.equal(buildApplicationThankYou({ network: "business", name: "Ada", email: "not-an-email" }), null);
  assert.equal(buildApplicationThankYou({ network: "business", name: "Ada", email: "ada@example.com\nBcc:evil@example.com" }), null);
  assert.equal(buildApplicationThankYou({ network: "other", name: "Ada", email: "ada@example.com" }), null);
  let calls = 0;
  let waited = false;
  const ctx = { waitUntil() { waited = true; } };
  const env = { EMAIL: { async send() { calls += 1; } } };
  scheduleApplicationThankYou(ctx, env, { network: "business", name: "Ada", email: "not-an-email" });
  assert.equal(calls, 0);
  assert.equal(waited, false);
});

test("thank-you send is scheduled and does not block the caller", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let finished = false;
  let waited;
  let payload;
  const ctx = { waitUntil(promise) { waited = promise; } };
  const env = {
    EMAIL: {
      async send(message) {
        payload = message;
        await gate;
        finished = true;
      },
    },
  };
  scheduleApplicationThankYou(ctx, env, { network: "tourism", name: "Ada Example", email: "ada@example.com" });
  assert.equal(finished, false);
  release();
  await waited;
  assert.equal(finished, true);
  assert.equal(payload.from.email, "hello@waltontourism.org");
  assert.equal(payload.replyTo, "hello@waltontourism.org");
  assert.equal(payload.subject, "Thanks for applying to Walton County Tourism Network");
});

test("a thank-you send failure is logged and does not reject", async () => {
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(String(line));
  try {
    let waited;
    const ctx = { waitUntil(promise) { waited = promise; } };
    const env = { EMAIL: { async send() { throw new Error("mailbox unavailable"); } } };
    scheduleApplicationThankYou(ctx, env, { network: "builders", name: "Ada", email: "ada@example.com" });
    await waited;
    const logged = errors.join("\n");
    assert.match(logged, /application thank-you email failed/);
    assert.match(logged, /mailbox unavailable/);
  } finally {
    console.error = original;
  }
});

test("a missing email binding is logged and does not reject", async () => {
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(String(line));
  try {
    let waited;
    const ctx = { waitUntil(promise) { waited = promise; } };
    scheduleApplicationThankYou(ctx, {}, { network: "business", name: "Ada", email: "ada@example.com" });
    await waited;
    assert.match(errors.join("\n"), /email binding missing/);
  } finally {
    console.error = original;
  }
});

test("scheduling never throws when waitUntil is missing or throws", () => {
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(String(line));
  try {
    const env = { EMAIL: { async send() {} } };
    assert.doesNotThrow(() => scheduleApplicationThankYou(undefined, env, {
      network: "business",
      name: "Ada",
      email: "ada@example.com",
    }));
    assert.doesNotThrow(() => scheduleApplicationThankYou({
      waitUntil() { throw new Error("illegal invocation"); },
    }, env, {
      network: "business",
      name: "Ada",
      email: "ada@example.com",
    }));
    const logged = errors.join("\n");
    assert.match(logged, /was not scheduled/);
    assert.match(logged, /illegal invocation/);
  } finally {
    console.error = original;
  }
});

test("thank-you is scheduled only after a new application is stored", () => {
  const hub = readFileSync(new URL("../src/hub.js", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const between = (source, start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from !== -1 && to !== -1, start);
    return source.slice(from, to);
  };
  const record = between(hub, "export async function recordBusinessApplication", "export async function handleHub");
  const ingest = between(hub, "async function ingest", "async function requestLink");
  assert.ok(record.indexOf("INSERT INTO applications") < record.indexOf("scheduleApplicationThankYou"));
  assert.ok(ingest.indexOf("INSERT INTO applications") < ingest.indexOf("scheduleApplicationThankYou"));
  assert.equal(between(hub, "async function sendMagicLink", "async function addToMailerLite").includes("scheduleApplicationThankYou"), false);
  assert.equal(between(index, "async function sendMail", "const CANONICAL_ORIGIN").includes("scheduleApplicationThankYou"), false);
  assert.equal(between(index, "async function sendMail", "const CANONICAL_ORIGIN").includes("hello@walton"), false);
  assert.equal(index.includes("scheduleApplicationThankYou"), false);
  assert.match(index, /async fetch\(request, env, ctx\)/);
  assert.match(index, /handleHub\(request, env, \{ html, text \}, ctx\)/);
  assert.match(index, /recordBusinessApplication\(env, \{[\s\S]*?\}, ctx\)/);
  assert.match(index, /"Business Leaders membership application"/);
});

test("wrangler allows the three network hello addresses", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(toml, /allowed_sender_addresses/);
  assert.equal(toml.includes("destination_address"), false);
  for (const address of [
    "hello@waltonleaders.org",
    "hello@waltonbuildersnetwork.org",
    "hello@waltontourism.org",
  ]) {
    assert.ok(toml.includes(address), address);
  }
});

test("approval welcome copy matches the live MailerLite messages", () => {
  const docs = readFileSync(new URL("../docs/welcome-emails.md", import.meta.url), "utf8");
  assert.equal(docs.includes("Membership is free."), false);
  assert.equal(/[—–]/.test(docs), false);
  const application = docs.slice(docs.indexOf("## Application thank-you"), docs.indexOf("## MailerLite approval messages"));
  assert.match(application, new RegExp(REACH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(application.includes("Thanks for being one of them!"), false);
  const networks = [
    ["Business Leaders approved", "Walton County Business Leaders"],
    ["Builders approved", "Walton County Builders Network"],
    ["Tourism approved", "Walton County Tourism Network"],
  ];
  for (const [heading, networkName] of networks) {
    const start = docs.indexOf(`## ${heading}`);
    const next = docs.indexOf("\n## ", start + 1);
    const section = docs.slice(start, next === -1 ? docs.length : next);
    const approved = `Your request to join ${networkName} is approved.`;
    assert.ok(section.includes(approved), heading);
    assert.equal(section.slice(section.indexOf(approved) + approved.length, section.indexOf(APPROVED_REACH)), "\n\n");
    assert.ok(section.indexOf(APPROVED_REACH) < section.indexOf("Sign in from any browser:"));
    assert.match(section, /The link works once and expires after about 15 minutes\./);
  }
});
