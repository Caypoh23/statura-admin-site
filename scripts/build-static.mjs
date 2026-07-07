import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareConfig } from "./prepare-config.mjs";

const env = process.argv[2];
if (!["dev", "prod"].includes(env)) {
  console.error("Usage: node scripts/build-static.mjs <dev|prod>");
  process.exit(1);
}

prepareConfig(env);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const entry of ["index.html", "config.js", "src", "assets", "docs", "package.json", "README.md"]) {
  cpSync(resolve(root, entry), resolve(dist, entry), { recursive: true });
}

console.log(`Built dist/ for ${env}`);
