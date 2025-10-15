-- Cloudflare D1 数据库结构

-- 临时邮箱表
CREATE TABLE IF NOT EXISTS temp_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    cloudflare_rule_id TEXT,
    target_email TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    last_received_at TEXT,
    message_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_email ON temp_emails(email);
CREATE INDEX IF NOT EXISTS idx_status ON temp_emails(status);
CREATE INDEX IF NOT EXISTS idx_created ON temp_emails(created_at);

-- 邮件记录表
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temp_email_id INTEGER NOT NULL,
    message_id TEXT UNIQUE,
    sender TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    verification_code TEXT,
    received_at TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (temp_email_id) REFERENCES temp_emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_temp_email ON messages(temp_email_id);
CREATE INDEX IF NOT EXISTS idx_message ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_received ON messages(received_at);
CREATE INDEX IF NOT EXISTS idx_is_read ON messages(is_read);

-- 系统配置表
CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 插入默认配置
INSERT OR IGNORE INTO config (config_key, config_value) VALUES
    ('cloudflare_api_token', ''),
    ('cloudflare_account_id', ''),
    ('cloudflare_zone_id', ''),
    ('domain_name', ''),
    ('target_qq_email', ''),
    ('qq_imap_password', ''),
    ('monitor_interval', '10'),
    ('auto_delete_days', '7'),
    ('monitor_status', 'stopped');

