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

        const rawBytes = new Uint8Array(chunks.reduce((acc, cur) => acc + cur.length, 0))
        {
          let offset = 0
          for (const chunk of chunks) {
            rawBytes.set(chunk, offset)
            offset += chunk.length
          }
        }

        // 优先按 MIME 解析（支持 multipart, base64, quoted-printable, charset）
        const parsed = parseMimeMessage(rawBytes)
        bodyText = parsed.text || ''
        bodyHtml = parsed.html || ''

        // 兜底：退回到简单正则
        if (!bodyText && !bodyHtml) {
          const rawEmail = new TextDecoder().decode(rawBytes)
          bodyText = extractTextFromRaw(rawEmail)
          bodyHtml = extractHtmlFromRaw(rawEmail)
        }
      } catch (error) {
        console.error('Failed to read email body:', error)
      }

      // 修复可能的乱码
      bodyText = fixGarbledText(bodyText)
      bodyHtml = fixGarbledText(bodyHtml)
      const fixedSubject = fixGarbledText(subject)

      // 提取验证码（使用修复后的内容）
      const verificationCode = extractCodeFromEmail(fixedSubject, bodyText || bodyHtml)

      // 保存到数据库（使用修复后的内容）
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
        fixedSubject,
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

// 轻量 MIME 解析器：尝试解析常见的 multipart/alternative、quoted-printable、base64 与 charset
function parseMimeMessage(rawBytes) {
  try {
    // 使用 latin1 解码邮件头部（避免中文乱码）
    const raw = new TextDecoder('latin1').decode(rawBytes)
    const contentTypeMatch = raw.match(/Content-Type:\s*([^;\r\n]+)(;[\s\S]*?)?\r?\n/i)
    const contentType = contentTypeMatch ? contentTypeMatch[1].toLowerCase() : ''
    const boundaryMatch = raw.match(/boundary=\"?([^\";\r\n]+)\"?/i)
    const boundary = boundaryMatch ? boundaryMatch[1] : null

    // 简单 body 提取（跳过 headers）
    const separator = /\r?\n\r?\n/
    const headerEndIndex = raw.search(separator)
    const bodyRaw = headerEndIndex >= 0 ? raw.slice(headerEndIndex + raw.match(separator)[0].length) : raw

    // multipart 处理
    if (boundary && /multipart\//.test(contentType)) {
      const parts = bodyRaw.split(new RegExp(`--${boundary}(?:--)?\r?\n`))
      let text = ''
      let html = ''
      for (const part of parts) {
        if (!part || part.trim() === '--') continue
        const partHeaderEnd = part.search(separator)
        if (partHeaderEnd < 0) continue
        const partHeaders = part.slice(0, partHeaderEnd)
        const partBody = part.slice(partHeaderEnd + part.match(separator)[0].length)
        const partTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i)
        const partType = partTypeMatch ? partTypeMatch[1].toLowerCase() : ''
        const encoding = (partHeaders.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || '').toLowerCase()
        const charset = (partHeaders.match(/charset=\"?([^\";\r\n]+)\"?/i)?.[1] || 'utf-8').toLowerCase()

        const decoded = decodeBody(partBody.trim(), encoding, charset)
        if (/text\/plain/.test(partType) && !text) text = decoded
        if (/text\/html/.test(partType) && !html) html = decoded
      }
      return { text, html }
    }

    // 单体 text/html 或 text/plain
    const encoding = (raw.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || '').toLowerCase()
    const charset = (raw.match(/charset=\"?([^\";\r\n]+)\"?/i)?.[1] || 'utf-8').toLowerCase()
    const decoded = decodeBody(bodyRaw.trim(), encoding, charset)
    if (/text\/html/.test(contentType)) return { text: '', html: decoded }
    if (/text\/plain/.test(contentType)) return { text: decoded, html: '' }

    // 未知类型，原样返回为 text
    return { text: decoded, html: '' }
  } catch (e) {
    return { text: '', html: '' }
  }
}

function decodeBody(body, encoding, charset) {
  try {
    let bytes
    
    if (encoding === 'base64') {
      // Base64 解码
      const clean = body.replace(/\s+/g, '')
      const bin = atob(clean)
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i)
      }
    } else if (encoding === 'quoted-printable') {
      // Quoted-Printable 解码
      // 先处理软换行
      let qp = body.replace(/=\r?\n/g, '')
      // 解码 =XX 格式
      const decoded = qp.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16))
      })
      // 转换为字节数组（使用 latin1 避免再次编码）
      bytes = new Uint8Array(decoded.length)
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i) & 0xFF
      }
    } else {
      // 8bit 或 7bit 编码，直接使用原始字节
      bytes = new Uint8Array(body.length)
      for (let i = 0; i < body.length; i++) {
        bytes[i] = body.charCodeAt(i) & 0xFF
      }
    }

    // 根据字符集解码
    const targetCharset = normalizeCharset(charset)
    
    // Cloudflare Workers 环境不支持 GBK，回退到 UTF-8
    try {
      const dec = new TextDecoder(targetCharset, { fatal: false })
      return dec.decode(bytes)
    } catch (e) {
      // 如果字符集不支持，尝试 UTF-8
      const dec = new TextDecoder('utf-8', { fatal: false })
      return dec.decode(bytes)
    }
  } catch (error) {
    console.error('Decode body error:', error)
    return body
  }
}

function normalizeCharset(cs) {
  const c = cs.toLowerCase()
  // 注意：Cloudflare Workers 可能不支持 GBK
  // 如果是 GBK，尝试 UTF-8（大多数现代邮件都是 UTF-8）
  if (c.includes('gb2312') || c.includes('gbk')) {
    console.warn('GBK charset detected, trying UTF-8 instead')
    return 'utf-8'
  }
  if (c.includes('utf-8') || c.includes('utf8')) return 'utf-8'
  if (c.includes('iso-8859-1') || c.includes('latin')) return 'latin1'
  return 'utf-8'
}

/**
 * 修复乱码文本（尝试重新解码）
 */
function fixGarbledText(text) {
  if (!text) return text
  
  try {
    // 检测是否为 UTF-8 乱码（常见模式：é®ç®±）
    if (/[ÃÂ©Â®Â][^a-zA-Z0-9\s]{2,}/.test(text)) {
      // 尝试重新编码为 latin1 字节，然后用 UTF-8 解码
      const bytes = new Uint8Array(text.length)
      for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i) & 0xFF
      }
      const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      
      // 检查修复后是否有中文字符
      if (/[\u4e00-\u9fa5]/.test(fixed)) {
        console.log('Fixed garbled text')
        return fixed
      }
    }
  } catch (e) {
    console.error('Fix garbled text error:', e)
  }
  
  return text
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

