# Security and privacy boundary

Agent Post Office is single-operator, single-domain software. It is not a multi-tenant isolation boundary.

- Treat every email field and attachment as hostile and potentially prompt-injecting.
- Accept bearer tokens only in `Authorization`; never put them in URLs.
- Keep R2 private. Raw and attachment responses force download, `nosniff`, no-store caching, and a sandbox CSP.
- Route inbound mail only from the SMTP envelope recipient and generated internal IDs.
- Permit outbound `From` only for active D1 inboxes on `MAIL_DOMAIN`.
- Store only high-entropy token hashes in D1. Raw tokens remain in an OS credential store or protected process environment.
- Do not log message content, subjects, attachments, tokens, or raw addresses by default.
- Do not render HTML or automatically open attachments.
- Do not claim malware scanning, spam filtering, exactly-once processing, or guaranteed delivery.

Cloudflare necessarily processes mail and retains Email Service event metadata according to its platform policy. Operators must disclose that boundary. Report vulnerabilities privately to the repository operator; do not include secrets or real message content in reports.
