-- 用户隔离功能迁移
-- 添加 user_id 字段以实现用户数据隔离
-- 创建时间：2025-10-17

-- 1. 创建新表（带 user_id 字段）
CREATE TABLE temp_emails_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',  -- 用户标识
    email TEXT NOT NULL,                       -- 邮箱地址
    cloudflare_rule_id TEXT,                   -- CF 规则 ID
    target_email TEXT NOT NULL,                -- 目标邮箱
    created_at TEXT DEFAULT (datetime('now')),
    last_received_at TEXT,
    message_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    UNIQUE(user_id, email)                     -- 联合唯一约束：同一用户不能创建重复邮箱
);

-- 2. 迁移现有数据（分配给默认用户）
INSERT INTO temp_emails_new (id, user_id, email, cloudflare_rule_id, target_email, created_at, last_received_at, message_count, status)
SELECT id, 'default' as user_id, email, cloudflare_rule_id, target_email, created_at, last_received_at, message_count, status
FROM temp_emails;

-- 3. 删除旧表
DROP TABLE temp_emails;

-- 4. 重命名新表
ALTER TABLE temp_emails_new RENAME TO temp_emails;

-- 5. 创建索引（优化查询性能）
CREATE INDEX idx_user_id ON temp_emails(user_id);
CREATE INDEX idx_email ON temp_emails(email);
CREATE INDEX idx_status ON temp_emails(status);
CREATE INDEX idx_created ON temp_emails(created_at);
CREATE INDEX idx_user_email ON temp_emails(user_id, email);

-- 6. 验证迁移结果
-- SELECT COUNT(*) as total_emails FROM temp_emails;
-- SELECT COUNT(DISTINCT user_id) as total_users FROM temp_emails;

