import { successResponse, errorResponse } from '../utils/cors'
import { requireAdmin, hasAdminAccess, isAdminEnabled } from '../middleware/admin'

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
      const isAdmin = hasAdminAccess(request, env) // 检查是否为管理员
      
      for (const config of configs.results || []) {
        const key = config.config_key
        let value = config.config_value
        
        // 非管理员访问时，敏感信息脱敏
        if (!isAdmin) {
          if (key.includes('password') || key.includes('token')) {
            value = value ? '***' : ''
          } else if (key.includes('account_id') || key.includes('zone_id')) {
            value = value ? value.substring(0, 8) + '***' : ''
          } else if (key === 'target_qq_email') {
            // 部分隐藏邮箱
            const email = value || ''
            const parts = email.split('@')
            if (parts.length === 2) {
              const username = parts[0]
              const masked = username.length > 3 ? username.substring(0, 3) + '***' : '***'
              value = masked + '@' + parts[1]
            }
          }
        }
        
        configMap[key] = value
      }

      return successResponse({
        config: configMap,
        isAdmin,
        adminEnabled: isAdminEnabled(env)
      })
    } catch (error) {
      console.error('Get config error:', error)
      return errorResponse(error.message)
    }
  }

  // PUT / - 更新配置（仅管理员）
  if (path === '/' && method === 'PUT') {
    // 验证管理员权限
    const adminError = requireAdmin(request, env)
    if (adminError) {
      return adminError
    }

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

      let updatedCount = 0
      for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.includes(key)) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
            VALUES (?, ?, datetime('now'))
          `).bind(key, value).run()
          updatedCount++
        }
      }

      console.log(`Admin updated ${updatedCount} config items`)
      return successResponse({ 
        updated: true,
        count: updatedCount
      })
    } catch (error) {
      console.error('Update config error:', error)
      return errorResponse(error.message)
    }
  }

  // POST / - 更新配置（兼容 POST 方法）
  if (path === '/' && method === 'POST') {
    // 验证管理员权限
    const adminError = requireAdmin(request, env)
    if (adminError) {
      return adminError
    }

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

      let updatedCount = 0
      for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.includes(key)) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
            VALUES (?, ?, datetime('now'))
          `).bind(key, value).run()
          updatedCount++
        }
      }

      console.log(`Admin updated ${updatedCount} config items`)
      return successResponse({ 
        updated: true,
        count: updatedCount
      })
    } catch (error) {
      console.error('Update config error:', error)
      return errorResponse(error.message)
    }
  }

  return errorResponse('Not found', 404)
}

