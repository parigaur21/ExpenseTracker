CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  base_currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_memberships (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  joined_on DATE NOT NULL,
  left_on DATE,
  role VARCHAR(30) NOT NULL DEFAULT 'MEMBER',
  UNIQUE(group_id, user_id, joined_on)
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by_user_id UUID NOT NULL REFERENCES users(id),
  expense_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  original_amount NUMERIC(14,2) NOT NULL,
  original_currency VARCHAR(3) NOT NULL,
  exchange_rate NUMERIC(14,6) NOT NULL,
  converted_amount NUMERIC(14,2) NOT NULL,
  split_type VARCHAR(30) NOT NULL,
  source_import_id UUID,
  source_row_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_splits (
  id UUID PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(14,2) NOT NULL,
  percentage NUMERIC(8,4),
  share_units NUMERIC(10,4)
);

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by_user_id UUID NOT NULL REFERENCES users(id),
  paid_to_user_id UUID NOT NULL REFERENCES users(id),
  settlement_date DATE NOT NULL,
  original_amount NUMERIC(14,2) NOT NULL,
  original_currency VARCHAR(3) NOT NULL,
  exchange_rate NUMERIC(14,6) NOT NULL,
  converted_amount NUMERIC(14,2) NOT NULL,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL,
  total_rows INTEGER NOT NULL,
  accepted_rows INTEGER NOT NULL,
  skipped_rows INTEGER NOT NULL,
  blocked_rows INTEGER NOT NULL,
  review_rows INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  action VARCHAR(20) NOT NULL,
  message VARCHAR(800) NOT NULL,
  raw_row TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  group_id UUID REFERENCES groups(id),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_group_date ON expenses(group_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_membership_group_user ON group_memberships(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_import ON anomalies(import_id);
