import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function javascriptFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) found.push(...javascriptFiles(path));
    else if (name.endsWith(".js") || name.endsWith(".mjs")) found.push(path);
  }
  return found;
}

const roots = ["src", "test", "scripts"].filter((dir) => {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
});
const files = roots.flatMap((dir) => javascriptFiles(dir));
const failed = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed.push(file);
}
if (failed.length) {
  console.error(`Syntax check failed: ${failed.join(", ")}`);
  process.exit(1);
}
