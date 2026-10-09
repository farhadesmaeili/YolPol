import {randomBytes} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve, join} from "node:path";
import {fileURLToPath} from "node:url";

export function createLocalAcquisitionSecrets(directory) {
  // mkdir is intentionally non-recursive and exclusive: never rotate or overwrite an existing set.
  mkdirSync(directory, {mode: 0o700});
  const names = ["acquisition-admin-password", "acquisition-migrator-password", "acquisition-runtime-password", "acquisition-api-token", "n8n-admin-password", "n8n-database-password", "n8n-encryption-key"];
  const values = Object.fromEntries(names.map((name) => [name, randomBytes(32).toString("hex")]));
  for (const [name, value] of Object.entries(values)) writeFileSync(join(directory, name), `${value}\n`, {flag: "wx", mode: 0o600});
  writeFileSync(join(directory, "n8n-credential-overwrites.json"), JSON.stringify({httpHeaderAuth: {name: "Authorization", value: `Bearer ${values["acquisition-api-token"]}`}}), {flag: "wx", mode: 0o600});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    createLocalAcquisitionSecrets(resolve("deploy/customer-acquisition/secrets"));
    console.info("Independent local synthetic credentials created. Apply host ACL/ownership before mounting; values were not printed.");
  } catch { console.error("Local credential initialization refused or failed; existing files were not overwritten."); process.exitCode = 1; }
}
