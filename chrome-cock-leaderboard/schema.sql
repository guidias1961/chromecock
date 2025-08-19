-- Uma linha por jogador. name_norm é a chave. display_name preserva maiúsculas.
CREATE TABLE IF NOT EXISTS scores (
  name_norm TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_best ON scores(best_score DESC, updated_at ASC);

