var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-h3ULUv/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/router.js
var Router = class {
  static {
    __name(this, "Router");
  }
  constructor() {
    this.routes = [];
  }
  use(prefix, handler) {
    this.routes.push({ prefix, handler });
  }
  async handle(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    for (const route of this.routes) {
      if (path.startsWith(route.prefix)) {
        const subPath = path.slice(route.prefix.length) || "/";
        const subRequest = new Request(
          new URL(subPath, request.url),
          request
        );
        return await route.handler(subRequest, env, ctx);
      }
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: "Not Found"
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

// src/utils/cors.js
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}
__name(jsonResponse, "jsonResponse");
function successResponse(data) {
  return jsonResponse({
    success: true,
    data
  });
}
__name(successResponse, "successResponse");
function errorResponse(message, status = 400) {
  return jsonResponse({
    success: false,
    error: message
  }, status);
}
__name(errorResponse, "errorResponse");

// src/services/cloudflare.js
var CloudflareEmailRouting = class {
  static {
    __name(this, "CloudflareEmailRouting");
  }
  constructor(apiToken, accountId, zoneId) {
    this.apiToken = apiToken;
    this.accountId = accountId;
    this.zoneId = zoneId;
    this.baseURL = "https://api.cloudflare.com/client/v4";
  }
  async createRule(emailAddress, targetEmail) {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        matchers: [{
          type: "literal",
          field: "to",
          value: emailAddress
        }],
        actions: [{
          type: "forward",
          value: [targetEmail]
        }],
        enabled: true,
        name: `TempEmail: ${emailAddress}`,
        priority: 0
      })
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Failed to create email rule");
    }
    return data.result;
  }
  async deleteRule(ruleId) {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules/${ruleId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${this.apiToken}`
      }
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Failed to delete email rule");
    }
    return data.result;
  }
  async listRules() {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.apiToken}`
      }
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Failed to list email rules");
    }
    return data.result;
  }
  async getRule(ruleId) {
    const url = `${this.baseURL}/zones/${this.zoneId}/email/routing/rules/${ruleId}`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${this.apiToken}`
      }
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message || "Failed to get email rule");
    }
    return data.result;
  }
};
function getCloudflareClient(env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) {
    throw new Error("Cloudflare credentials not configured");
  }
  return new CloudflareEmailRouting(apiToken, accountId, zoneId);
}
__name(getCloudflareClient, "getCloudflareClient");

// src/routes/email.js
function generateEmailWithPrefix(domain, prefix) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let base = (prefix && typeof prefix === "string" ? prefix.trim() : "") || "temp";
  base = base.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!base) base = "temp";
  let username = base + "_";
  for (let i = 0; i < 10; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${username}@${domain}`;
}
__name(generateEmailWithPrefix, "generateEmailWithPrefix");
async function emailRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === "/create" && method === "POST") {
    try {
      const domain = env.DOMAIN_NAME || "yourdomain.com";
      const targetEmail = env.TARGET_EMAIL || await getTargetEmail(env);
      if (!targetEmail) {
        return errorResponse("Target email not configured", 400);
      }
      let prefix = void 0;
      try {
        const body = await request.json().catch(() => null);
        if (body && body.prefix) prefix = body.prefix;
      } catch (_) {
      }
      const emailAddress = generateEmailWithPrefix(domain, prefix);
      let ruleId = null;
      try {
        const cfClient = getCloudflareClient(env);
        const rule = await cfClient.createRule(emailAddress, targetEmail);
        ruleId = rule.id;
      } catch (error) {
        console.error("Failed to create Cloudflare rule:", error);
      }
      const result = await env.DB.prepare(`
        INSERT INTO temp_emails (email, cloudflare_rule_id, target_email, status)
        VALUES (?, ?, ?, 'active')
      `).bind(emailAddress, ruleId, targetEmail).run();
      const emailId = result.meta.last_row_id;
      return successResponse({
        id: emailId,
        email: emailAddress,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        copied: true
      });
    } catch (error) {
      console.error("Create email error:", error);
      return errorResponse(error.message);
    }
  }
  if (path === "/list" && method === "GET") {
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
      `).all();
      return successResponse(result.results || []);
    } catch (error) {
      console.error("List emails error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/\d+$/) && method === "DELETE") {
    try {
      const id = parseInt(path.slice(1));
      const email = await env.DB.prepare(`
        SELECT * FROM temp_emails WHERE id = ?
      `).bind(id).first();
      if (!email) {
        return errorResponse("Email not found", 404);
      }
      if (email.cloudflare_rule_id) {
        try {
          const cfClient = getCloudflareClient(env);
          await cfClient.deleteRule(email.cloudflare_rule_id);
        } catch (error) {
          console.error("Failed to delete Cloudflare rule:", error);
        }
      }
      await env.DB.prepare(`
        DELETE FROM temp_emails WHERE id = ?
      `).bind(id).run();
      await env.DB.prepare(`
        DELETE FROM messages WHERE temp_email_id = ?
      `).bind(id).run();
      return successResponse({ deleted: true });
    } catch (error) {
      console.error("Delete email error:", error);
      return errorResponse(error.message);
    }
  }
  if (path === "/batch-delete" && method === "POST") {
    try {
      const body = await request.json();
      const ids = body.ids || [];
      if (!Array.isArray(ids) || ids.length === 0) {
        return errorResponse("Invalid ids parameter", 400);
      }
      let deletedCount = 0;
      for (const id of ids) {
        try {
          const email = await env.DB.prepare(`
            SELECT * FROM temp_emails WHERE id = ?
          `).bind(id).first();
          if (email) {
            if (email.cloudflare_rule_id) {
              try {
                const cfClient = getCloudflareClient(env);
                await cfClient.deleteRule(email.cloudflare_rule_id);
              } catch (error) {
                console.error("Failed to delete Cloudflare rule:", error);
              }
            }
            await env.DB.prepare(`
              DELETE FROM temp_emails WHERE id = ?
            `).bind(id).run();
            await env.DB.prepare(`
              DELETE FROM messages WHERE temp_email_id = ?
            `).bind(id).run();
            deletedCount++;
          }
        } catch (error) {
          console.error(`Failed to delete email ${id}:`, error);
        }
      }
      return successResponse({ deleted_count: deletedCount });
    } catch (error) {
      console.error("Batch delete error:", error);
      return errorResponse(error.message);
    }
  }
  return errorResponse("Not found", 404);
}
__name(emailRoutes, "emailRoutes");
async function getTargetEmail(env) {
  try {
    const config = await env.DB.prepare(`
      SELECT config_value FROM config WHERE config_key = 'target_qq_email'
    `).first();
    return config?.config_value || null;
  } catch (error) {
    console.error("Failed to get target email:", error);
    return null;
  }
}
__name(getTargetEmail, "getTargetEmail");

// src/routes/message.js
async function messageRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path.match(/^\/emails\/\d+\/messages$/) && method === "GET") {
    try {
      const emailId = parseInt(path.split("/")[2]);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = (page - 1) * limit;
      const countResult = await env.DB.prepare(`
        SELECT COUNT(*) as total FROM messages WHERE temp_email_id = ?
      `).bind(emailId).first();
      const total = countResult?.total || 0;
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
      `).bind(emailId, limit, offset).all();
      return successResponse({
        messages: result.results || [],
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error("List messages error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/\d+$/) && method === "GET") {
    try {
      const id = parseInt(path.slice(1));
      const message = await env.DB.prepare(`
        SELECT * FROM messages WHERE id = ?
      `).bind(id).first();
      if (!message) {
        return errorResponse("Message not found", 404);
      }
      return successResponse(message);
    } catch (error) {
      console.error("Get message error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/\d+\/read$/) && method === "PUT") {
    try {
      const id = parseInt(path.split("/")[1]);
      await env.DB.prepare(`
        UPDATE messages SET is_read = 1 WHERE id = ?
      `).bind(id).run();
      return successResponse({ updated: true });
    } catch (error) {
      console.error("Mark as read error:", error);
      return errorResponse(error.message);
    }
  }
  return errorResponse("Not found", 404);
}
__name(messageRoutes, "messageRoutes");

// src/routes/monitor.js
async function monitorRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === "/status" && method === "GET") {
    try {
      const statusConfig = await env.DB.prepare(`
        SELECT config_value FROM config WHERE config_key = 'monitor_status'
      `).first();
      const lastCheckConfig = await env.DB.prepare(`
        SELECT config_value FROM config WHERE config_key = 'last_check_time'
      `).first();
      const emailCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM temp_emails WHERE status = 'active'
      `).first();
      const messageCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM messages
      `).first();
      const codeCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM messages WHERE verification_code IS NOT NULL
      `).first();
      return successResponse({
        status: statusConfig?.config_value || "stopped",
        last_check_at: lastCheckConfig?.config_value || null,
        total_emails: emailCount?.count || 0,
        total_messages: messageCount?.count || 0,
        verification_codes_extracted: codeCount?.count || 0
      });
    } catch (error) {
      console.error("Get monitor status error:", error);
      return errorResponse(error.message);
    }
  }
  if (path === "/toggle" && method === "POST") {
    try {
      const body = await request.json();
      const action = body.action;
      if (!["start", "stop"].includes(action)) {
        return errorResponse('Invalid action. Must be "start" or "stop"', 400);
      }
      const newStatus = action === "start" ? "running" : "stopped";
      await env.DB.prepare(`
        INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
        VALUES ('monitor_status', ?, datetime('now'))
      `).bind(newStatus).run();
      if (action === "start") {
        await env.DB.prepare(`
          INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
          VALUES ('last_check_time', ?, datetime('now'))
        `).bind((/* @__PURE__ */ new Date()).toISOString()).run();
      }
      return successResponse({
        status: newStatus
      });
    } catch (error) {
      console.error("Toggle monitor error:", error);
      return errorResponse(error.message);
    }
  }
  return errorResponse("Not found", 404);
}
__name(monitorRoutes, "monitorRoutes");

// src/routes/config.js
async function configRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === "/" && method === "GET") {
    try {
      const configs = await env.DB.prepare(`
        SELECT config_key, config_value FROM config
      `).all();
      const configMap = {};
      for (const config of configs.results || []) {
        if (config.config_key.includes("password") || config.config_key.includes("token")) {
          configMap[config.config_key] = config.config_value ? "***" : "";
        } else if (config.config_key === "target_qq_email") {
          const email = config.config_value || "";
          const parts = email.split("@");
          if (parts.length === 2) {
            const username = parts[0];
            const masked = username.substring(0, 3) + "***";
            configMap[config.config_key] = masked + "@" + parts[1];
          } else {
            configMap[config.config_key] = email;
          }
        } else {
          configMap[config.config_key] = config.config_value;
        }
      }
      return successResponse(configMap);
    } catch (error) {
      console.error("Get config error:", error);
      return errorResponse(error.message);
    }
  }
  if (path === "/" && method === "PUT") {
    try {
      const body = await request.json();
      const allowedKeys = [
        "cloudflare_api_token",
        "cloudflare_account_id",
        "cloudflare_zone_id",
        "domain_name",
        "target_qq_email",
        "qq_imap_password",
        "monitor_interval",
        "auto_delete_days"
      ];
      for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.includes(key)) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
            VALUES (?, ?, datetime('now'))
          `).bind(key, value).run();
        }
      }
      return successResponse({ updated: true });
    } catch (error) {
      console.error("Update config error:", error);
      return errorResponse(error.message);
    }
  }
  return errorResponse("Not found", 404);
}
__name(configRoutes, "configRoutes");

// src/index.js
var src_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const router = new Router();
    router.use("/api/emails", emailRoutes);
    router.use("/api/messages", messageRoutes);
    router.use("/api/monitor", monitorRoutes);
    router.use("/api/config", configRoutes);
    if (request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket(request, env);
    }
    try {
      const response = await router.handle(request, env, ctx);
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error("Request error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || "Internal Server Error"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
  }
};
function handleWebSocket(request, env) {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify({
    type: "connected",
    message: "WebSocket connected"
  }));
  server.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("WebSocket message received:", data);
      if (data.type === "ping") {
        server.send(JSON.stringify({ type: "pong" }));
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  });
  server.addEventListener("close", () => {
    console.log("WebSocket closed");
  });
  return new Response(null, {
    status: 101,
    webSocket: client
  });
}
__name(handleWebSocket, "handleWebSocket");
var WebSocketDurableObject = class {
  static {
    __name(this, "WebSocketDurableObject");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }
  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.push(server);
    server.addEventListener("close", () => {
      this.sessions = this.sessions.filter((s) => s !== server);
    });
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
  // 广播消息给所有连接
  broadcast(message) {
    const data = JSON.stringify(message);
    this.sessions.forEach((session) => {
      try {
        session.send(data);
      } catch (error) {
        console.error("Broadcast error:", error);
      }
    });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-h3ULUv/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-h3ULUv/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  WebSocketDurableObject,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
