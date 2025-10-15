// Cloudflare Email Worker
// 这个 Worker 会在邮件到达时自动触发

import { extractCodeFromEmail } from './utils/codeExtractor'

export default {
  async email(message, env, ctx) {
    try {
      // 获取邮件信息
      const from = message.from
      const to = message.to
      const subject = message.headers.get('subject') || ''
      
      // 查找对应的临时邮箱
      const tempEmail = await env.DB.prepare(`
        SELECT id FROM temp_emails WHERE email = ? AND status = 'active'
      `).bind(to).first()

      if (!tempEmail) {
        console.log(`No active temp email found for: ${to}`)
        // 继续转发邮件
        await message.forward(env.TARGET_EMAIL || await getTargetEmail(env))
        return
      }

      // 读取邮件内容
      let bodyText = ''
      let bodyHtml = ''

      try {
        const reader = message.raw.getReader()
        const chunks = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
        
        const rawEmail = new TextDecoder().decode(
          new Uint8Array(chunks.flatMap(chunk => Array.from(chunk)))
        )

        // 简单解析（实际应使用邮件解析库）
        bodyText = extractTextFromRaw(rawEmail)
        bodyHtml = extractHtmlFromRaw(rawEmail)
      } catch (error) {
        console.error('Failed to read email body:', error)
      }

      // 提取验证码
      const verificationCode = extractCodeFromEmail(subject, bodyText || bodyHtml)

      // 保存到数据库
      const messageId = message.headers.get('message-id') || generateMessageId()
      
      await env.DB.prepare(`
        INSERT INTO messages (
          temp_email_id,
          message_id,
          sender,
          subject,
          body_text,
          body_html,
          verification_code,
          received_at,
          is_read
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).bind(
        tempEmail.id,
        messageId,
        from,
        subject,
        bodyText,
        bodyHtml,
        verificationCode,
        new Date().toISOString()
      ).run()

      // 更新邮箱的最后收信时间和邮件数量
      await env.DB.prepare(`
        UPDATE temp_emails 
        SET last_received_at = datetime('now'),
            message_count = message_count + 1
        WHERE id = ?
      `).bind(tempEmail.id).run()

      // 通过 WebSocket 推送通知（如果实现了）
      try {
        await notifyNewEmail(env, {
          temp_email: to,
          sender: from,
          subject,
          verification_code: verificationCode,
          received_at: new Date().toISOString()
        })
      } catch (error) {
        console.error('Failed to send WebSocket notification:', error)
      }

      // 转发邮件到目标邮箱
      const targetEmail = env.TARGET_EMAIL || await getTargetEmail(env)
      if (targetEmail) {
        await message.forward(targetEmail)
      }

    } catch (error) {
      console.error('Email worker error:', error)
      // 即使出错也要转发邮件
      try {
        const targetEmail = env.TARGET_EMAIL || await getTargetEmail(env)
        if (targetEmail) {
          await message.forward(targetEmail)
        }
      } catch (forwardError) {
        console.error('Failed to forward email:', forwardError)
      }
    }
  }
}

// 辅助函数：从原始邮件中提取文本
function extractTextFromRaw(raw) {
  // 简化版本，实际应使用专门的邮件解析库
  const textMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?=\n--|\nContent-Type:|\n$)/i)
  return textMatch ? textMatch[1].trim() : ''
}

// 辅助函数：从原始邮件中提取HTML
function extractHtmlFromRaw(raw) {
  const htmlMatch = raw.match(/Content-Type: text\/html[\s\S]*?\n\n([\s\S]*?)(?=\n--|\nContent-Type:|\n$)/i)
  return htmlMatch ? htmlMatch[1].trim() : ''
}

// 生成消息ID
function generateMessageId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2)}@tempemail`
}

// 获取目标邮箱
async function getTargetEmail(env) {
  try {
    const config = await env.DB.prepare(`
      SELECT config_value FROM config WHERE config_key = 'target_qq_email'
    `).first()
    return config?.config_value || null
  } catch (error) {
    return null
  }
}

// 发送 WebSocket 通知
async function notifyNewEmail(env, data) {
  // 如果使用 Durable Objects，可以在这里广播
  // 简化版本：存储到 KV，让前端轮询
  if (env.NOTIFICATIONS) {
    const key = `notification:${Date.now()}`
    await env.NOTIFICATIONS.put(key, JSON.stringify({
      type: 'new_email',
      data
    }), {
      expirationTtl: 3600 // 1小时后过期
    })
  }
}

