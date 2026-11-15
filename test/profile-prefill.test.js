import assert from "node:assert/strict";
import test from "node:test";
import { fillProfileFromApplications, profileAnswersFromApplication } from "../src/profile-prefill.js";
import { openHubDb } from "./d1.js";

const NOW = "2026-11-15T18:00:00.000Z";

async function member(db, id, email) {
  await db.prepare(
    "INSERT INTO members (id, email, name, created_at, updated_at) VALUES (?, ?, 'Stored Name', ?, ?)",
  ).bind(id, email, NOW, NOW).run();
}

function application(fields, name = "Ada Example", submitted = "2026-11-01T00:00:00.000Z") {
  return { name, fields_json: JSON.stringify(fields), submitted_at: submitted, status: "approved" };
}

test("application answers map onto blank profile columns and stay verbatim", () => {
  const answers = profileAnswersFromApplication(application({
    name: "Ada Example",
    email: "ada@example.com",
    phone: "850-555-0100 ext 2",
    company: "Blue Harbor",
    business: "Other Name",
    role: "Owner",
    industry: "Retail",
    years_in_walton: "4 years",
    website: "Example.com/Path",
    about: "Line one.\nLine two.",
    company_fax: "spam",
    trade: "Carpentry",
    seasons: "Year round",
  }));
  assert.deepEqual(answers, {
    name: "Ada Example",
    company: "Blue Harbor",
    role_title: "Owner",
    phone: "850-555-0100 ext 2",
    website: "Example.com/Path",
    bio: "Line one.\nLine two.",
  });
  assert.equal(JSON.stringify(answers).includes("spam"), false);
  assert.equal(JSON.stringify(answers).includes("Retail"), false);
  assert.equal(JSON.stringify(answers).includes("Carpentry"), false);
});

test("business fills company when the application has no company field", () => {
  const answers = profileAnswersFromApplication(application({ business: "Example Inn", phone: "555-0100" }, ""));
  assert.equal(answers.company, "Example Inn");
  assert.equal(answers.phone, "555-0100");
  assert.equal(answers.name, undefined);
});

test("a value that does not fit the profile column is skipped", () => {
  const answers = profileAnswersFromApplication(application({
    phone: "1".repeat(41),
    company: "Fits",
    about: "x".repeat(2001),
  }));
  assert.equal(answers.phone, undefined);
  assert.equal(answers.bio, undefined);
  assert.equal(answers.company, "Fits");
});

test("approval fill and profile backfill write only empty columns", async () => {
  const db = openHubDb();
  const id = "55555555-5555-4555-8555-555555555555";
  await member(db, id, "ada@example.com");
  await db.prepare(
    `INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at)
     VALUES (?, 'Ada Example', 'Kept Co', '', '', '', '', '', ?)`,
  ).bind(id, NOW).run();

  const first = await fillProfileFromApplications(db, id, {
    name: "Ada Example",
    company: "Kept Co",
    role_title: "",
    phone: "",
    location: "",
    website: "",
    bio: "",
  }, [
    application({ company: "New Co", role: "Owner", phone: "850-555-0199" }, "Ada Example", "2026-11-01T00:00:00.000Z"),
    application({ company: "Later Co", website: "https://later.example/a", about: "From the second form." }, "Ada Example", "2026-11-02T00:00:00.000Z"),
  ], NOW);

  assert.equal(first.changed, true);
  assert.equal(first.profile.company, "Kept Co");
  assert.equal(first.profile.role_title, "Owner");
  assert.equal(first.profile.phone, "850-555-0199");
  assert.equal(first.profile.website, "https://later.example/a");
  assert.equal(first.profile.bio, "From the second form.");

  const again = await fillProfileFromApplications(db, id, first.profile, [
    application({ company: "Third Co", phone: "999" }),
  ], "2026-11-16T00:00:00.000Z");
  assert.equal(again.changed, false);
  const row = await db.prepare("SELECT company, phone, updated_at FROM member_profiles WHERE member_id = ?").bind(id).first();
  assert.equal(row.company, "Kept Co");
  assert.equal(row.phone, "850-555-0199");
  assert.equal(row.updated_at, NOW);
  db.close();
});

test("a stale read still does not overwrite a stored profile value", async () => {
  const db = openHubDb();
  const id = "66666666-6666-4666-8666-666666666666";
  await member(db, id, "bea@example.com");
  await db.prepare(
    `INSERT INTO member_profiles (member_id, name, company, role_title, phone, location, website, bio, updated_at)
     VALUES (?, '', 'Kept Co', '', '', '', '', '', ?)`,
  ).bind(id, NOW).run();
  const filled = await fillProfileFromApplications(db, id, null, [
    application({ company: "New Co", phone: "(850) 555-0100" }),
  ], NOW);
  assert.equal(filled.profile.company, "Kept Co");
  assert.equal(filled.profile.phone, "(850) 555-0100");
  db.close();
});
