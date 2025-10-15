import { Router } from './router'
import { corsHeaders } from './utils/cors'
import emailRoutes from './routes/email'
import messageRoutes from './routes/message'
import monitorRoutes from './routes/monitor'
import configRoutes from './routes/config'
import emailWorker from './email-worker'

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const router = new Router()

    // 注册路由
    router.use('/api/emails', emailRoutes)
    router.use('/api/messages', messageRoutes)
    router.use('/api/monitor', monitorRoutes)
    router.use('/api/config', configRoutes)

    // WebSocket 处理
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request, env)
    }

    try {
      const response = await router.handle(request, env, ctx)
      
      // 添加 CORS 头
      const headers = new Headers(response.headers)
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value)
      })

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch (error) {
      console.error('Request error:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Internal Server Error'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }
  },
  // Email event handler: forward to email-worker implementation
  async email(message, env, ctx) {
    return emailWorker.email(message, env, ctx)
  }
}

// WebSocket 处理
function handleWebSocket(request, env) {
  // 使用 Durable Objects 处理 WebSocket
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 })
  }

  // 这里简化处理，实际使用需要 Durable Objects
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)

  // 接受 WebSocket 连接
  server.accept()

  // 发送欢迎消息
  server.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connected'
  }))

  // 处理消息
  server.addEventListener('message', event => {
    try {
      const data = JSON.parse(event.data)
      console.log('WebSocket message received:', data)

      if (data.type === 'ping') {
        server.send(JSON.stringify({ type: 'pong' }))
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  })

  server.addEventListener('close', () => {
    console.log('WebSocket closed')
  })

  return new Response(null, {
    status: 101,
    webSocket: client
  })
}

// Durable Object for WebSocket (高级功能)
export class WebSocketDurableObject {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sessions = []
  }

  async fetch(request) {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    server.accept()
    this.sessions.push(server)

    server.addEventListener('close', () => {
      this.sessions = this.sessions.filter(s => s !== server)
    })

    return new Response(null, {
      status: 101,
      webSocket: client
    })
  }

  // 广播消息给所有连接
  broadcast(message) {
    const data = JSON.stringify(message)
    this.sessions.forEach(session => {
      try {
        session.send(data)
      } catch (error) {
        console.error('Broadcast error:', error)
      }
    })
  }
}

