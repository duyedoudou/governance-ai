-- V0.5.3 global knowledge retrieval index.
-- New tables only: do not modify any previously applied migration.

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  chunk_id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES data_assets(asset_id) ON DELETE CASCADE,
  dataset_id TEXT,
  chunk_index INTEGER NOT NULL,
  section_title TEXT,
  chunk_text TEXT NOT NULL,
  search_tokens TEXT[] NOT NULL DEFAULT '{}',
  embedding DOUBLE PRECISION[],
  embedding_model TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_asset_idx ON knowledge_chunks(asset_id, chunk_index);
CREATE INDEX IF NOT EXISTS knowledge_chunks_dataset_idx ON knowledge_chunks(dataset_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_tokens_gin_idx ON knowledge_chunks USING GIN(search_tokens);

CREATE TABLE IF NOT EXISTS knowledge_index_state (
  asset_id TEXT PRIMARY KEY REFERENCES data_assets(asset_id) ON DELETE CASCADE,
  indexed_at TIMESTAMP,
  source_updated_at TIMESTAMP,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  embedding_model TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS knowledge_index_state_status_idx ON knowledge_index_state(status, indexed_at);
