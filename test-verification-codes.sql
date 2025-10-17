-- 验证码提取功能测试 SQL
-- 用于本地测试各种验证码格式的识别能力
-- 使用方法：npx wrangler d1 execute tempemail --local --file=workers/test-verification-codes.sql

-- 清理旧测试数据（可选）
-- DELETE FROM messages WHERE sender LIKE '%test@example.com%';
-- DELETE FROM temp_emails WHERE email LIKE 'test_%';

-- 1. 创建测试用临时邮箱
INSERT OR IGNORE INTO temp_emails (email, target_email, status, created_at) 
VALUES ('test_verification@yourdomain.com', 'your_qq@qq.com', 'active', datetime('now'));

-- 获取临时邮箱ID（后续插入消息时使用）
-- 实际操作中，手动替换下面的 temp_email_id 为上面插入返回的 ID，或使用子查询

-- ==================== 中文验证码格式测试 ====================

-- 测试1：标准格式 - "验证码：XXXXXX"
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-001', 'test@example.com', '【重要】您的验证码', 
  '尊敬的用户，您好！\n\n您的验证码：123456\n\n验证码5分钟内有效，请勿泄露给他人。',
  '<p>尊敬的用户，您好！</p><p>您的验证码：<strong>123456</strong></p><p>验证码5分钟内有效，请勿泄露给他人。</p>',
  datetime('now'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试2：后置格式 - "XXXXXX 是您的验证码"
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-002', 'alipay@service.com', '支付宝验证码', 
  '亲爱的用户：\n\n您正在进行重要操作，验证码 789012 为您的动态验证码，请在5分钟内完成验证。',
  '<div style="font-family: Arial;">亲爱的用户：<br><br>您正在进行重要操作，验证码 <span style="font-size:20px;color:#ff6600;font-weight:bold;">789012</span> 为您的动态验证码，请在5分钟内完成验证。</div>',
  datetime('now', '-1 minute'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试3：括号格式 - "【验证码】XXXXXX"
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-003', 'noreply@taobao.com', '淘宝账户安全验证', 
  '【验证码】AB12CD\n\n请使用上述验证码完成身份验证，验证码有效期为10分钟。\n\n如非本人操作，请忽略此邮件。',
  '<p><strong>【验证码】AB12CD</strong></p><p>请使用上述验证码完成身份验证，验证码有效期为10分钟。</p><p>如非本人操作，请忽略此邮件。</p>',
  datetime('now', '-2 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试4：动态码格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-004', 'security@bank.com', '工商银行动态密码', 
  '尊敬的客户：\n\n您的动态码：XY9876\n\n此动态码用于完成转账操作，请妥善保管，切勿告知他人。',
  '<table><tr><td style="padding:20px;background:#f0f0f0;">您的动态码：<b style="font-size:24px;color:#c00;">XY9876</b></td></tr></table>',
  datetime('now', '-3 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试5：激活码格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-005', 'register@platform.com', '账号激活邮件', 
  '欢迎注册我们的平台！\n\n激活码：QW45ER\n\n请在24小时内使用此激活码完成账号激活。',
  '<div><h3>欢迎注册我们的平台！</h3><p>激活码：<span style="background:#ffeb3b;padding:5px 10px;font-weight:bold;">QW45ER</span></p><p>请在24小时内使用此激活码完成账号激活。</p></div>',
  datetime('now', '-4 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试6：主题中包含验证码
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-006', 'system@notify.com', '您的验证码：567890', 
  '请使用邮件主题中的验证码完成验证。\n\n如有疑问，请联系客服。',
  '<p>请使用邮件主题中的验证码完成验证。</p><p>如有疑问，请联系客服。</p>',
  datetime('now', '-5 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试7：短信验证码格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-007', 'sms@gateway.com', '短信验证码通知', 
  '【平台名称】您的短信验证码 321654 ，5分钟内有效。请勿泄露给他人。退订回T',
  '<div style="border:1px solid #ddd;padding:15px;">【平台名称】您的短信验证码 <strong style="color:#e91e63;font-size:18px;">321654</strong> ，5分钟内有效。请勿泄露给他人。退订回T</div>',
  datetime('now', '-6 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- ==================== 英文验证码格式测试 ====================

-- 测试8：标准英文格式 - "verification code: XXXXXX"
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-008', 'noreply@google.com', 'Google Account Verification', 
  'Hello,\n\nYour verification code is: 456789\n\nThis code will expire in 10 minutes.\n\nBest regards,\nGoogle Team',
  '<div style="font-family:Arial;"><p>Hello,</p><p>Your verification code is: <b style="font-size:22px;color:#4285f4;">456789</b></p><p>This code will expire in 10 minutes.</p><p>Best regards,<br>Google Team</p></div>',
  datetime('now', '-7 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试9：OTP 格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-009', 'security@amazon.com', 'Amazon OTP Code', 
  'Your Amazon One-Time Password (OTP) is: AB34CD\n\nDo not share this code with anyone. Amazon will never ask for this code.',
  '<table width="100%" cellpadding="20" style="background:#f7f7f7;"><tr><td align="center"><div style="background:white;padding:30px;border-radius:8px;"><h2>Your OTP Code</h2><div style="font-size:32px;color:#ff9900;font-weight:bold;letter-spacing:5px;margin:20px 0;">AB34CD</div><p style="color:#666;">Do not share this code with anyone.</p></div></td></tr></table>',
  datetime('now', '-8 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试10：Confirmation Code 格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-010', 'confirm@microsoft.com', 'Microsoft Account Confirmation', 
  'Hi there,\n\nConfirmation code: XY78ZW\n\nEnter this code to confirm your identity.\n\nThanks,\nMicrosoft',
  '<div style="max-width:600px;margin:0 auto;"><h3>Microsoft Account</h3><p>Hi there,</p><p>Confirmation code: <span style="background:#0078d4;color:white;padding:10px 20px;font-size:20px;border-radius:4px;">XY78ZW</span></p><p>Enter this code to confirm your identity.</p><p>Thanks,<br>Microsoft</p></div>',
  datetime('now', '-9 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试11：Security Code 格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-011', 'alert@paypal.com', 'PayPal Security Code', 
  'Your PayPal security code is 987654\n\nUse this code to complete your transaction. This code expires in 5 minutes.\n\nIf you didn''t request this code, please contact support immediately.',
  '<div style="border-left:4px solid #009cde;padding-left:20px;"><h2 style="color:#009cde;">Security Code</h2><p>Your PayPal security code is</p><h1 style="color:#009cde;font-size:36px;margin:10px 0;">987654</h1><p style="color:#666;">Use this code to complete your transaction. This code expires in 5 minutes.</p></div>',
  datetime('now', '-10 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试12：Use code to verify 格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-012', 'verify@github.com', 'Verify your email for GitHub', 
  'Welcome to GitHub!\n\nUse code GH56TY to verify your email address.\n\nThis code will expire in 15 minutes.',
  '<div style="background:#24292e;color:white;padding:40px;text-align:center;"><h2>Welcome to GitHub!</h2><p>Use code <strong style="font-size:28px;color:#58a6ff;letter-spacing:3px;">GH56TY</strong> to verify your email address.</p><p style="color:#8b949e;">This code will expire in 15 minutes.</p></div>',
  datetime('now', '-11 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试13：PIN Code 格式
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-013', 'service@bank.com', 'Your PIN Code', 
  'Dear Customer,\n\nYour PIN code: 4567\n\nPlease keep this code confidential.\n\nBest regards',
  '<table style="width:100%;background:#f5f5f5;padding:20px;"><tr><td style="background:white;padding:30px;border-radius:10px;"><h3 style="color:#333;">Your PIN Code</h3><p>Dear Customer,</p><div style="background:#4caf50;color:white;padding:15px;text-align:center;font-size:28px;font-weight:bold;border-radius:5px;margin:20px 0;">4567</div><p style="color:#666;">Please keep this code confidential.</p></td></tr></table>',
  datetime('now', '-12 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- ==================== 特殊格式测试 ====================

-- 测试14：纯HTML加粗突出（无明确关键词）
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-014', 'minimal@service.com', 'Account Verification', 
  'Please use the following code: 135790',
  '<div style="text-align:center;padding:50px;"><p>Please use the following code:</p><h1 style="color:#f44336;font-size:48px;margin:30px 0;">135790</h1></div>',
  datetime('now', '-13 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试15：混合中英文
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-015', 'global@app.com', 'Verification Code / 验证码', 
  'Your verification code / 您的验证码：MX90PN\n\nCode is valid for 10 minutes / 验证码10分钟内有效',
  '<div style="border:2px solid #673ab7;padding:20px;border-radius:8px;"><p><strong>Your verification code / 您的验证码：</strong></p><div style="background:#673ab7;color:white;padding:15px;text-align:center;font-size:24px;font-weight:bold;margin:10px 0;border-radius:4px;">MX90PN</div><p style="font-size:12px;color:#999;">Code is valid for 10 minutes / 验证码10分钟内有效</p></div>',
  datetime('now', '-14 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- ==================== 干扰项测试（应该不识别为验证码）====================

-- 测试16：日期干扰（不应识别为验证码）
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-016', 'calendar@app.com', '会议提醒', 
  '您的会议安排在 20241016 下午3点。\n\n会议编号：20241016\n\n请准时参加。',
  '<p>您的会议安排在 <strong>20241016</strong> 下午3点。</p><p>会议编号：20241016</p><p>请准时参加。</p>',
  datetime('now', '-15 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- 测试17：重复数字干扰（不应识别为验证码）
INSERT INTO messages (temp_email_id, message_id, sender, subject, body_text, body_html, received_at, is_read)
SELECT id, 'test-017', 'spam@test.com', '测试邮件', 
  '这是一封测试邮件。订单号：111111\n\n金额：999999元',
  '<p>这是一封测试邮件。订单号：<strong>111111</strong></p><p>金额：999999元</p>',
  datetime('now', '-16 minutes'), 0
FROM temp_emails WHERE email = 'test_verification@yourdomain.com';

-- ==================== 查询测试结果 ====================

-- 查看所有测试消息及其提取的验证码
SELECT 
  id,
  sender,
  substr(subject, 1, 30) as subject_preview,
  verification_code,
  CASE 
    WHEN verification_code IS NOT NULL THEN '✓ 成功提取'
    ELSE '✗ 未提取'
  END as extraction_status,
  datetime(received_at, 'localtime') as received_time
FROM messages 
WHERE temp_email_id IN (
  SELECT id FROM temp_emails WHERE email = 'test_verification@yourdomain.com'
)
ORDER BY received_at DESC;

-- 统计提取成功率
SELECT 
  COUNT(*) as total_messages,
  SUM(CASE WHEN verification_code IS NOT NULL THEN 1 ELSE 0 END) as extracted_count,
  ROUND(SUM(CASE WHEN verification_code IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) || '%' as success_rate
FROM messages 
WHERE temp_email_id IN (
  SELECT id FROM temp_emails WHERE email = 'test_verification@yourdomain.com'
);

-- 查看具体的验证码提取情况（详细版）
SELECT 
  substr(sender, 1, 20) as sender,
  CASE 
    WHEN message_id LIKE 'test-001' THEN '中文标准格式'
    WHEN message_id LIKE 'test-002' THEN '中文后置格式'
    WHEN message_id LIKE 'test-003' THEN '中文括号格式'
    WHEN message_id LIKE 'test-004' THEN '动态码'
    WHEN message_id LIKE 'test-005' THEN '激活码'
    WHEN message_id LIKE 'test-006' THEN '主题验证码'
    WHEN message_id LIKE 'test-007' THEN '短信验证码'
    WHEN message_id LIKE 'test-008' THEN '英文标准格式'
    WHEN message_id LIKE 'test-009' THEN 'OTP格式'
    WHEN message_id LIKE 'test-010' THEN 'Confirmation'
    WHEN message_id LIKE 'test-011' THEN 'Security Code'
    WHEN message_id LIKE 'test-012' THEN 'Use code to verify'
    WHEN message_id LIKE 'test-013' THEN 'PIN Code'
    WHEN message_id LIKE 'test-014' THEN 'HTML突出'
    WHEN message_id LIKE 'test-015' THEN '中英混合'
    WHEN message_id LIKE 'test-016' THEN '日期干扰'
    WHEN message_id LIKE 'test-017' THEN '重复数字干扰'
    ELSE '其他'
  END as test_case,
  verification_code as extracted_code,
  CASE 
    WHEN verification_code IS NOT NULL THEN '✓'
    ELSE '✗'
  END as status
FROM messages 
WHERE temp_email_id IN (
  SELECT id FROM temp_emails WHERE email = 'test_verification@yourdomain.com'
)
ORDER BY message_id;

