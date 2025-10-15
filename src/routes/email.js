import { successResponse, errorResponse } from '../utils/cors'
import { getCloudflareClient } from '../services/cloudflare'

// 生成邮箱地址（支持自定义前缀）
function generateEmailWithPrefix(domain, prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let base = (prefix && typeof prefix === 'string' ? prefix.trim() : '') || 'temp'
  // 清理非法字符，只保留字母数字和下划线
  base = base.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!base) base = 'temp'

  let username = base + '_'
  for (let i = 0; i < 10; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${username}@${domain}`
}

// 解析域名列表
function parseDomains(input) {
  if (!input) return []
  return String(input)
    .split(/[;,；,]/)
    .map(s => s.trim())
    .filter(Boolean)
}

export default async function emailRoutes(request, env, ctx) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // POST /create - 创建临时邮箱（可带 prefix 和 domain）
  if (path === '/create' && method === 'POST') {
    try {
      let configuredDomains = parseDomains(env.DOMAIN_NAME || 'yourdomain.com')
      if (configuredDomains.length === 0) configuredDomains = ['yourdomain.com']

      const targetEmail = env.TARGET_EMAIL || await getTargetEmail(env)
      if (!targetEmail) {
        return errorResponse('Target email not configured', 400)
      }

      let prefix
      let domain
      try {
        const body = await request.json().catch(() => null)
        if (body) {
          if (body.prefix) prefix = body.prefix
          if (body.domain) domain = String(body.domain).trim()
        }
      } catch (_) {}

      // 选择域名
      if (domain && configuredDomains.includes(domain)) {
        // use as is
      } else {
        domain = configuredDomains[0]
      }

      // 生成邮箱地址
      const emailAddress = generateEmailWithPrefix(domain, prefix)

      // 创建 Cloudflare Email Routing 规则
      let ruleId = null
      try {
        const cfClient = getCloudflareClient(env)
        const rule = await cfClient.createRule(emailAddress, targetEmail)
        ruleId = rule.id
      } catch (error) {
        console.error('Failed to create Cloudflare rule:', error)
        // 继续执行，将 rule_id 设为 null
      }

      // 保存到数据库
      const result = await env.DB.prepare(`
        INSERT INTO temp_emails (email, cloudflare_rule_id, target_email, status)
        VALUES (?, ?, ?, 'active')
      `).bind(emailAddress, ruleId, targetEmail).run()

      const emailId = result.meta.last_row_id

      return successResponse({
        id: emailId,
        email: emailAddress,
        created_at: new Date().toISOString(),
        copied: true
      })
    } catch (error) {
      console.error('Create email error:', error)
      return errorResponse(error.message)
    }
  }

  // GET /list - 获取邮箱列表
  if (path === '/list' && method === 'GET') {
    try {
      const result = await env.DB.prepare(`
        SELECT 
          id, 
          email, 
          created_at, 
          last_received_at,
          message_count,
          status
        FROM temp_emails
        WHERE status = 'active'
        ORDER BY created_at DESC
      `).all()

      return successResponse(result.results || [])
    } catch (error) {
      console.error('List emails error:', error)
      return errorResponse(error.message)
    }
  }

  // GET /:id/messages - 获取某个邮箱的邮件列表（与前端 /api/emails/:id/messages 对应）
  if (path.match(/^\/\d+\/messages$/) && method === 'GET') {
    try {
      const emailId = parseInt(path.split('/')[1])
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '20')
      const offset = (page - 1) * limit

      // 统计总数
      const countResult = await env.DB.prepare(`
        SELECT COUNT(*) as total FROM messages WHERE temp_email_id = ?
      `).bind(emailId).first()

      const total = countResult?.total || 0

      // 获取邮件列表
      const result = await env.DB.prepare(`
        SELECT 
          id,
          sender,
          subject,
          body_text,
          verification_code,
          received_at,
          is_read,
          created_at
        FROM messages
        WHERE temp_email_id = ?
        ORDER BY received_at DESC
        LIMIT ? OFFSET ?
      `).bind(emailId, limit, offset).all()

      return successResponse({
        messages: result.results || [],
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      })
    } catch (error) {
      console.error('List messages by email error:', error)
      return errorResponse(error.message)
    }
  }

  // DELETE /:id - 删除邮箱
  if (path.match(/^\/\d+$/) && method === 'DELETE') {
    try {
      const id = parseInt(path.slice(1))

      // 获取邮箱信息
      const email = await env.DB.prepare(`
        SELECT * FROM temp_emails WHERE id = ?
      `).bind(id).first()

      if (!email) {
        return errorResponse('Email not found', 404)
      }

      // 删除 Cloudflare 规则
      if (email.cloudflare_rule_id) {
        try {
          const cfClient = getCloudflareClient(env)
          await cfClient.deleteRule(email.cloudflare_rule_id)
        } catch (error) {
          console.error('Failed to delete Cloudflare rule:', error)
        }
      }

      // 删除数据库记录
      await env.DB.prepare(`
        DELETE FROM temp_emails WHERE id = ?
      `).bind(id).run()

      // 删除相关邮件
      await env.DB.prepare(`
        DELETE FROM messages WHERE temp_email_id = ?
      `).bind(id).run()

      return successResponse({ deleted: true })
    } catch (error) {
      console.error('Delete email error:', error)
      return errorResponse(error.message)
    }
  }

  // POST /batch-delete - 批量删除
  if (path === '/batch-delete' && method === 'POST') {
    try {
      const body = await request.json()
      const ids = body.ids || []

      if (!Array.isArray(ids) || ids.length === 0) {
        return errorResponse('Invalid ids parameter', 400)
      }

      let deletedCount = 0

      for (const id of ids) {
        try {
          // 获取邮箱信息
          const email = await env.DB.prepare(`
            SELECT * FROM temp_emails WHERE id = ?
          `).bind(id).first()

          if (email) {
            // 删除 Cloudflare 规则
            if (email.cloudflare_rule_id) {
              try {
                const cfClient = getCloudflareClient(env)
                await cfClient.deleteRule(email.cloudflare_rule_id)
              } catch (error) {
                console.error('Failed to delete Cloudflare rule:', error)
              }
            }

            // 删除数据库记录
            await env.DB.prepare(`
              DELETE FROM temp_emails WHERE id = ?
            `).bind(id).run()

            await env.DB.prepare(`
              DELETE FROM messages WHERE temp_email_id = ?
            `).bind(id).run()

            deletedCount++
          }
        } catch (error) {
          console.error(`Failed to delete email ${id}:`, error)
        }
      }

      return successResponse({ deleted_count: deletedCount })
    } catch (error) {
      console.error('Batch delete error:', error)
      return errorResponse(error.message)
    }
  }

  return errorResponse('Not found', 404)
}

// 从配置中获取目标邮箱
async function getTargetEmail(env) {
  try {
    const config = await env.DB.prepare(`
      SELECT config_value FROM config WHERE config_key = 'target_qq_email'
    `).first()
    
    return config?.config_value || null
  } catch (error) {
    console.error('Failed to get target email:', error)
    return null
  }
}

