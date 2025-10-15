import { successResponse, errorResponse } from '../utils/cors'

export default async function messageRoutes(request, env, ctx) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // GET /emails/:id/messages - 获取邮件列表
  if (path.match(/^\/emails\/\d+\/messages$/) && method === 'GET') {
    try {
      const emailId = parseInt(path.split('/')[2])
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '20')
      const offset = (page - 1) * limit

      // 获取总数
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
      console.error('List messages error:', error)
      return errorResponse(error.message)
    }
  }

  // GET /:id - 获取邮件详情
  if (path.match(/^\/\d+$/) && method === 'GET') {
    try {
      const id = parseInt(path.slice(1))

      const message = await env.DB.prepare(`
        SELECT * FROM messages WHERE id = ?
      `).bind(id).first()

      if (!message) {
        return errorResponse('Message not found', 404)
      }

      return successResponse(message)
    } catch (error) {
      console.error('Get message error:', error)
      return errorResponse(error.message)
    }
  }

  // PUT /:id/read - 标记为已读
  if (path.match(/^\/\d+\/read$/) && method === 'PUT') {
    try {
      const id = parseInt(path.split('/')[1])

      await env.DB.prepare(`
        UPDATE messages SET is_read = 1 WHERE id = ?
      `).bind(id).run()

      return successResponse({ updated: true })
    } catch (error) {
      console.error('Mark as read error:', error)
      return errorResponse(error.message)
    }
  }

  // DELETE /:id - 删除单封邮件
  if (path.match(/^\/\d+$/) && method === 'DELETE') {
    try {
      const id = parseInt(path.slice(1))

      // 先查关联的临时邮箱 id，便于后续更新计数
      const msg = await env.DB.prepare(`
        SELECT temp_email_id FROM messages WHERE id = ?
      `).bind(id).first()

      await env.DB.prepare(`
        DELETE FROM messages WHERE id = ?
      `).bind(id).run()

      if (msg?.temp_email_id) {
        // 更新邮箱的 message_count（防止负数）
        await env.DB.prepare(`
          UPDATE temp_emails
          SET message_count = CASE WHEN message_count > 0 THEN message_count - 1 ELSE 0 END
          WHERE id = ?
        `).bind(msg.temp_email_id).run()
      }

      return successResponse({ deleted: true })
    } catch (error) {
      console.error('Delete message error:', error)
      return errorResponse(error.message)
    }
  }

  // DELETE /:id - 删除单封邮件
  if (path.match(/^\/\d+$/) && method === 'DELETE') {
    try {
      const id = parseInt(path.slice(1))
      await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run()
      return successResponse({ deleted: true })
    } catch (error) {
      console.error('Delete message error:', error)
      return errorResponse(error.message)
    }
  }

  // DELETE /emails/:emailId/messages - 清空某邮箱所有邮件
  if (path.match(/^\/emails\/\d+\/messages$/) && method === 'DELETE') {
    try {
      const emailId = parseInt(path.split('/')[2])
      await env.DB.prepare(`DELETE FROM messages WHERE temp_email_id = ?`).bind(emailId).run()
      // 同步更新计数
      await env.DB.prepare(`UPDATE temp_emails SET message_count = 0 WHERE id = ?`).bind(emailId).run()
      return successResponse({ cleared: true })
    } catch (error) {
      console.error('Clear messages error:', error)
      return errorResponse(error.message)
    }
  }

  return errorResponse('Not found', 404)
}

