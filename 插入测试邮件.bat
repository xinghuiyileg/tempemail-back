@echo off
chcp 65001 >nul
echo ========================================
echo 📧 批量插入测试邮件
echo ========================================
echo.

echo 请输入邮箱 ID（查看临时邮箱列表中的 ID）:
set /p EMAIL_ID=邮箱ID: 

echo.
echo 请输入要插入的邮件数量:
set /p COUNT=邮件数量: 

echo.
echo [开始插入] 准备插入 %COUNT% 封测试邮件到邮箱 ID=%EMAIL_ID%
echo.

for /L %%i in (1,1,%COUNT%) do (
    echo [%%i/%COUNT%] 插入测试邮件 %%i...
    npx wrangler d1 execute tempemail --local --command "INSERT INTO messages (temp_email_id, sender, subject, body_text, received_at, created_at, is_read) VALUES (%EMAIL_ID%, 'test%%i@example.com', '测试邮件 %%i', '这是第 %%i 封测试邮件的内容', datetime('now', '-%%i minutes'), datetime('now'), 0)"
)

echo.
echo [更新邮件计数]
npx wrangler d1 execute tempemail --local --command "UPDATE temp_emails SET message_count = (SELECT COUNT(*) FROM messages WHERE temp_email_id = %EMAIL_ID%), last_received_at = datetime('now') WHERE id = %EMAIL_ID%"

echo.
echo ========================================
echo ✅ 成功插入 %COUNT% 封测试邮件！
echo ========================================
echo.
echo 📌 刷新前端页面查看分页效果
echo 📌 浏览器按 Ctrl+Shift+R 强制刷新
echo.
pause

