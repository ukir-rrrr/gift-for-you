-- Phase 3: price tiers, reports and hiding, accounts, purchases, thanks, blocks, admin, analytics.

ALTER TABLE gifts ADD COLUMN tier TEXT;
-- Set while a gift is held back (reports, a removal request, or an operator). A hidden gift answers 404 like a gone one.
ALTER TABLE gifts ADD COLUMN hidden_at INTEGER;
ALTER TABLE gifts ADD COLUMN hidden_reason TEXT;
-- Why a gift ended: sender, code, expiry, operator, account_deleted.
ALTER TABLE gifts ADD COLUMN ended_reason TEXT;

ALTER TABLE devices ADD COLUMN account_id TEXT;
CREATE INDEX devices_account ON devices(account_id);

-- A sign-in (Apple / Google) ties devices together so history follows the person. Only a hash of the subject is kept.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE account_links (
  provider TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject_hash)
);

-- Store transactions, verified on purchase or announced by the RevenueCat webhook. gift_id is set once the
-- purchase is spent on a gift; an unspent row is a credit the device can still use.
CREATE TABLE purchases (
  transaction_id TEXT PRIMARY KEY,
  app_user_id TEXT,
  product_id TEXT NOT NULL,
  store TEXT NOT NULL,
  is_sandbox INTEGER NOT NULL DEFAULT 0,
  purchased_at INTEGER NOT NULL,
  gift_id TEXT UNIQUE,
  refunded_at INTEGER,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX purchases_user ON purchases(app_user_id, gift_id);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

-- One report per reporter (hashed IP and gift) per gift.
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  UNIQUE (gift_id, reporter_hash)
);
CREATE INDEX reports_open ON reports(status, created_at);

-- Removal requests from a person shown in a photo, sent through /legal/removal.
CREATE TABLE removal_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id TEXT,
  share_id TEXT,
  contact TEXT NOT NULL,
  relation TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

-- A recipient's browser (random viewer key, hashed) blocking a sender (account or device).
CREATE TABLE blocks (
  viewer_hash TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  gift_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (viewer_hash, sender_id)
);

-- One thank-you stamp per gift.
CREATE TABLE thanks (
  gift_id TEXT PRIMARY KEY,
  stamp TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- E-gift domains an operator added on top of the built-in allowlist.
CREATE TABLE egift_domains (
  domain TEXT PRIMARY KEY,
  note TEXT,
  added_at INTEGER NOT NULL
);

CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target TEXT,
  at INTEGER NOT NULL
);

-- Product analytics. props never holds names, messages, photos, URLs, or keys.
CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  props TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX analytics_name_at ON analytics_events(name, at);
