import { HttpError } from "./http.js";
import type { AuthContext, Env, Scope } from "./types.js";
import { ALL_SCOPES } from "./types.js";
import { constantTimeEqual, sha256Hex } from "./util.js";

interface ApiKeyRow {
  key_id: string;
  digest_sha256: string;
  scopes_json: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  const header = request.headers.get("authorization");
  const match = /^Bearer (apo_([a-zA-Z0-9-]{6,64})_[A-Za-z0-9_-]{40,64})$/.exec(header || "");
  if (!match?.[1] || !match[2]) throw unauthorized();

  const token = match[1];
  const keyId = match[2];
  const row = await env.DB.prepare(
    "SELECT key_id, digest_sha256, scopes_json, expires_at, revoked_at FROM api_keys WHERE key_id = ?",
  ).bind(keyId).first<ApiKeyRow>();

  const presentedDigest = await sha256Hex(token);
  const expectedDigest = row?.digest_sha256 ?? "0".repeat(64);
  const digestMatches = constantTimeEqual(presentedDigest, expectedDigest);
  if (!row || !digestMatches || row.revoked_at) throw unauthorized();
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) throw unauthorized();

  let scopes: Scope[];
  try {
    const parsed = JSON.parse(row.scopes_json) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((scope) => ALL_SCOPES.includes(scope as Scope))) throw new Error();
    scopes = parsed as Scope[];
  } catch {
    throw unauthorized();
  }
  return { keyId: row.key_id, scopes };
}

export function requireScope(auth: AuthContext, scope: Scope): void {
  if (!auth.scopes.includes(scope)) {
    throw new HttpError(403, "insufficient_scope", "Token does not have the required scope");
  }
}

function unauthorized(): HttpError {
  return new HttpError(401, "unauthorized", "Invalid or expired bearer token", {
    "WWW-Authenticate": 'Bearer realm="agentpostoffice"',
  });
}
