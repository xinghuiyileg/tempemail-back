@echo off
chcp 65001 >nul
echo ======================================
echo 修复现有消息的验证码提取
echo ======================================
echo.

cd /d "%~dp0"

echo [步骤 1/2] 查看当前未提取验证码的消息数量...
npx wrangler d1 execute tempemail --local --command "SELECT COUNT(*) as total FROM messages WHERE verification_code IS NULL OR verification_code = '';"

echo.
echo [步骤 2/2] 显示这些消息的详情（前10条）...
npx wrangler d1 execute tempemail --local --command "SELECT id, substr(sender, 1, 25) as sender, substr(subject, 1, 40) as subject, verification_code FROM messages WHERE verification_code IS NULL OR verification_code = '' LIMIT 10;"

echo.
echo ======================================
echo 说明：
echo 1. SQL直接插入的测试数据不会自动提取验证码
echo 2. 验证码提取只在邮件实际到达时（email-worker.js）触发
echo 3. 要测试验证码提取，请：
echo    - 方法A：运行 node test-code-extraction.js （单元测试）
echo    - 方法B：发送真实邮件到临时地址
echo    - 方法C：使用下方命令手动更新（需要手动填写验证码）
echo.
echo 手动更新示例：
echo npx wrangler d1 execute tempemail --local --command "UPDATE messages SET verification_code='123456' WHERE id=6;"
echo ======================================
pause

