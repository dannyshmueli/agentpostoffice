PRAGMA foreign_keys = ON;

CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  inbound_state TEXT NOT NULL DEFAULT 'pending' CHECK (inbound_state IN ('pending', 'active', 'failed')),
  outbound_state TEXT NOT NULL DEFAULT 'pending' CHECK (outbound_state IN ('pending', 'active', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE inboxes (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  local_part TEXT NOT NULL,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (domain, local_part)
);

CREATE INDEX inboxes_active_address_idx ON inboxes (domain, local_part, active);

CREATE TABLE api_keys (
  key_id TEXT PRIMARY KEY,
  digest_sha256 TEXT NOT NULL CHECK (length(digest_sha256) = 64),
  label TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES inboxes(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  envelope_from TEXT NOT NULL,
  envelope_to TEXT NOT NULL,
  reply_to TEXT,
  subject TEXT,
  text_excerpt TEXT,
  body_truncated INTEGER NOT NULL DEFAULT 0 CHECK (body_truncated IN (0, 1)),
  raw_r2_key TEXT,
  parsed_r2_key TEXT,
  parse_status TEXT NOT NULL CHECK (parse_status IN ('pending', 'ready', 'parse_failed', 'not_applicable')),
  agent_state TEXT NOT NULL DEFAULT 'unprocessed' CHECK (agent_state IN ('unprocessed', 'processed')),
  labels_json TEXT NOT NULL DEFAULT '[]',
  headers_json TEXT NOT NULL DEFAULT '{}',
  outbound_status TEXT CHECK (outbound_status IN ('pending', 'accepted', 'failed', 'unknown')),
  cloudflare_message_id TEXT,
  received_at TEXT NOT NULL,
  sent_at TEXT,
  tombstoned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX messages_feed_idx ON messages (received_at, id);
CREATE INDEX messages_poll_idx ON messages (agent_state, tombstoned_at, received_at, id);
CREATE INDEX messages_inbox_poll_idx ON messages (inbox_id, agent_state, tombstoned_at, received_at, id);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT,
  media_type TEXT NOT NULL,
  disposition TEXT NOT NULL,
  size INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX attachments_message_idx ON attachments (message_id);

CREATE TABLE idempotency_keys (
  api_key_id TEXT NOT NULL REFERENCES api_keys(key_id),
  endpoint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  outbound_message_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('started', 'accepted', 'failed', 'unknown')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (api_key_id, endpoint, idempotency_key)
);

CREATE INDEX idempotency_created_idx ON idempotency_keys (created_at);
