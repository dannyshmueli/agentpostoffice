import { describe, expect, it, vi } from "vitest";
import { replyToMessage } from "../packages/worker/src/outbound.js";
import type { AuthContext, Env } from "../packages/worker/src/types.js";

describe("Cloudflare Email Sending request", () => {
  it("lets Cloudflare generate Message-ID while preserving reply threading headers", async () => {
    const send = vi.fn(async () => ({ messageId: "cloudflare-message-id" }));
    const env = outboundHarness(send);
    const auth = { keyId: "key_1", scopes: ["messages:reply"] } as AuthContext;

    const result = await replyToMessage(
      "msg_original",
      { text: "Reply body" },
      "reply-idempotency-key",
      auth,
      env,
    );

    expect(result.status).toBe(202);
    expect(send).toHaveBeenCalledOnce();
    const request = send.mock.calls[0]?.[0] as { headers?: Record<string, string> };
    expect(request.headers).toEqual({
      "In-Reply-To": "<original@example.net>",
      References: "<earlier@example.net> <original@example.net>",
    });
    expect(request.headers).not.toHaveProperty("Message-ID");
  });
});

function outboundHarness(send: ReturnType<typeof vi.fn>): Env {
  const original = {
    id: "msg_original",
    inbox_id: "inb_1",
    direction: "inbound",
    envelope_from: "sender@example.net",
    envelope_to: "receive@mail.example.com",
    reply_to: null,
    subject: "Original",
    parse_status: "ready",
    headers_json: JSON.stringify({
      "message-id": "<original@example.net>",
      references: "<earlier@example.net>",
    }),
    tombstoned_at: null,
  };
  const inbox = {
    id: "inb_1",
    domain: "mail.example.com",
    local_part: "receive",
    display_name: "Receive",
    active: 1,
    created_at: "now",
    updated_at: "now",
  };
  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn(function () { return this; }),
      first: vi.fn(async () => sql.includes("FROM messages") ? original : inbox),
      run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
    };
    return statement;
  });
  return {
    DB: { prepare, batch: vi.fn(async () => []) },
    MAIL_BUCKET: { put: vi.fn(async () => null) },
    MAIL_QUEUE: { send: vi.fn(async () => undefined) },
    EMAIL: { send },
    MAIL_DOMAIN: "mail.example.com",
    BODY_EXCERPT_BYTES: "8192",
  } as unknown as Env;
}
