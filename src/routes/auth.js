/**
 * 认证相关 API 路由
 */

import { successResponse, errorResponse } from '../utils/cors.js'
import { generateToken, isAuthEnabled } from '../middleware/auth.js'

export default async function authRoutes(request, env, ctx) {
  const url = new URL(request.url)
  const path = url.pathname.replace('/api/auth', '')
  const method = request.method

  // GET /check - 检查是否启用了访问控制
  if (path === '/check' && method === 'GET') {
    return successResponse({
      enabled: isAuthEnabled(env),
      message: isAuthEnabled(env) ? '访问控制已启用' : '访问控制未启用'
    })
  }

  // POST /login - 登录获取令牌
  if (path === '/login' && method === 'POST') {
    try {
      const { password } = await request.json()

      if (!password) {
        return errorResponse('密码不能为空', 400)
      }

      // 验证密码并生成令牌
      const tokenData = generateToken(password, env)

      if (!tokenData) {
        return errorResponse('密码错误', 401)
      }

      return successResponse({
        token: tokenData.token,
        expiresIn: tokenData.expiresIn,
        message: '登录成功'
      })
    } catch (error) {
      console.error('Login error:', error)
      return errorResponse('登录失败', 500)
    }
  }

  // POST /verify - 验证令牌有效性
  if (path === '/verify' && method === 'POST') {
    try {
      const { token } = await request.json()

      if (!token) {
        return errorResponse('令牌不能为空', 400)
      }

      // 简单验证令牌
      const configPassword = env.ACCESS_PASSWORD
      const isValid = token === configPassword

      return successResponse({
        valid: isValid,
        message: isValid ? '令牌有效' : '令牌无效'
      })
    } catch (error) {
      console.error('Verify error:', error)
      return errorResponse('验证失败', 500)
    }
  }

  // POST /logout - 登出（客户端清除令牌）
  if (path === '/logout' && method === 'POST') {
    return successResponse({
      message: '登出成功'
    })
  }

  // POST /admin/verify - 验证管理员密码
  if (path === '/admin/verify' && method === 'POST') {
    try {
      const { password } = await request.json()

      if (!password) {
        return errorResponse('密码不能为空', 400)
      }

      // 获取环境变量中的管理员密码
      const adminPassword = env.ADMIN_PASSWORD

      if (!adminPassword) {
        return errorResponse('管理员功能未启用', 403)
      }

      // 验证密码
      if (password !== adminPassword) {
        console.warn('Invalid admin password attempt')
        return errorResponse('管理员密码错误', 401)
      }

      console.log('Admin password verified successfully')
      return successResponse({
        valid: true,
        message: '管理员身份验证成功'
      })
    } catch (error) {
      console.error('Admin verify error:', error)
      return errorResponse('验证失败', 500)
    }
  }

  return errorResponse('Not Found', 404)
}

