CREATE TABLE IF NOT EXISTS reference_datasets (
  dataset_id TEXT PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  category_id BIGINT REFERENCES reference_categories(category_id),
  current_asset_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, canonical_title)
);

ALTER TABLE data_assets ADD COLUMN IF NOT EXISTS dataset_id TEXT;
ALTER TABLE data_assets ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE data_assets ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO reference_datasets(dataset_id, canonical_title, category_id, current_asset_id)
SELECT 'DATASET-' || a.asset_id, a.title, a.category_id,
       CASE WHEN a.status='published' THEN a.asset_id ELSE NULL END
FROM data_assets a
WHERE a.dataset_id IS NULL
ON CONFLICT DO NOTHING;

UPDATE data_assets a
SET dataset_id='DATASET-' || a.asset_id,
    version_number=1,
    version_label=COALESCE(NULLIF(a.version_label,''),'v1'),
    is_current=(a.status='published')
WHERE a.dataset_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='data_assets_dataset_id_fkey'
  ) THEN
    ALTER TABLE data_assets
      ADD CONSTRAINT data_assets_dataset_id_fkey
      FOREIGN KEY(dataset_id) REFERENCES reference_datasets(dataset_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_data_assets_dataset ON data_assets(dataset_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_data_assets_current ON data_assets(is_current, status);
