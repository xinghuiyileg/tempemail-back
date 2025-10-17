import { successResponse, errorResponse } from '../utils/cors'

export default async function monitorRoutes(request, env, ctx) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // GET /status - 获取监控状态
  if (path === '/status' && method === 'GET') {
    try {
      // 获取用户 ID（用户隔离）
      const userId = request.headers.get('X-User-ID')
      if (!userId) {
        return errorResponse('Missing user ID', 400)
      }

      // 获取监控状态配置
      const statusConfig = await env.DB.prepare(`
        SELECT config_value FROM config WHERE config_key = 'monitor_status'
      `).first()

      const lastCheckConfig = await env.DB.prepare(`
        SELECT config_value FROM config WHERE config_key = 'last_check_time'
      `).first()

      // 统计数据（仅统计当前用户的数据）
      const emailCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM temp_emails 
        WHERE user_id = ? AND status = 'active'
      `).bind(userId).first()

      const messageCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM messages m
        INNER JOIN temp_emails e ON m.temp_email_id = e.id
        WHERE e.user_id = ?
      `).bind(userId).first()

      const codeCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM messages m
        INNER JOIN temp_emails e ON m.temp_email_id = e.id
        WHERE e.user_id = ? AND m.verification_code IS NOT NULL
      `).bind(userId).first()

      return successResponse({
        status: statusConfig?.config_value || 'stopped',
        last_check_at: lastCheckConfig?.config_value || null,
        total_emails: emailCount?.count || 0,
        total_messages: messageCount?.count || 0,
        verification_codes_extracted: codeCount?.count || 0
      })
    } catch (error) {
      console.error('Get monitor status error:', error)
      return errorResponse(error.message)
    }
  }

  // POST /toggle - 启动/停止监控
  if (path === '/toggle' && method === 'POST') {
    try {
      const body = await request.json()
      const action = body.action // 'start' or 'stop'

      if (!['start', 'stop'].includes(action)) {
        return errorResponse('Invalid action. Must be "start" or "stop"', 400)
      }

      const newStatus = action === 'start' ? 'running' : 'stopped'

      // 更新配置
      await env.DB.prepare(`
        INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
        VALUES ('monitor_status', ?, datetime('now'))
      `).bind(newStatus).run()

      if (action === 'start') {
        // 更新最后检查时间
        await env.DB.prepare(`
          INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
          VALUES ('last_check_time', ?, datetime('now'))
        `).bind(new Date().toISOString()).run()
      }

      return successResponse({
        status: newStatus
      })
    } catch (error) {
      console.error('Toggle monitor error:', error)
      return errorResponse(error.message)
    }
  }

  return errorResponse('Not found', 404)
}

