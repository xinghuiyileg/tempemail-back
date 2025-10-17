/**
 * 访问控制中间件
 * 提供简单的密码保护功能
 */

import { errorResponse } from '../utils/cors.js'

/**
 * 验证访问令牌
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {boolean} - 是否通过验证
 */
export function verifyAuth(request, env) {
  // 从配置获取访问密码
  const configPassword = env.ACCESS_PASSWORD
  
  // 如果未配置密码，则不需要认证
  if (!configPassword || configPassword === '') {
    return true
  }
  
  // 从请求头获取令牌
  const authHeader = request.headers.get('Authorization')
  
  if (!authHeader) {
    return false
  }
  
  // 支持 Bearer Token 格式
  const token = authHeader.replace(/^Bearer\s+/i, '')
  
  // 简单的密码比对
  return token === configPassword
}

/**
 * 检查认证并返回错误响应
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response|null} - 如果认证失败返回错误响应，否则返回 null
 */
export function requireAuth(request, env) {
  if (!verifyAuth(request, env)) {
    return errorResponse('Unauthorized', 401, {
      'WWW-Authenticate': 'Bearer realm="Temp Email System"'
    })
  }
  return null
}

/**
 * 生成访问令牌（用于登录）
 * @param {string} password - 用户输入的密码
 * @param {Object} env - 环境变量
 * @returns {Object} - 包含令牌和过期时间的对象
 */
export function generateToken(password, env) {
  const configPassword = env.ACCESS_PASSWORD
  
  if (!configPassword || password !== configPassword) {
    return null
  }
  
  // 简单实现：直接返回密码作为令牌
  // 生产环境建议使用 JWT 或其他加密令牌
  return {
    token: password,
    expiresIn: 86400 // 24小时（秒）
  }
}

/**
 * 验证是否需要认证
 * @param {Object} env - 环境变量
 * @returns {boolean} - 是否启用了访问控制
 */
export function isAuthEnabled(env) {
  return !!(env.ACCESS_PASSWORD && env.ACCESS_PASSWORD !== '')
}

/**
 * 获取公开路径列表（无需认证的路径）
 * @returns {Array<string>} - 公开路径数组
 */
export function getPublicPaths() {
  return [
    '/api/auth/check',
    '/api/auth/login',
    '/health',
    '/',
    '/ws' // WebSocket 连接需要单独验证
  ]
}

/**
 * 检查路径是否需要认证
 * @param {string} path - 请求路径
 * @returns {boolean} - 是否需要认证
 */
export function requiresAuth(path) {
  const publicPaths = getPublicPaths()
  return !publicPaths.some(publicPath => {
    if (publicPath === path) return true
    if (publicPath.endsWith('*')) {
      const prefix = publicPath.slice(0, -1)
      return path.startsWith(prefix)
    }
    return false
  })
}

