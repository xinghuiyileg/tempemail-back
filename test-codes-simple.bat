@echo off
chcp 65001 >nul
echo ======================================
echo 验证码提取功能测试脚本
echo ======================================
echo.

cd /d "%~dp0"

echo [1/2] 执行测试数据插入...
npx wrangler d1 execute tempemail --local --file=test-verification-codes.sql

echo.
echo [2/2] 查看提取结果...
echo.
echo ====== 测试结果汇总 ======
npx wrangler d1 execute tempemail --local --command "SELECT substr(sender, 1, 20) as sender, CASE WHEN message_id LIKE 'test-001' THEN '中文标准' WHEN message_id LIKE 'test-002' THEN '中文后置' WHEN message_id LIKE 'test-003' THEN '中文括号' WHEN message_id LIKE 'test-004' THEN '动态码' WHEN message_id LIKE 'test-005' THEN '激活码' WHEN message_id LIKE 'test-006' THEN '主题验证码' WHEN message_id LIKE 'test-007' THEN '短信验证码' WHEN message_id LIKE 'test-008' THEN '英文标准' WHEN message_id LIKE 'test-009' THEN 'OTP' WHEN message_id LIKE 'test-010' THEN 'Confirmation' WHEN message_id LIKE 'test-011' THEN 'Security' WHEN message_id LIKE 'test-012' THEN 'Use to verify' WHEN message_id LIKE 'test-013' THEN 'PIN' WHEN message_id LIKE 'test-014' THEN 'HTML突出' WHEN message_id LIKE 'test-015' THEN '中英混合' WHEN message_id LIKE 'test-016' THEN '日期干扰' WHEN message_id LIKE 'test-017' THEN '重复干扰' END as 测试用例, verification_code as 提取验证码, CASE WHEN verification_code IS NOT NULL THEN '✓ 成功' ELSE '✗ 失败' END as 状态 FROM messages WHERE message_id LIKE 'test-%%' ORDER BY message_id;"

echo.
echo ====== 成功率统计 ======
npx wrangler d1 execute tempemail --local --command "SELECT COUNT(*) as 总数, SUM(CASE WHEN verification_code IS NOT NULL THEN 1 ELSE 0 END) as 成功数, ROUND(SUM(CASE WHEN verification_code IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) || '%%' as 成功率 FROM messages WHERE message_id LIKE 'test-%%';"

echo.
echo ======================================
echo 测试完成！
echo ======================================
pause

