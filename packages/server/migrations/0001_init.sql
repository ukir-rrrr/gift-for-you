-- Anonymous creator devices. id is the SHA-256 of the device key; the key itself never reaches the server's storage.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  push_token TEXT,
  push_platform TEXT
);

CREATE TABLE gifts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'revoked', 'expired')),
  share_id TEXT UNIQUE,
  to_name TEXT,
  share_json TEXT,
  reveal_json TEXT,
  passphrase_hash TEXT,
  revoke_hash TEXT,
  purchase_tx TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  expires_at INTEGER,
  ended_at INTEGER,
  opened_at INTEGER,
  goal_at INTEGER,
  opened_count INTEGER NOT NULL DEFAULT 0,
  goal_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX gifts_device ON gifts(device_id, created_at);
CREATE INDEX gifts_expiry ON gifts(status, expires_at);

CREATE TABLE photos (
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
  reason TEXT,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (gift_id, ref)
);

-- One row per gift and type, so each push goes out once.
CREATE TABLE notifications (
  gift_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (gift_id, type)
);

-- Fixed-window counters for passphrase and revoke-code guesses.
CREATE TABLE attempts (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Local and test only: what the mock push notifier would have sent.
CREATE TABLE mock_push_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
