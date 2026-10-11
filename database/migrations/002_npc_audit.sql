-- Monitor da Andarilha: eventos de IA, sem credenciais e sem dados pessoais.
-- Migração aditiva, não modifica game_state ou o perfil IndexedDB.
-- Backup do banco recomendado antes de aplicar em produção.
CREATE TABLE IF NOT EXISTS gfc_npc_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(16) NOT NULL,
  action VARCHAR(16) NULL,
  source VARCHAR(16) NULL,
  details_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_created (created_at),
  KEY idx_type_id (event_type, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
