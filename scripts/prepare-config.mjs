import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");

export function prepareConfig(env) {
  if (!["dev", "prod"].includes(env)) {
    throw new Error("Usage: node scripts/prepare-config.mjs <dev|prod>");
  }

  const target = resolve(root, "config.js");
  const configPath = resolve(root, `config.${env}.js`);
  const examplePath = resolve(root, `config.${env}.example.js`);
  const fileVar = process.env[`STATURA_ADMIN_CONFIG_${env.toUpperCase()}_FILE`];

  if (fileVar && existsSync(fileVar)) {
    copyFileSync(fileVar, target);
    console.log(`Generated config.js from $STATURA_ADMIN_CONFIG_${env.toUpperCase()}_FILE`);
    return;
  }

  if (existsSync(configPath)) {
    copyFileSync(configPath, target);
    console.log(`Generated config.js from config.${env}.js`);
    return;
  }

  if (existsSync(examplePath)) {
    copyFileSync(examplePath, target);
    console.warn(`Generated config.js from config.${env}.example.js; fill real Supabase values before deploy.`);
    return;
  }

  throw new Error(`Missing config.${env}.js and config.${env}.example.js`);
}

if (process.argv[1] === scriptPath) {
  try {
    prepareConfig(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
