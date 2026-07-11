import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { AgentPostOfficeClient } from "../packages/client/src/index.js";
import { createAgentPostOfficeMcpServer } from "../packages/mcp/src/server.js";

describe("Agent Post Office MCP contract", () => {
  it("exposes bounded API operations and keeps HTML opt-in", async () => {
    const getMessage = vi.fn(async () => ({ id: "msg_1", attachments: [], text: "plain", untrusted_content: true }));
    const fakeClient = {
      listInboxes: vi.fn(async () => []),
      getMessage,
    } as unknown as AgentPostOfficeClient;
    const server = createAgentPostOfficeMcpServer(fakeClient);
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "poll_messages",
      "get_message",
      "send_message",
      "reply_to_message",
      "save_raw_message",
      "save_attachment",
      "delete_message",
      "delete_messages",
    ]));
    await client.callTool({ name: "get_message", arguments: { message_id: "msg_1" } });
    expect(getMessage).toHaveBeenCalledWith("msg_1");

    await client.close();
    await server.close();
  });
});
