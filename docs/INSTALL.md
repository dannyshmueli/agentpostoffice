# Agent Post Office installation

This workflow is resumable and intentionally separates application resources from live mail routing. Do not change MX or activate the catch-all until the Worker is deployed, a token exists, and at least one intended mailbox has been created.

## 1. Prerequisites

- Node.js 20+ and npm.
- A Cloudflare account containing the selected DNS zone.
- Workers Paid for arbitrary-recipient Email Sending.
- A full operator-selected `MAIL_DOMAIN`, for example `mail.example.com`.
- A disposable domain or subdomain for the first Phase 0 run.

Create a least-privilege Cloudflare API token yourself. Do not paste it into source files, Wrangler variables, issue trackers, or Phase 0 evidence. The exact permission set must be proven against the current Cloudflare API during Phase 0; do not broaden permissions merely to bypass a failure.

## Choose a Cloudflare setup path

Both paths use the shared application setup in sections 2-6. Choose how Email Sending, Email Routing, and their managed DNS records are activated:

- **Path A - manual dashboard:** the operator performs Email Service onboarding in the Cloudflare dashboard.
- **Path B - agent-assisted Wrangler:** a local agent provisions and deploys through Wrangler, reports proposed changes, and stops for explicit approval before every live DNS, MX, routing, or real-send action.

Do not hand-enter generated DKIM records. Cloudflare should create its managed Email Service records through the dashboard or supported API.

### Path B credential

Interactive Wrangler OAuth is the simplest option:

```bash
npx wrangler login
npx wrangler whoami
```

For a custom token, create one in Cloudflare under **My Profile > API Tokens > Create Custom Token**, restrict it to the intended account and zone, and provide it to Wrangler outside the repository:

```bash
export CLOUDFLARE_API_TOKEN='<token>'
npx wrangler whoami
```

The bootstrap workflow currently needs these Cloudflare permissions:

| Scope | Permission | Used for |
| --- | --- | --- |
| Account | Workers Scripts: Edit | Deploy the Worker and bindings. |
| Account | D1: Edit | Create/reuse D1 and apply migrations. |
| Account | Workers R2 Storage: Edit | Create/reuse the private mail bucket. |
| Account | Queues: Edit | Create/reuse the parse queue and DLQ. |
| Account | Email Sending: Edit | Onboard the sending domain and use Email Sending. This beta permission may only appear for entitled accounts. |
| Zone | Zone: Read | Resolve and verify the selected zone. |
| Zone | Zone Settings: Edit | Enable Email Routing and let Cloudflare add and lock its managed MX/SPF records. Wrangler OAuth presents the equivalent specialized capability as `email_routing (write)`. |
| Zone | Email Routing Rules: Edit | Point the catch-all rule at the deployed Worker. |

General `DNS: Edit` is not required when Cloudflare's Email Routing and Email Sending onboarding endpoints create their own managed records. Add `DNS: Edit` only if the workflow will also create, update, or delete arbitrary DNS records directly. `Email Routing Addresses: Edit` is not needed when mail routes only to the Worker. `Workers Routes: Edit` is not needed for the default `workers.dev` URL; add it only if the deployment uses a custom Worker route.

Cloudflare Email Sending is beta, and its custom-token permission has not been independently proven by this repository's Phase 0 run. If a narrowly scoped token fails, record the exact operation and required permission before changing the token. Never replace this with a global API key.

## 2. Verify the repository

```bash
npm install
npm test
npm run check
npm run build
npx wrangler whoami
```

Stop if any local gate fails.

## 3. Provision application storage and queues

```bash
npm run config:generate -- --mail-domain mail.example.com
```

The command inspects and reuses matching D1, R2, Queue, and DLQ resources. It backs up an existing local Wrangler configuration before rewriting it, then applies remote D1 migrations. The generated `packages/worker/wrangler.jsonc` contains identifiers but no secret and is ignored by Git.

Review the generated binding names and domain before continuing.

## 4. Prepare outbound sending

Do not activate Email Sending yet. Confirm that the account has Workers Paid, then continue through Path A or Path B after the Worker and intended mailboxes exist. Display every DNS record Cloudflare proposes before applying it. Workers Paid arbitrary-recipient sending and real SPF, DKIM, and DMARC passage are mandatory proof gates—not assumptions.

The Worker binding is named `EMAIL`. It is unrestricted by destination because agents send transactional mail to arbitrary recipients; application code restricts `From` to active D1 inboxes on `MAIL_DOMAIN`.

## 5. Deploy, migrate, and create an application token

```bash
npm run deploy
npm --workspace @agentpostoffice/worker run migrate:remote
npm run token:create -- --label default
```

The raw `apo_...` token is displayed once. D1 receives only its SHA-256 digest, public key ID, label, scopes, optional expiry, and revocation state.

Store it locally:

```bash
node packages/cli/dist/index.js config set --url <worker-url> --token '<raw-token>'
node packages/cli/dist/index.js status
```

List and revoke token metadata through direct Wrangler D1 administration:

```bash
npm run token:list
npm run token:revoke -- --key-id <public-key-id>
```

## 6. Create mailboxes before routing mail

```bash
node packages/cli/dist/index.js inboxes create research --display-name "Research Agent"
node packages/cli/dist/index.js inboxes list
```

Create every address that must survive a provider/MX migration. Unknown and disabled addresses are rejected; they do not auto-create or fall back.

## 7. Activate Cloudflare Email Service

### Path A - manual dashboard

#### Email Sending

1. In Cloudflare, go to **Compute > Email Service > Email Sending**.
2. Select **Onboard Domain** and choose the exact `MAIL_DOMAIN`.
3. Review the proposed bounce MX, SPF, DKIM, and DMARC records. Resolve any existing-record conflict before continuing.
4. Select **Done**, then wait for the domain status to become ready.

#### Email Routing

1. Go to **Compute > Email Service > Email Routing** and select **Onboard Domain**.
2. Choose the exact `MAIL_DOMAIN` and review the proposed inbound MX, SPF, and DKIM records.
3. Confirm which existing MX records will be replaced. This is a provider cutover for all inbound mail on that domain.
4. Select **Done**.
5. Open **Routing Rules**, enable **Catch-all**, choose **Send to a Worker**, select the deployed `agentpostoffice` Worker, and save.

The Cloudflare catch-all is transport into Agent Post Office, not an application-level accept-all policy. The Worker rejects recipients that do not match an active D1 mailbox.

### Path B - agent-assisted Wrangler

Give the agent the repository path, the exact `MAIL_DOMAIN`, intended mailbox local parts, and this contract:

> Use `docs/INSTALL.md` and the repo-local `agentpostoffice-setup` skill. Run the local gates, reuse matching resources, show all proposed Email Sending and Email Routing DNS changes, identify records that will be removed or replaced, and stop for my explicit approval before enabling Sending, changing DNS/MX, enabling routing, changing the catch-all, or sending real mail. Never print or persist credentials or message content.

The agent can inspect routing without changing it:

```bash
export MAIL_DOMAIN='example.com'
npx wrangler email routing settings "$MAIL_DOMAIN"
npx wrangler email routing dns get "$MAIL_DOMAIN"
npx wrangler email routing rules get "$MAIL_DOMAIN" catch-all
```

After the operator explicitly approves the displayed provider/MX cutover, the agent may run:

```bash
npx wrangler email routing enable "$MAIL_DOMAIN"
npx wrangler email routing rules update "$MAIL_DOMAIN" catch-all \
  --enabled true \
  --action-type worker \
  --action-value agentpostoffice
```

Then verify:

```bash
npx wrangler email routing settings "$MAIL_DOMAIN"
npx wrangler email routing rules get "$MAIL_DOMAIN" catch-all
dig +short MX "$MAIL_DOMAIN"
```

For Email Sending, Wrangler 4.110.0 can enable the domain and retrieve its DNS records:

```bash
npx wrangler email sending enable "$MAIL_DOMAIN"
npx wrangler email sending dns get "$MAIL_DOMAIN"
npx wrangler email sending settings "$MAIL_DOMAIN"
```

However, the current CLI cannot retrieve the exact generated Sending DKIM record before `email sending enable` creates the sending resource. Before running that mutating command, the agent must use Cloudflare's dashboard review screen, supported browser tooling, or another current non-mutating preview mechanism to show the exact proposed records and obtain approval. If no exact preview is available, stop and use Path A for Email Sending.

### Verify either path

Check Email Sending and Routing status, confirm public DNS, and send only operator-approved disposable test messages. A dedicated mail subdomain is safest when the apex already receives mail elsewhere; using the apex intentionally replaces its existing inbound provider.

After activation, run every gate in [PHASE-0.md](./PHASE-0.md). Setup is incomplete until a real inbound message is visible through polling, explicitly acknowledged, and successfully replied to with correct threading.

## 8. Configure MCP

Provide credentials through the MCP process environment:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/agentpostoffice/packages/mcp/dist/index.js"],
  "env": {
    "AGENTPOSTOFFICE_URL": "https://<worker-url>",
    "AGENTPOSTOFFICE_TOKEN": "apo_<key-id>_<secret>"
  }
}
```

Use a narrower token when the MCP client does not need mailbox management or deletion.
