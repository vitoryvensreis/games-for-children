-- GamesForChildren: projeção relacional inicial (não substitui game_state)
-- Executar apenas pelo script de migração, após backup.
CREATE TABLE IF NOT EXISTS gfc_users (
 id CHAR(36) PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 role ENUM('admin','child') NOT NULL,
 password_hash VARCHAR(255) NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 1,
 login_enabled TINYINT(1) NOT NULL DEFAULT 1,
 voice_enabled TINYINT(1) NOT NULL DEFAULT 1,
 daily_limit_minutes INT UNSIGNED NOT NULL DEFAULT 60,
 session_version INT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_role_enabled (role,enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS gfc_sessions (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 token_hash CHAR(64) NOT NULL,
 session_version INT UNSIGNED NOT NULL DEFAULT 0,
 expires_at DATETIME(3) NOT NULL,
 revoked TINYINT(1) NOT NULL DEFAULT 0,
 daily_usage_json JSON NULL,
 last_tick DATETIME(3) NULL,
 UNIQUE KEY uniq_token_hash(token_hash),
 KEY idx_user_expiry(user_id,expires_at),
 FOREIGN KEY(user_id) REFERENCES gfc_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS gfc_activity_events (
 id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NULL,
 event_type VARCHAR(100) NOT NULL,
 occurred_at DATETIME(3) NOT NULL,
 KEY idx_user_time (user_id,occurred_at),
 FOREIGN KEY(user_id) REFERENCES gfc_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS gfc_matches (
 id CHAR(36) PRIMARY KEY,
 game_key VARCHAR(60) NOT NULL DEFAULT 'race',
 played_at DATETIME(3) NOT NULL,
 KEY idx_game_time (game_key,played_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS gfc_match_players (
 match_id CHAR(36) NOT NULL,
 user_id CHAR(36) NULL,
 player_name VARCHAR(100) NOT NULL,
 score INT NOT NULL,
 position SMALLINT UNSIGNED NOT NULL,
 PRIMARY KEY(match_id,position),
 FOREIGN KEY(match_id) REFERENCES gfc_matches(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES gfc_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS gfc_push_subscriptions (
 endpoint_hash CHAR(64) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 endpoint TEXT NOT NULL,
 subscription_json JSON NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 KEY idx_push_user(user_id),
 FOREIGN KEY(user_id) REFERENCES gfc_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS gfc_game_catalog (
 game_key VARCHAR(60) PRIMARY KEY,
 title VARCHAR(120) NOT NULL,
 active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO gfc_game_catalog(game_key,title,active) VALUES ('race','Corrida Maluca',1)
ON DUPLICATE KEY UPDATE title=VALUES(title);
