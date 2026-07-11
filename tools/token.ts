import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const command = process.argv[2];
const flags = parseFlags(process.argv.slice(3));
const config = flags.get("config") || "packages/worker/wrangler.jsonc";
const database = flags.get("database") || "agentpostoffice";

if (command === "create") await createToken();
else if (command === "list") await execute("SELECT key_id, label, scopes_json, expires_at, created_at, revoked_at FROM api_keys ORDER BY created_at DESC;");
else if (command === "revoke") await revokeToken();
else throw new Error("Usage: npm run token:<create|list|revoke> -- [options]");

async function createToken(): Promise<void> {
  const keyId = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const token = `apo_${keyId}_${secret}`;
  const digest = createHash("sha256").update(token).digest("hex");
  const label = flags.get("label") || "default";
  const scopes = (flags.get("scopes") || "messages:read,messages:update,messages:reply,messages:send,messages:delete,inboxes:manage")
    .split(",").map((scope) => scope.trim()).filter(Boolean);
  const allowed = new Set(["messages:read", "messages:update", "messages:reply", "messages:send", "messages:delete", "inboxes:manage"]);
  if (!scopes.length || scopes.some((scope) => !allowed.has(scope))) throw new Error("Invalid --scopes value");
  const expiresAt = flags.get("expires-at") || null;
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new Error("--expires-at must be an ISO timestamp");
  const now = new Date().toISOString();
  const sql = `INSERT INTO api_keys (key_id, digest_sha256, label, scopes_json, expires_at, created_at, revoked_at) VALUES (`
    + `${literal(keyId)}, ${literal(digest)}, ${literal(label)}, ${literal(JSON.stringify(scopes))}, ${literal(expiresAt)}, ${literal(now)}, NULL);`;
  await execute(sql);
  process.stdout.write(`\nRaw token (shown once):\n${token}\n\nStore it with:\nagentpostoffice config set --url <worker-url> --token '${token}'\n`);
}

async function revokeToken(): Promise<void> {
  const keyId = flags.get("key-id");
  if (!keyId || !/^[a-f0-9]{16}$/.test(keyId)) throw new Error("--key-id must be the 16-character public key ID");
  await execute(`UPDATE api_keys SET revoked_at = ${literal(new Date().toISOString())} WHERE key_id = ${literal(keyId)} AND revoked_at IS NULL;`);
}

async function execute(sql: string): Promise<void> {
  const args = ["wrangler", "d1", "execute", database, "--remote", "--config", config, "--command", sql];
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Wrangler exited with code ${code ?? "unknown"}`)));
  });
}

function literal(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}

function parseFlags(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value?.startsWith("--")) continue;
    const name = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${name}`);
    result.set(name, next);
    index += 1;
  }
  return result;
}
