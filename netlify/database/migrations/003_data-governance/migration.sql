CREATE TABLE IF NOT EXISTS reference_categories (
  category_id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO reference_categories(name, description) VALUES
  ('人口与家庭','人口、家庭与村组基础资料'),
  ('养老保险','养老保险账户、缴费与待遇资料'),
  ('民政与关爱','低保、独居、高龄、残疾与救助资料'),
  ('应急防灾','防汛防台、人员转移、费用与干部参与资料'),
  ('政策文件','政策、通知、办法与业务依据')
ON CONFLICT(name) DO NOTHING;

CREATE TABLE IF NOT EXISTS data_assets (
  asset_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'structured',
  source_file_name TEXT NOT NULL,
  source_blob_key TEXT,
  mime_type TEXT,
  file_size BIGINT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'classified',
  proposed_category TEXT,
  category_id BIGINT REFERENCES reference_categories(category_id),
  classification_source TEXT,
  classification_confidence NUMERIC(5,4),
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  record_count INTEGER NOT NULL DEFAULT 0,
  searchable_text TEXT,
  version_label TEXT DEFAULT 'v1',
  uploaded_by TEXT DEFAULT 'demo-admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_data_assets_status ON data_assets(status);
CREATE INDEX IF NOT EXISTS idx_data_assets_category ON data_assets(category_id);

CREATE TABLE IF NOT EXISTS data_asset_records (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES data_assets(asset_id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id,row_no)
);
CREATE INDEX IF NOT EXISTS idx_data_asset_records_asset ON data_asset_records(asset_id,row_no);
