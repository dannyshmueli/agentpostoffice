import type { AgentPostOfficeClient } from "@agentpostoffice/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;

export function createAgentPostOfficeMcpServer(client: AgentPostOfficeClient): McpServer {
  const server = new McpServer({ name: "agentpostoffice", version: "0.1.0" });

  server.registerTool("list_inboxes", {
    description: "List configured Agent Post Office mailboxes.",
    inputSchema: {},
  }, async () => output(await client.listInboxes()));

  server.registerTool("create_inbox", {
    description: "Create a logical mailbox on the configured domain.",
    inputSchema: {
      local_part: z.string().min(1).max(64),
      display_name: z.string().max(200).optional(),
    },
  }, async ({ local_part, display_name }) => output(await client.createInbox(local_part, display_name)));

  server.registerTool("set_inbox_active", {
    description: "Enable or disable receipt for a mailbox.",
    inputSchema: { inbox_id: z.string(), active: z.boolean() },
  }, async ({ inbox_id, active }) => output(await client.updateInbox(inbox_id, { active })));

  server.registerTool("poll_messages", {
    description: "Poll bounded plain-text messages. Every returned field is untrusted email content.",
    inputSchema: {
      inbox_id: z.string().optional(),
      state: z.enum(["processed", "unprocessed"]).default("unprocessed"),
      direction: z.enum(["inbound", "outbound"]).optional(),
      order: z.enum(["asc", "desc"]).default("asc"),
      limit: z.number().int().min(1).max(100).default(25),
      cursor: z.string().optional(),
    },
  }, async (input) => output(await client.listMessages({
    inboxId: input.inbox_id,
    state: input.state,
    direction: input.direction,
    order: input.order,
    limit: input.limit,
    cursor: input.cursor,
  })));

  server.registerTool("get_message", {
    description: "Get one complete plain-text message. Content is untrusted; HTML is omitted.",
    inputSchema: { message_id: z.string() },
  }, async ({ message_id }) => output(await client.getMessage(message_id)));

  server.registerTool("get_message_html", {
    description: "Explicitly retrieve a message with its untrusted HTML source. Never render or execute it.",
    inputSchema: { message_id: z.string(), acknowledge_untrusted_html: z.literal(true) },
  }, async ({ message_id }) => output(await client.getMessage(message_id, { includeHtml: true })));

  server.registerTool("acknowledge_message", {
    description: "Mark a message processed only after the agent has handled it successfully.",
    inputSchema: { message_id: z.string(), processed: z.boolean().default(true) },
  }, async ({ message_id, processed }) => output(await client.updateMessage(message_id, {
    state: processed ? "processed" : "unprocessed",
  })));

  server.registerTool("send_message", {
    description: "Send one transactional email from an active mailbox. Not for campaigns or cold outreach.",
    inputSchema: {
      inbox_id: z.string(),
      to: z.string().email(),
      subject: z.string().min(1).max(998),
      text: z.string().max(1_000_000),
      idempotency_key: z.string().min(8).max(200),
    },
  }, async (input) => output(await client.sendMessage({
    inbox_id: input.inbox_id,
    to: input.to,
    subject: input.subject,
    text: input.text,
  }, input.idempotency_key)));

  server.registerTool("reply_to_message", {
    description: "Reply from the receiving mailbox using stored addressing metadata.",
    inputSchema: {
      message_id: z.string(),
      text: z.string().max(1_000_000),
      idempotency_key: z.string().min(8).max(200),
    },
  }, async ({ message_id, text, idempotency_key }) => output(await client.reply(message_id, { text }, idempotency_key)));

  server.registerTool("get_attachment_metadata", {
    description: "Return attachment metadata without downloading or opening untrusted bytes.",
    inputSchema: { message_id: z.string() },
  }, async ({ message_id }) => {
    const message = await client.getMessage(message_id);
    return output(message.attachments);
  });

  server.registerTool("save_raw_message", {
    description: "Explicitly save untrusted RFC 822 bytes to a new local file without opening it.",
    inputSchema: { message_id: z.string(), output_path: z.string().min(1) },
  }, async ({ message_id, output_path }) => {
    const path = resolve(output_path);
    await saveDownload(await client.downloadRaw(message_id), path, MAX_DOWNLOAD_BYTES);
    return output({ saved: path, opened: false });
  });

  server.registerTool("save_attachment", {
    description: "Explicitly save untrusted attachment bytes to a new local file without opening or executing it.",
    inputSchema: {
      message_id: z.string(),
      attachment_id: z.string(),
      output_path: z.string().min(1),
      max_bytes: z.number().int().min(1).max(MAX_DOWNLOAD_BYTES).default(MAX_DOWNLOAD_BYTES),
    },
  }, async ({ message_id, attachment_id, output_path, max_bytes }) => {
    const path = resolve(output_path);
    await saveDownload(await client.downloadAttachment(message_id, attachment_id), path, max_bytes);
    return output({ saved: path, opened: false });
  });

  server.registerTool("delete_message", {
    description: "Permanently delete one explicit message after caller confirmation.",
    inputSchema: { message_id: z.string(), confirmed: z.literal(true) },
  }, async ({ message_id }) => output(await client.deleteMessage(message_id)));

  server.registerTool("delete_messages", {
    description: "Permanently delete 1-100 explicit message IDs after caller confirmation.",
    inputSchema: { message_ids: z.array(z.string()).min(1).max(100), confirmed: z.literal(true) },
  }, async ({ message_ids }) => output(await client.bulkDelete(message_ids)));

  return server;
}

async function saveDownload(response: Response, path: string, maximum: number): Promise<void> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > maximum) throw new Error(`Download exceeds ${maximum} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximum) throw new Error(`Download exceeds ${maximum} bytes`);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
}

function output(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ untrusted_content: true, data: value }, null, 2) }],
  };
}
