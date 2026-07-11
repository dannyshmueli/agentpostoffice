import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { parseMessage } from "../src/queue.js";
import type { Env } from "../src/types.js";

const workerEnv = env as unknown as Env;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM attachments"),
    env.DB.prepare("DELETE FROM messages"),
    env.DB.prepare("DELETE FROM inboxes"),
  ]);
  await env.DB.prepare(
    "INSERT INTO inboxes (id, domain, local_part, active, created_at, updated_at) VALUES ('inb_parse', 'mail.example.com', 'parse', 1, ?, ?)",
  ).bind("2026-07-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z").run();
});

describe("Queue parsing", () => {
  it("is idempotent across redelivery and stores attachment bytes privately", async () => {
    const rawKey = "messages/inb_parse/msg_parse/raw.eml";
    const raw = [
      "From: Person <person@example.net>",
      "To: parse@mail.example.com",
      "Subject: Multipart",
      "Message-ID: <original@example.net>",
      "MIME-Version: 1.0",
      "Content-Type: multipart/mixed; boundary=boundary",
      "",
      "--boundary",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hello from MIME",
      "--boundary",
      "Content-Type: text/plain; name=test.txt",
      "Content-Disposition: attachment; filename=test.txt",
      "Content-Transfer-Encoding: base64",
      "",
      "YXR0YWNobWVudA==",
      "--boundary--",
      "",
    ].join("\r\n");
    await env.MAIL_BUCKET.put(rawKey, raw);
    await env.DB.prepare(
      `INSERT INTO messages
       (id, inbox_id, direction, envelope_from, envelope_to, subject, raw_r2_key, parse_status, agent_state, labels_json, headers_json, received_at, created_at, updated_at)
       VALUES ('msg_parse', 'inb_parse', 'inbound', 'person@example.net', 'parse@mail.example.com', 'Multipart', ?, 'pending', 'unprocessed', '[]', '{}', ?, ?, ?)`,
    ).bind(rawKey, "2026-07-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z").run();

    const task = { kind: "parse" as const, messageId: "msg_parse", rawR2Key: rawKey };
    await parseMessage(task, workerEnv);
    await parseMessage(task, workerEnv);

    const message = await env.DB.prepare(
      "SELECT parse_status, text_excerpt, body_truncated FROM messages WHERE id = 'msg_parse'",
    ).first<{ parse_status: string; text_excerpt: string; body_truncated: number }>();
    expect(message).toEqual({ parse_status: "ready", text_excerpt: "Hello from MIME", body_truncated: 0 });
    const attachment = await env.DB.prepare(
      "SELECT r2_key, filename, checksum_sha256 FROM attachments WHERE message_id = 'msg_parse'",
    ).all<{ r2_key: string; filename: string; checksum_sha256: string }>();
    expect(attachment.results).toHaveLength(1);
    expect(attachment.results[0]?.r2_key).not.toContain("test.txt");
    expect(await (await env.MAIL_BUCKET.get(attachment.results[0]!.r2_key))?.text()).toBe("attachment");
  });
});
