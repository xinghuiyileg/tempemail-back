var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-SThcdZ/checked-fetch.js
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
        const subUrl = new URL(request.url);
        subUrl.pathname = subPath;
        const subRequest = new Request(subUrl.toString(), request);
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
function parseDomains(input) {
  if (!input) return [];
  return String(input).split(/[;,；,]/).map((s) => s.trim()).filter(Boolean);
}
__name(parseDomains, "parseDomains");
async function emailRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path === "/create" && method === "POST") {
    try {
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      let configuredDomains = await getConfiguredDomains(env);
      const targetEmail = env.TARGET_EMAIL || await getTargetEmail(env);
      if (!targetEmail) {
        return errorResponse("Target email not configured", 400);
      }
      let prefix;
      let domain;
      try {
        const body = await request.json().catch(() => null);
        if (body) {
          if (body.prefix) prefix = body.prefix;
          if (body.domain) domain = String(body.domain).trim();
        }
      } catch (_) {
      }
      if (domain && configuredDomains.includes(domain)) {
      } else {
        domain = configuredDomains[0];
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
        INSERT INTO temp_emails (user_id, email, cloudflare_rule_id, target_email, status)
        VALUES (?, ?, ?, ?, 'active')
      `).bind(userId, emailAddress, ruleId, targetEmail).run();
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
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "5");
      const offset = (page - 1) * limit;
      const countResult = await env.DB.prepare(`
        SELECT COUNT(*) as total FROM temp_emails 
        WHERE user_id = ? AND status = 'active'
      `).bind(userId).first();
      const total = countResult?.total || 0;
      const result = await env.DB.prepare(`
        SELECT 
          id, 
          email, 
          created_at, 
          last_received_at,
          message_count,
          status
        FROM temp_emails
        WHERE user_id = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all();
      return successResponse({
        emails: result.results || [],
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error("List emails error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/\d+\/messages$/) && method === "GET") {
    try {
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const emailId = parseInt(path.split("/")[1]);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "4");
      const offset = (page - 1) * limit;
      console.log("[email.js] GET /:id/messages - userId:", userId, "emailId:", emailId, "page:", page);
      const email = await env.DB.prepare(`
        SELECT id FROM temp_emails WHERE id = ? AND user_id = ?
      `).bind(emailId, userId).first();
      if (!email) {
        return errorResponse("Email not found or access denied", 404);
      }
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
      console.log("[email.js] Returning page:", page, "results:", result.results?.length);
      return successResponse({
        messages: result.results || [],
        pagination: {
          page,
          // 明确返回请求的页码
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error("List messages by email error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/\d+$/) && method === "DELETE") {
    try {
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const id = parseInt(path.slice(1));
      const email = await env.DB.prepare(`
        SELECT * FROM temp_emails WHERE id = ? AND user_id = ?
      `).bind(id, userId).first();
      if (!email) {
        return errorResponse("Email not found or access denied", 404);
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
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const body = await request.json();
      const ids = body.ids || [];
      if (!Array.isArray(ids) || ids.length === 0) {
        return errorResponse("Invalid ids parameter", 400);
      }
      let deletedCount = 0;
      for (const id of ids) {
        try {
          const email = await env.DB.prepare(`
            SELECT * FROM temp_emails WHERE id = ? AND user_id = ?
          `).bind(id, userId).first();
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
async function getConfiguredDomains(env) {
  try {
    const row = await env.DB.prepare(`
      SELECT config_value FROM config WHERE config_key = 'domain_name'
    `).first();
    const fromDb = row?.config_value;
    let list = parseDomains(fromDb || env.DOMAIN_NAME || "yourdomain.com");
    if (list.length === 0) list = ["yourdomain.com"];
    return list;
  } catch (e) {
    let list = parseDomains(env.DOMAIN_NAME || "yourdomain.com");
    if (list.length === 0) list = ["yourdomain.com"];
    return list;
  }
}
__name(getConfiguredDomains, "getConfiguredDomains");

// src/routes/message.js
async function messageRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (path.match(/^\/emails\/\d+\/messages$/) && method === "GET") {
    try {
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const emailId = parseInt(path.split("/")[2]);
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "4");
      const offset = (page - 1) * limit;
      const email = await env.DB.prepare(`
        SELECT id FROM temp_emails WHERE id = ? AND user_id = ?
      `).bind(emailId, userId).first();
      if (!email) {
        return errorResponse("Email not found or access denied", 404);
      }
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
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const id = parseInt(path.slice(1));
      const message = await env.DB.prepare(`
        SELECT m.* 
        FROM messages m
        INNER JOIN temp_emails e ON m.temp_email_id = e.id
        WHERE m.id = ? AND e.user_id = ?
      `).bind(id, userId).first();
      if (!message) {
        return errorResponse("Message not found or access denied", 404);
      }
      return successResponse(message);
    } catch (error) {
      console.error("Get message error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/\d+\/read$/) && method === "PUT") {
    try {
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const id = parseInt(path.split("/")[1]);
      const message = await env.DB.prepare(`
        SELECT m.id
        FROM messages m
        INNER JOIN temp_emails e ON m.temp_email_id = e.id
        WHERE m.id = ? AND e.user_id = ?
      `).bind(id, userId).first();
      if (!message) {
        return errorResponse("Message not found or access denied", 404);
      }
      await env.DB.prepare(`
        UPDATE messages SET is_read = 1 WHERE id = ?
      `).bind(id).run();
      return successResponse({ updated: true });
    } catch (error) {
      console.error("Mark as read error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/\d+$/) && method === "DELETE") {
    try {
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const id = parseInt(path.slice(1));
      const msg = await env.DB.prepare(`
        SELECT m.temp_email_id
        FROM messages m
        INNER JOIN temp_emails e ON m.temp_email_id = e.id
        WHERE m.id = ? AND e.user_id = ?
      `).bind(id, userId).first();
      if (!msg) {
        return errorResponse("Message not found or access denied", 404);
      }
      await env.DB.prepare(`
        DELETE FROM messages WHERE id = ?
      `).bind(id).run();
      if (msg.temp_email_id) {
        await env.DB.prepare(`
          UPDATE temp_emails
          SET message_count = CASE WHEN message_count > 0 THEN message_count - 1 ELSE 0 END
          WHERE id = ?
        `).bind(msg.temp_email_id).run();
      }
      return successResponse({ deleted: true });
    } catch (error) {
      console.error("Delete message error:", error);
      return errorResponse(error.message);
    }
  }
  if (path.match(/^\/emails\/\d+\/messages$/) && method === "DELETE") {
    try {
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const emailId = parseInt(path.split("/")[2]);
      const email = await env.DB.prepare(`
        SELECT id FROM temp_emails WHERE id = ? AND user_id = ?
      `).bind(emailId, userId).first();
      if (!email) {
        return errorResponse("Email not found or access denied", 404);
      }
      await env.DB.prepare(`DELETE FROM messages WHERE temp_email_id = ?`).bind(emailId).run();
      await env.DB.prepare(`UPDATE temp_emails SET message_count = 0 WHERE id = ?`).bind(emailId).run();
      return successResponse({ cleared: true });
    } catch (error) {
      console.error("Clear messages error:", error);
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
      const userId = request.headers.get("X-User-ID");
      if (!userId) {
        return errorResponse("Missing user ID", 400);
      }
      const statusConfig = await env.DB.prepare(`
        SELECT config_value FROM config WHERE config_key = 'monitor_status'
      `).first();
      const lastCheckConfig = await env.DB.prepare(`
        SELECT config_value FROM config WHERE config_key = 'last_check_time'
      `).first();
      const emailCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM temp_emails 
        WHERE user_id = ? AND status = 'active'
      `).bind(userId).first();
      const messageCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM messages m
        INNER JOIN temp_emails e ON m.temp_email_id = e.id
        WHERE e.user_id = ?
      `).bind(userId).first();
      const codeCount = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM messages m
        INNER JOIN temp_emails e ON m.temp_email_id = e.id
        WHERE e.user_id = ? AND m.verification_code IS NOT NULL
      `).bind(userId).first();
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

// src/middleware/admin.js
function requireAdmin(request, env) {
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return errorResponse("Admin access not configured. Please set ADMIN_PASSWORD.", 403);
  }
  const adminAuth = request.headers.get("X-Admin-Password");
  if (!adminAuth) {
    return errorResponse("Admin authentication required", 401);
  }
  if (adminAuth !== adminPassword) {
    console.warn("Invalid admin password attempt");
    return errorResponse("Invalid admin password", 403);
  }
  console.log("Admin authenticated successfully");
  return null;
}
__name(requireAdmin, "requireAdmin");
function isAdminEnabled(env) {
  return !!env.ADMIN_PASSWORD;
}
__name(isAdminEnabled, "isAdminEnabled");
function hasAdminAccess(request, env) {
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const adminAuth = request.headers.get("X-Admin-Password");
  return adminAuth === adminPassword;
}
__name(hasAdminAccess, "hasAdminAccess");

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
      const isAdmin = hasAdminAccess(request, env);
      for (const config of configs.results || []) {
        const key = config.config_key;
        let value = config.config_value;
        if (!isAdmin) {
          if (key.includes("password") || key.includes("token")) {
            value = value ? "***" : "";
          } else if (key.includes("account_id") || key.includes("zone_id")) {
            value = value ? value.substring(0, 8) + "***" : "";
          } else if (key === "target_qq_email") {
            const email = value || "";
            const parts = email.split("@");
            if (parts.length === 2) {
              const username = parts[0];
              const masked = username.length > 3 ? username.substring(0, 3) + "***" : "***";
              value = masked + "@" + parts[1];
            }
          }
        }
        configMap[key] = value;
      }
      return successResponse({
        config: configMap,
        isAdmin,
        adminEnabled: isAdminEnabled(env)
      });
    } catch (error) {
      console.error("Get config error:", error);
      return errorResponse(error.message);
    }
  }
  if (path === "/" && method === "PUT") {
    const adminError = requireAdmin(request, env);
    if (adminError) {
      return adminError;
    }
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
      let updatedCount = 0;
      for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.includes(key)) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
            VALUES (?, ?, datetime('now'))
          `).bind(key, value).run();
          updatedCount++;
        }
      }
      console.log(`Admin updated ${updatedCount} config items`);
      return successResponse({
        updated: true,
        count: updatedCount
      });
    } catch (error) {
      console.error("Update config error:", error);
      return errorResponse(error.message);
    }
  }
  if (path === "/" && method === "POST") {
    const adminError = requireAdmin(request, env);
    if (adminError) {
      return adminError;
    }
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
      let updatedCount = 0;
      for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.includes(key)) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO config (config_key, config_value, updated_at)
            VALUES (?, ?, datetime('now'))
          `).bind(key, value).run();
          updatedCount++;
        }
      }
      console.log(`Admin updated ${updatedCount} config items`);
      return successResponse({
        updated: true,
        count: updatedCount
      });
    } catch (error) {
      console.error("Update config error:", error);
      return errorResponse(error.message);
    }
  }
  return errorResponse("Not found", 404);
}
__name(configRoutes, "configRoutes");

// src/middleware/auth.js
function verifyAuth(request, env) {
  const configPassword = env.ACCESS_PASSWORD;
  if (!configPassword || configPassword === "") {
    return true;
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return false;
  }
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return token === configPassword;
}
__name(verifyAuth, "verifyAuth");
function requireAuth(request, env) {
  if (!verifyAuth(request, env)) {
    return errorResponse("Unauthorized", 401, {
      "WWW-Authenticate": 'Bearer realm="Temp Email System"'
    });
  }
  return null;
}
__name(requireAuth, "requireAuth");
function generateToken(password, env) {
  const configPassword = env.ACCESS_PASSWORD;
  if (!configPassword || password !== configPassword) {
    return null;
  }
  return {
    token: password,
    expiresIn: 86400
    // 24小时（秒）
  };
}
__name(generateToken, "generateToken");
function isAuthEnabled(env) {
  return !!(env.ACCESS_PASSWORD && env.ACCESS_PASSWORD !== "");
}
__name(isAuthEnabled, "isAuthEnabled");
function getPublicPaths() {
  return [
    "/api/auth/check",
    "/api/auth/login",
    "/health",
    "/",
    "/ws"
    // WebSocket 连接需要单独验证
  ];
}
__name(getPublicPaths, "getPublicPaths");
function requiresAuth(path) {
  const publicPaths = getPublicPaths();
  return !publicPaths.some((publicPath) => {
    if (publicPath === path) return true;
    if (publicPath.endsWith("*")) {
      const prefix = publicPath.slice(0, -1);
      return path.startsWith(prefix);
    }
    return false;
  });
}
__name(requiresAuth, "requiresAuth");

// src/routes/auth.js
async function authRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api/auth", "");
  const method = request.method;
  if (path === "/check" && method === "GET") {
    return successResponse({
      enabled: isAuthEnabled(env),
      message: isAuthEnabled(env) ? "\u8BBF\u95EE\u63A7\u5236\u5DF2\u542F\u7528" : "\u8BBF\u95EE\u63A7\u5236\u672A\u542F\u7528"
    });
  }
  if (path === "/login" && method === "POST") {
    try {
      const { password } = await request.json();
      if (!password) {
        return errorResponse("\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A", 400);
      }
      const tokenData = generateToken(password, env);
      if (!tokenData) {
        return errorResponse("\u5BC6\u7801\u9519\u8BEF", 401);
      }
      return successResponse({
        token: tokenData.token,
        expiresIn: tokenData.expiresIn,
        message: "\u767B\u5F55\u6210\u529F"
      });
    } catch (error) {
      console.error("Login error:", error);
      return errorResponse("\u767B\u5F55\u5931\u8D25", 500);
    }
  }
  if (path === "/verify" && method === "POST") {
    try {
      const { token } = await request.json();
      if (!token) {
        return errorResponse("\u4EE4\u724C\u4E0D\u80FD\u4E3A\u7A7A", 400);
      }
      const configPassword = env.ACCESS_PASSWORD;
      const isValid = token === configPassword;
      return successResponse({
        valid: isValid,
        message: isValid ? "\u4EE4\u724C\u6709\u6548" : "\u4EE4\u724C\u65E0\u6548"
      });
    } catch (error) {
      console.error("Verify error:", error);
      return errorResponse("\u9A8C\u8BC1\u5931\u8D25", 500);
    }
  }
  if (path === "/logout" && method === "POST") {
    return successResponse({
      message: "\u767B\u51FA\u6210\u529F"
    });
  }
  return errorResponse("Not Found", 404);
}
__name(authRoutes, "authRoutes");

// src/utils/codeExtractor.js
var patterns = [
  // === 高优先级：明确标识的验证码（带关键词+分隔符）===
  // 中文 - 严格格式（冒号/空格/多换行后紧跟验证码）
  /验证码[：:\s]*[是为]{0,1}\s*[：:]?[\s\r\n]*([A-Za-z0-9]{4,8})\b/i,
  /[【\[\(]验证码[】\]\)][：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /动态码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /激活码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /校验码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /短信验证码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /动态密码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /身份验证码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  // 中文 - 后置格式
  /\b([A-Za-z0-9]{4,8})\s*[是为]\s*您的验证码/i,
  /\b([A-Za-z0-9]{4,8})\s*为您的(?:动态)?验证码/i,
  /您的验证码[是为：:\s\r\n]*([A-Za-z0-9]{4,8})\b/i,
  /本次验证码[是为：:\s\r\n]*([A-Za-z0-9]{4,8})\b/i,
  // 英文 - 严格格式（加强匹配，避免提取到公司名等）
  /verification\s+code[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  /confirm(?:ation)?\s+code[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  /security\s+code[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  /auth(?:entication)?\s+code[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  /(?:your|the)\s+code[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  /OTP[：:\s]*(?:code)?[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  /PIN[：:\s]*(?:code)?[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  /one[- ]time\s+(?:pass)?(?:word|code)[：:\s]*(?:is)?[：:\s]*\r?\n?\s*([A-Za-z0-9]{4,8})(?:\s|$|\r|\n)/i,
  // === 中优先级：常见句式 ===
  // "code is XXXX" / "Code: XXXX"
  /\bcode\s+(?:is|was)[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /\bcode[：:]\s*([A-Za-z0-9]{4,8})\b/i,
  // "use XXXX to verify"
  /use\s+(?:code\s+)?([A-Za-z0-9]{4,8})\s+to\s+(?:verify|confirm|authenticate)/i,
  /enter\s+(?:code\s+)?([A-Za-z0-9]{4,8})\s+to\s+(?:verify|confirm|proceed)/i,
  // "以下是您的验证码"
  /以下是?您的验证码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /请输入验证码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /请使用验证码[：:\s]*([A-Za-z0-9]{4,8})\b/i,
  // === 低优先级：宽松匹配（可能误判，放最后）===
  // HTML 标签内的突出显示（常见于邮件模板）
  /<(?:strong|b|span|td|div|h[1-6])[^>]*>\s*([A-Za-z0-9]{4,8})\s*<\/(?:strong|b|span|td|div|h[1-6])>/i,
  // 纯数字6位（常见格式，但需排除日期/时间/金额等干扰）
  /(?:^|[^\d.])(\d{6})(?:[^\d.]|$)/,
  // 字母数字混合（需附近有验证相关词汇）
  /(?:验证|code|verify|confirm).{0,30}\b([A-Z0-9]{5,8})\b/i,
  /\b([A-Z0-9]{5,8})\b.{0,30}(?:验证|code|verify|confirm)/i
];
function extractVerificationCode(text) {
  if (!text) return null;
  const originalText = text;
  const plainText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const candidates = [];
  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const isHtmlPattern = pattern.source.includes("<");
    const targetText = isHtmlPattern ? originalText : plainText;
    const match = targetText.match(pattern);
    if (match && match[1]) {
      const code = match[1].trim().toUpperCase();
      if (code.length < 4 || code.length > 8) continue;
      if (isInvalidCode(code)) continue;
      const priority = patterns.length - i;
      candidates.push({ code, priority });
    }
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].code;
  }
  return null;
}
__name(extractVerificationCode, "extractVerificationCode");
function isInvalidCode(code) {
  const upper = code.toUpperCase();
  const commonWords = ["BUTTON", "SUBMIT", "LOGIN", "EMAIL", "PHONE", "CLICK", "HERE", "VERIFY", "CODE", "AMAZON", "GOOGLE", "PAYPAL", "GITHUB", "ACCOUNT", "MICROSOFT", "APPLE", "FACEBOOK", "TWITTER", "ANYONE", "SOMEONE", "PLEASE"];
  if (commonWords.includes(upper)) return true;
  if (/^20\d{4,6}$/.test(code)) return true;
  if (/^[0-2]\d[0-5]\d[0-5]\d$/.test(code)) return true;
  if (/^(.)\1{3,}$/.test(code)) return true;
  if (/^0+$/.test(code) || /^9+$/.test(code)) return true;
  return false;
}
__name(isInvalidCode, "isInvalidCode");
function extractCodeFromEmail(subject, body) {
  const codeFromSubject = extractVerificationCode(subject);
  if (codeFromSubject) {
    return codeFromSubject;
  }
  const codeFromBody = extractVerificationCode(body);
  if (codeFromBody) {
    return codeFromBody;
  }
  return extractFallbackCode(body);
}
__name(extractCodeFromEmail, "extractCodeFromEmail");
function extractFallbackCode(text) {
  if (!text) return null;
  const plainText = text.replace(/<[^>]+>/g, " ");
  const isolated = plainText.match(/(?:^|[\s\r\n,.;!?(){}[\]"'"""''《》「」【】])\s*([A-Z0-9]{4,8})\s*(?:[\s\r\n,.;!?(){}[\]"'"""''《》「」【】]|$)/i);
  if (isolated && isolated[1]) {
    const code = isolated[1].trim().toUpperCase();
    if (!isInvalidCode(code)) {
      return code;
    }
  }
  return null;
}
__name(extractFallbackCode, "extractFallbackCode");

// src/email-worker.js
var email_worker_default = {
  async email(message, env, ctx) {
    try {
      const from = message.from;
      const to = message.to;
      const subject = message.headers.get("subject") || "";
      const tempEmail = await env.DB.prepare(`
        SELECT id FROM temp_emails WHERE email = ? AND status = 'active'
      `).bind(to).first();
      if (!tempEmail) {
        console.log(`No active temp email found for: ${to}`);
        await message.forward(env.TARGET_EMAIL || await getTargetEmail2(env));
        return;
      }
      let bodyText = "";
      let bodyHtml = "";
      try {
        const reader = message.raw.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const rawBytes = new Uint8Array(chunks.reduce((acc, cur) => acc + cur.length, 0));
        {
          let offset = 0;
          for (const chunk of chunks) {
            rawBytes.set(chunk, offset);
            offset += chunk.length;
          }
        }
        const parsed = parseMimeMessage(rawBytes);
        bodyText = parsed.text || "";
        bodyHtml = parsed.html || "";
        if (!bodyText && !bodyHtml) {
          const rawEmail = new TextDecoder().decode(rawBytes);
          bodyText = extractTextFromRaw(rawEmail);
          bodyHtml = extractHtmlFromRaw(rawEmail);
        }
      } catch (error) {
        console.error("Failed to read email body:", error);
      }
      const verificationCode = extractCodeFromEmail(subject, bodyText || bodyHtml);
      const messageId = message.headers.get("message-id") || generateMessageId();
      await env.DB.prepare(`
        INSERT INTO messages (
          temp_email_id,
          message_id,
          sender,
          subject,
          body_text,
          body_html,
          verification_code,
          received_at,
          is_read
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).bind(
        tempEmail.id,
        messageId,
        from,
        subject,
        bodyText,
        bodyHtml,
        verificationCode,
        (/* @__PURE__ */ new Date()).toISOString()
      ).run();
      await env.DB.prepare(`
        UPDATE temp_emails 
        SET last_received_at = datetime('now'),
            message_count = message_count + 1
        WHERE id = ?
      `).bind(tempEmail.id).run();
      try {
        await notifyNewEmail(env, {
          temp_email: to,
          sender: from,
          subject,
          verification_code: verificationCode,
          received_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (error) {
        console.error("Failed to send WebSocket notification:", error);
      }
      const targetEmail = env.TARGET_EMAIL || await getTargetEmail2(env);
      if (targetEmail) {
        await message.forward(targetEmail);
      }
    } catch (error) {
      console.error("Email worker error:", error);
      try {
        const targetEmail = env.TARGET_EMAIL || await getTargetEmail2(env);
        if (targetEmail) {
          await message.forward(targetEmail);
        }
      } catch (forwardError) {
        console.error("Failed to forward email:", forwardError);
      }
    }
  }
};
function parseMimeMessage(rawBytes) {
  try {
    const raw = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(rawBytes);
    const contentTypeMatch = raw.match(/Content-Type:\s*([^;\r\n]+)(;[\s\S]*?)?\r?\n/i);
    const contentType = contentTypeMatch ? contentTypeMatch[1].toLowerCase() : "";
    const boundaryMatch = raw.match(/boundary=\"?([^\";\r\n]+)\"?/i);
    const boundary = boundaryMatch ? boundaryMatch[1] : null;
    const separator = /\r?\n\r?\n/;
    const headerEndIndex = raw.search(separator);
    const bodyRaw = headerEndIndex >= 0 ? raw.slice(headerEndIndex + raw.match(separator)[0].length) : raw;
    if (boundary && /multipart\//.test(contentType)) {
      const parts = bodyRaw.split(new RegExp(`--${boundary}(?:--)?\r?
`));
      let text = "";
      let html = "";
      for (const part of parts) {
        if (!part || part.trim() === "--") continue;
        const partHeaderEnd = part.search(separator);
        if (partHeaderEnd < 0) continue;
        const partHeaders = part.slice(0, partHeaderEnd);
        const partBody = part.slice(partHeaderEnd + part.match(separator)[0].length);
        const partTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
        const partType = partTypeMatch ? partTypeMatch[1].toLowerCase() : "";
        const encoding2 = (partHeaders.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || "").toLowerCase();
        const charset2 = (partHeaders.match(/charset=\"?([^\";\r\n]+)\"?/i)?.[1] || "utf-8").toLowerCase();
        const decoded2 = decodeBody(partBody.trim(), encoding2, charset2);
        if (/text\/plain/.test(partType) && !text) text = decoded2;
        if (/text\/html/.test(partType) && !html) html = decoded2;
      }
      return { text, html };
    }
    const encoding = (raw.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || "").toLowerCase();
    const charset = (raw.match(/charset=\"?([^\";\r\n]+)\"?/i)?.[1] || "utf-8").toLowerCase();
    const decoded = decodeBody(bodyRaw.trim(), encoding, charset);
    if (/text\/html/.test(contentType)) return { text: "", html: decoded };
    if (/text\/plain/.test(contentType)) return { text: decoded, html: "" };
    return { text: decoded, html: "" };
  } catch (e) {
    return { text: "", html: "" };
  }
}
__name(parseMimeMessage, "parseMimeMessage");
function decodeBody(body, encoding, charset) {
  try {
    let bytes;
    if (encoding === "base64") {
      const clean = body.replace(/\s+/g, "");
      const bin = atob(clean);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else if (encoding === "quoted-printable") {
      const qp = body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      bytes = new TextEncoder().encode(qp);
    } else {
      bytes = new TextEncoder().encode(body);
    }
    const dec = new TextDecoder(normalizeCharset(charset), { fatal: false });
    return dec.decode(bytes);
  } catch (_) {
    return body;
  }
}
__name(decodeBody, "decodeBody");
function normalizeCharset(cs) {
  const c = cs.toLowerCase();
  if (c.includes("gb2312") || c.includes("gbk")) return "gbk";
  if (c.includes("utf-8") || c.includes("utf8")) return "utf-8";
  return "utf-8";
}
__name(normalizeCharset, "normalizeCharset");
function extractTextFromRaw(raw) {
  const textMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\n\n([\s\S]*?)(?=\n--|\nContent-Type:|\n$)/i);
  return textMatch ? textMatch[1].trim() : "";
}
__name(extractTextFromRaw, "extractTextFromRaw");
function extractHtmlFromRaw(raw) {
  const htmlMatch = raw.match(/Content-Type: text\/html[\s\S]*?\n\n([\s\S]*?)(?=\n--|\nContent-Type:|\n$)/i);
  return htmlMatch ? htmlMatch[1].trim() : "";
}
__name(extractHtmlFromRaw, "extractHtmlFromRaw");
function generateMessageId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2)}@tempemail`;
}
__name(generateMessageId, "generateMessageId");
async function getTargetEmail2(env) {
  try {
    const config = await env.DB.prepare(`
      SELECT config_value FROM config WHERE config_key = 'target_qq_email'
    `).first();
    return config?.config_value || null;
  } catch (error) {
    return null;
  }
}
__name(getTargetEmail2, "getTargetEmail");
async function notifyNewEmail(env, data) {
  if (env.NOTIFICATIONS) {
    const key = `notification:${Date.now()}`;
    await env.NOTIFICATIONS.put(key, JSON.stringify({
      type: "new_email",
      data
    }), {
      expirationTtl: 3600
      // 1小时后过期
    });
  }
}
__name(notifyNewEmail, "notifyNewEmail");

// src/index.js
var src_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      const url2 = new URL(request.url);
      const path2 = url2.pathname;
      if (request.method === "GET" && (path2 === "/" || path2 === "/api")) {
        const body = JSON.stringify({
          success: true,
          name: "tempemail-api",
          status: "ok",
          endpoints: ["/api/emails", "/api/messages", "/api/monitor", "/api/config"],
          health: "/health"
        });
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      if (request.method === "GET" && (path2 === "/health" || path2 === "/api/health")) {
        return new Response(JSON.stringify({ success: true, status: "ok" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    } catch (_) {
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (requiresAuth(path)) {
      const authError = requireAuth(request, env);
      if (authError) {
        return authError;
      }
    }
    const router = new Router();
    router.use("/api/auth", authRoutes);
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
  },
  // Email event handler: forward to email-worker implementation
  async email(message, env, ctx) {
    return email_worker_default.email(message, env, ctx);
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

// .wrangler/tmp/bundle-SThcdZ/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-SThcdZ/middleware-loader.entry.ts
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
