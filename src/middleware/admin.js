/**
 * 管理员权限中间件
 * 用于保护系统配置等敏感操作
 */

import { errorResponse } from '../utils/cors'

/**
 * 检查是否为管理员
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response|null} - 如果验证失败返回错误响应，成功返回 null
 */
export function requireAdmin(request, env) {
  const adminPassword = env.ADMIN_PASSWORD
  
  // 如果未设置管理员密码，拒绝访问（安全默认）
  if (!adminPassword) {
    return errorResponse('Admin access not configured. Please set ADMIN_PASSWORD.', 403)
  }
  
  // 获取 X-Admin-Password 请求头
  const adminAuth = request.headers.get('X-Admin-Password')
  
  if (!adminAuth) {
    return errorResponse('Admin authentication required', 401)
  }
  
  // 验证管理员密码
  if (adminAuth !== adminPassword) {
    console.warn('Invalid admin password attempt')
    return errorResponse('Invalid admin password', 403)
  }
  
  // 验证通过
  console.log('Admin authenticated successfully')
  return null
}

/**
 * 检查是否启用了管理员权限
 * @param {Object} env - 环境变量
 * @returns {boolean}
 */
export function isAdminEnabled(env) {
  return !!env.ADMIN_PASSWORD
}

/**
 * 检查当前请求是否具有管理员权限（不返回错误，只返回布尔值）
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {boolean}
 */
export function hasAdminAccess(request, env) {
  const adminPassword = env.ADMIN_PASSWORD
  if (!adminPassword) return false
  
  const adminAuth = request.headers.get('X-Admin-Password')
  return adminAuth === adminPassword
}

