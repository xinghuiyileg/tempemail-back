import { successResponse, errorResponse } from '../utils/cors'

export default async function configRoutes(request, env, ctx) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // GET / - 获取配置
  if (path === '/' && method === 'GET') {
    try {
      const configs = await env.DB.prepare(`
        SELECT config_key, config_value FROM config
      `).all()

      const configMap = {}
      for (const config of configs.results || []) {
        // 隐藏敏感信息
        if (config.config_key.includes('password') || config.config_key.includes('token')) {
          configMap[config.config_key] = config.config_value ? '***' : ''
        } else if (config.config_key === 'target_qq_email') {
          // 部分隐藏邮箱
          const email = config.config_value || ''
          const parts = email.split('@')
          if (parts.length === 2) {
            const username = parts[0]
            const masked = username.substring(0, 3) + '***'
            configMap[config.config_key] = masked + '@' + parts[1]
          } else {
            configMap[config.config_key] = email
          }
        } else {
          configMap[config.config_key] = config.config_value
        }
      }

      return successResponse(configMap)
    } catch (error) {
      console.error('Get config error:', error)
      return errorResponse(error.message)
    }
  }

  // PUT / - 更新配置
  if (path === '/' && method === 'PUT') {
    try {
      const body = await request.json()

      // 允许更新的配置项
      const allowedKeys = [
        'cloudflare_api_token',
        'cloudflare_account_id',
        'cloudflare_zone_id',
        'domain_name',
        'target_qq_email',
        'qq_imap_password',
        'monitor_interval',
        'auto_delete_days'
      ]

      for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.includes(key)) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
            VALUES (?, ?, datetime('now'))
          `).bind(key, value).run()
        }
      }

      return successResponse({ updated: true })
    } catch (error) {
      console.error('Update config error:', error)
      return errorResponse(error.message)
    }
  }

  return errorResponse('Not found', 404)
}

