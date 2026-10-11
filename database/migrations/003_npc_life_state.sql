-- Independent NPC memory: never change or drop OpusCraft IndexedDB or game_state.
CREATE TABLE IF NOT EXISTS gfc_npc_life_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  payload_json LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
