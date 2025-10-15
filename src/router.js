// 简单的路由器实现
export class Router {
  constructor() {
    this.routes = []
  }

  use(prefix, handler) {
    this.routes.push({ prefix, handler })
  }

  async handle(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    for (const route of this.routes) {
      if (path.startsWith(route.prefix)) {
        const subPath = path.slice(route.prefix.length) || '/'
        const subRequest = new Request(
          new URL(subPath, request.url),
          request
        )
        
        return await route.handler(subRequest, env, ctx)
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Not Found'
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

