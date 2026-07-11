# Agent Post Office

Agent Post Office is an open-source, self-hosted email service for agents. It runs inside the operator's Cloudflare account, receives mail for one custom domain, exposes a pull-based REST API, and sends transactional mail and replies.

The local Phase 1 implementation exists and is test-covered. It has **not** passed the mandatory live Cloudflare Phase 0 gates and should not be treated as production-ready yet. See [the architecture plan](./AGENTPOSTOFFICE-PLAN.md) and [the live proof checklist](./docs/PHASE-0.md).

## Monorepo

| Package | Purpose |
| --- | --- |
| `@agentpostoffice/worker` | Email Worker, REST API, D1 schema, R2 persistence, Queue parsing/deletion, Email Sending. |
| `@agentpostoffice/client` | Typed REST client used by the CLI and MCP server. |
| `@agentpostoffice/cli` | Credential-aware mailbox/message/send/reply CLI. |
| `@agentpostoffice/mcp` | Bounded MCP tools with explicit untrusted-content labels. |
| `@agentpostoffice/openapi` | OpenAPI 3.1 contract. |

## What is implemented

- Catch-all Email Worker logic that validates the SMTP envelope recipient against active D1 inboxes.
- A 10 MiB application limit, byte-exact raw MIME persistence to private R2, D1 ingestion state, and ID-only Queue tasks.
- Idempotent `postal-mime` Queue parsing, 8 KiB UTF-8 excerpts, private complete bodies, attachment checksums, and DLQ-to-`parse_failed` handling.
- Scoped SHA-256 bearer-token authentication with constant-time digest comparison.
- Inbox CRUD; domain-wide keyset polling; message get/acknowledge/raw/attachment/delete; explicit-ID bulk deletion.
- Transactional send and reply with required idempotency keys and `accepted`, `failed`, or `unknown` outcomes.
- A shared client, local CLI, MCP server, versioned D1 migration, OpenAPI contract, and repo-local setup skill.

All email bodies, subjects, headers, links, and attachments are untrusted. The service does not render HTML, open downloads, scan malware, promise exactly-once processing, or claim delivery after Cloudflare accepts a send.

## Development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm test
npm run check
npm run build
```

The test suite has two gates:

- Node unit tests for boundary normalization, bearer handling, the client, and SMTP persistence failure ordering.
- Cloudflare workerd integration tests with real local D1 and R2 bindings for migrations, keyset pagination, tombstones, download headers, MIME parsing, attachment storage, queue redelivery, and idempotency replay.

TDD is mandatory for new behavior; see [AGENTS.md](./AGENTS.md).

## Configure Cloudflare application resources

Do not run this against an account until you have reviewed [docs/INSTALL.md](./docs/INSTALL.md) and [docs/PHASE-0.md](./docs/PHASE-0.md).

The installation guide offers two supported Cloudflare setup paths:

1. **Manual dashboard path:** the operator reviews and confirms Email Sending, Email Routing, DNS, and the catch-all-to-Worker rule in the Cloudflare dashboard.
2. **Agent-assisted path:** a local agent uses Wrangler and a scoped Cloudflare credential to provision and deploy resources, prints the proposed routing changes, and pauses for explicit approval before changing DNS or routing.

Both paths use the same self-hosted Worker, D1, R2, Queue, and application-token setup. The difference is who performs the Cloudflare Email Service onboarding. Manual DNS entry is not recommended because Cloudflare generates the DKIM key and manages the Email Service records.

```bash
npm run config:generate -- --mail-domain mail.example.com
```

The helper authenticates Wrangler, inspects/reuses or creates D1, R2, Queue, and DLQ resources, writes the ignored `packages/worker/wrangler.jsonc`, and applies migrations. It does not silently activate MX or routing.

See [Agent Post Office installation](./docs/INSTALL.md#choose-a-cloudflare-setup-path) for the dashboard walkthrough, agent prompt contract, Wrangler commands, permissions, and approval boundaries.

Create the first application token after the remote migration:

```bash
npm run token:create -- --label default
```

Only the SHA-256 digest and metadata enter D1. The raw token is printed once. Store it in the OS credential store through the CLI:

```bash
npm run build
node packages/cli/dist/index.js config set \
  --url https://agentpostoffice.example.workers.dev \
  --token 'apo_<key-id>_<secret>'
```

## Basic API use

```bash
curl -sS https://agentpostoffice.example.workers.dev/v1/messages?state=unprocessed\&order=asc\&limit=25 \
  -H "Authorization: Bearer $AGENTPOSTOFFICE_TOKEN"
```

A message remains `unprocessed` until explicitly acknowledged:

```bash
curl -sS -X PATCH https://agentpostoffice.example.workers.dev/v1/messages/msg_123 \
  -H "Authorization: Bearer $AGENTPOSTOFFICE_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"state":"processed"}'
```

Send and reply requests require an `Idempotency-Key`. Reusing the key with different content returns a conflict; once an attempt begins, that key never sends again.

## MCP

Run the built server with credentials in its environment:

```bash
AGENTPOSTOFFICE_URL=https://agentpostoffice.example.workers.dev \
AGENTPOSTOFFICE_TOKEN='apo_<key-id>_<secret>' \
node packages/mcp/dist/index.js
```

MCP message output is labeled `untrusted_content: true`. Attachment tools return metadata only; the MCP server never opens attachment bytes.

## Production status

Local tests cannot establish Cloudflare's real SMTP failure/retry semantics, Email Sending entitlement, SPF/DKIM/DMARC results, or delivery observability. Those claims remain blocked on the live, disposable-domain Phase 0 run. Do not mark setup complete until every gate in [docs/PHASE-0.md](./docs/PHASE-0.md) has evidence.
