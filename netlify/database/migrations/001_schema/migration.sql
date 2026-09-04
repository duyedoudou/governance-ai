
CREATE TABLE IF NOT EXISTS households (
  household_id TEXT PRIMARY KEY,
  village_group TEXT NOT NULL,
  address TEXT,
  house_structure TEXT,
  risk_level TEXT,
  geo_risk TEXT,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS people (
  person_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  birth_date DATE NOT NULL,
  household_id TEXT REFERENCES households(household_id),
  masked_phone TEXT,
  special_tags TEXT,
  risk_tags TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_people_household ON people(household_id);
CREATE INDEX IF NOT EXISTS idx_people_birth ON people(birth_date);

CREATE TABLE IF NOT EXISTS household_members (
  household_id TEXT REFERENCES households(household_id),
  person_id TEXT REFERENCES people(person_id),
  relation TEXT,
  valid_from DATE,
  valid_to DATE,
  status TEXT,
  PRIMARY KEY (household_id, person_id, valid_from)
);

CREATE TABLE IF NOT EXISTS pension_accounts (
  pension_account_id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(person_id),
  insurance_type TEXT,
  enrollment_status TEXT,
  enrollment_date DATE,
  benefit_status TEXT,
  updated_at DATE,
  source_doc_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_pension_accounts_person ON pension_accounts(person_id);

CREATE TABLE IF NOT EXISTS pension_payments (
  payment_id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(person_id),
  year INTEGER NOT NULL,
  payment_status TEXT,
  tier_amount NUMERIC(12,2),
  paid_amount NUMERIC(12,2),
  payment_date DATE,
  subsidy_amount NUMERIC(12,2),
  source_doc_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_pension_payments_person_year ON pension_payments(person_id, year);

CREATE TABLE IF NOT EXISTS welfare_records (
  welfare_id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(person_id),
  welfare_type TEXT,
  status TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  source_doc_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_welfare_person ON welfare_records(person_id);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  event_name TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  response_level TEXT,
  status TEXT
);
CREATE TABLE IF NOT EXISTS evacuations (
  evacuation_id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(event_id),
  person_id TEXT REFERENCES people(person_id),
  household_id TEXT REFERENCES households(household_id),
  evacuation_time TIMESTAMP,
  shelter TEXT,
  reason TEXT,
  return_time TIMESTAMP,
  status TEXT,
  source_doc_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_evac_event ON evacuations(event_id);

CREATE TABLE IF NOT EXISTS cadres (
  cadre_id TEXT PRIMARY KEY,
  name TEXT,
  role TEXT,
  responsibility_area TEXT,
  masked_phone TEXT,
  status TEXT
);
CREATE TABLE IF NOT EXISTS event_cadres (
  event_id TEXT REFERENCES events(event_id),
  cadre_id TEXT REFERENCES cadres(cadre_id),
  task_role TEXT,
  responsibility_area TEXT,
  confirmation_status TEXT,
  PRIMARY KEY(event_id, cadre_id, task_role)
);
CREATE TABLE IF NOT EXISTS expenses (
  expense_id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(event_id),
  category TEXT,
  summary TEXT,
  expense_date DATE,
  amount NUMERIC(14,2),
  handler_cadre_id TEXT,
  source_doc_id TEXT,
  verification_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_event ON expenses(event_id);

CREATE TABLE IF NOT EXISTS documents (
  doc_id TEXT PRIMARY KEY,
  event_id TEXT,
  file_name TEXT,
  file_type TEXT,
  archived_date DATE,
  source TEXT,
  verification_status TEXT
);
CREATE TABLE IF NOT EXISTS evidence (
  evidence_id TEXT PRIMARY KEY,
  data_type TEXT,
  record_id TEXT,
  doc_id TEXT REFERENCES documents(doc_id),
  locator TEXT,
  verification_method TEXT,
  verification_status TEXT
);

CREATE TABLE IF NOT EXISTS policies (
  policy_id TEXT PRIMARY KEY,
  domain TEXT,
  title TEXT,
  published_date DATE,
  effective_date DATE,
  status TEXT,
  source TEXT,
  doc_id TEXT,
  applicable_to TEXT,
  summary TEXT,
  clauses JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS data_catalog (
  domain_id TEXT PRIMARY KEY,
  domain_name TEXT,
  status TEXT,
  core_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  answerable JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_date DATE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'demo-user',
  original_query TEXT NOT NULL,
  model_mode TEXT,
  model_name TEXT,
  plan JSONB,
  result_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
