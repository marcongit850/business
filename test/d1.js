import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function openHubDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const file of ["0001_hub.sql", "0002_application_notes.sql", "0003_flagged_issues.sql", "0004_content_share_all.sql"]) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return {
    prepare(sql) {
      return {
        bind(...params) {
          const stmt = db.prepare(sql);
          return {
            async first() {
              return stmt.get(...params) ?? null;
            },
            async all() {
              return { results: stmt.all(...params) };
            },
            async run() {
              const info = stmt.run(...params);
              return { meta: { changes: info.changes } };
            },
          };
        },
      };
    },
    close() {
      db.close();
    },
  };
}
