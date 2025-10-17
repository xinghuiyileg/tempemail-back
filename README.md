# ⚡ 临时邮箱系统 - 后端开发文档

## 📋 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [核心功能](#核心功能)
- [数据库设计](#数据库设计)
- [API 路由](#api-路由)
- [Email Worker](#email-worker)
- [认证中间件](#认证中间件)
- [开发指南](#开发指南)
- [部署说明](#部署说明)

## 🛠️ 技术栈

### 核心平台
- **Cloudflare Workers** - 边缘计算平台
- **Cloudflare D1** - 分布式 SQLite 数据库
- **Cloudflare Email Routing** - 邮件转发服务
- **Cloudflare Email Workers** - 邮件处理

### 主要特性
- **Serverless** - 无服务器架构
- **Edge Computing** - 全球边缘节点部署
- **WebSocket** - 实时双向通信
- **Durable Objects** - 持久化对象存储

### 开发工具
- **Wrangler 4.43+** - Cloudflare 开发和部署工具
- **Node.js 18+** - 本地开发环境

## 📁 项目结构

```
workers/
├── src/
│   ├── routes/                  # API 路由
│   │   ├── email.js            # 临时邮箱 CRUD
│   │   ├── message.js          # 邮件消息管理
│   │   ├── monitor.js          # 监控状态
│   │   ├── config.js           # 系统配置
│   │   └── auth.js             # 认证接口
│   │
│   ├── middleware/              # 中间件
│   │   └── auth.js             # 认证中间件
│   │
│   ├── services/                # 业务服务
│   │   └── cloudflare.js       # Cloudflare API 集成
│   │
│   ├── utils/                   # 工具函数
│   │   ├── cors.js             # CORS 处理
│   │   └── codeExtractor.js    # 验证码提取
│   │
│   ├── index.js                 # Worker 主入口
│   ├── router.js                # 路由器实现
│   └── email-worker.js          # Email Worker 处理器
│
├── migrations/                  # 数据库迁移
│   └── 0001_init.sql
│
├── schema.sql                   # 数据库结构
├── wrangler.toml               # Cloudflare 配置
├── package.json                 # 项目配置
└── env.example                  # 环境变量示例
```

## ✨ 核心功能

### 1. 临时邮箱管理
- 自动生成临时邮箱地址
- 创建 Cloudflare Email Routing 规则
- 邮箱列表查询
- 邮箱删除（级联删除邮件）
- 邮箱统计信息

### 2. 邮件接收与处理
- Email Worker 自动触发
- 邮件内容解析（支持 multipart、base64、quoted-printable）
- 验证码自动提取（20+ 种格式）
- 邮件存储到 D1 数据库
- 自动转发到目标邮箱

### 3. 邮件管理
- 邮件列表查询（支持分页）
- 邮件详情查看
- 未读/已读状态管理
- 按邮箱筛选邮件

### 4. 监控状态
- 系统统计信息（邮箱数、邮件数、验证码数）
- 最后更新时间
- 监控状态管理

### 5. 系统配置
- Cloudflare API 配置
- 域名和邮箱配置
- 配置持久化

### 6. 访问控制
- 可选密码保护
- Bearer Token 认证
- 公开/私有路径管理
- Token 验证

### 7. WebSocket 实时推送
- 新邮件实时通知
- 双向通信
- 自动重连

## 🗄️ 数据库设计

### 数据库：Cloudflare D1 (SQLite)

#### 表 1: temp_emails（临时邮箱表）

```sql
CREATE TABLE temp_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,           -- 邮箱地址
    cloudflare_rule_id TEXT,              -- CF 规则 ID
    target_email TEXT NOT NULL,           -- 目标转发邮箱
    created_at TEXT DEFAULT (datetime('now')),
    last_received_at TEXT,                -- 最后收信时间
    message_count INTEGER DEFAULT 0,      -- 邮件数量
    status TEXT DEFAULT 'active'          -- 状态：active/inactive
);

-- 索引
CREATE INDEX idx_email ON temp_emails(email);
CREATE INDEX idx_status ON temp_emails(status);
CREATE INDEX idx_created ON temp_emails(created_at);
```

**字段说明**：
- `email`: 临时邮箱地址，唯一索引
- `cloudflare_rule_id`: Cloudflare Email Routing 规则 ID，用于删除
- `target_email`: 邮件转发的目标邮箱
- `message_count`: 该邮箱收到的邮件数量，便于统计
- `status`: 邮箱状态，active 表示活跃

#### 表 2: messages（邮件表）

```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temp_email_id INTEGER NOT NULL,       -- 关联临时邮箱
    message_id TEXT UNIQUE,               -- 邮件唯一 ID
    sender TEXT,                          -- 发件人
    subject TEXT,                         -- 主题
    body_text TEXT,                       -- 纯文本内容
    body_html TEXT,                       -- HTML 内容
    verification_code TEXT,               -- 提取的验证码
    received_at TEXT,                     -- 接收时间
    is_read INTEGER DEFAULT 0,            -- 已读状态：0/1
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (temp_email_id) REFERENCES temp_emails(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_temp_email ON messages(temp_email_id);
CREATE INDEX idx_message ON messages(message_id);
CREATE INDEX idx_received ON messages(received_at);
CREATE INDEX idx_is_read ON messages(is_read);
```

**字段说明**：
- `temp_email_id`: 外键，关联 temp_emails 表
- `message_id`: 邮件的唯一标识符（从邮件头获取）
- `verification_code`: 自动提取的验证码，NULL 表示未提取到
- `is_read`: 0=未读，1=已读
- **级联删除**: 删除临时邮箱时自动删除所有相关邮件

#### 表 3: config（系统配置表）

```sql
CREATE TABLE config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,      -- 配置键
    config_value TEXT,                    -- 配置值
    updated_at TEXT DEFAULT (datetime('now'))
);
```

**默认配置项**：
```sql
INSERT INTO config (config_key, config_value) VALUES
    ('cloudflare_api_token', ''),
    ('cloudflare_account_id', ''),
    ('cloudflare_zone_id', ''),
    ('domain_name', ''),
    ('target_qq_email', ''),
    ('monitor_interval', '10'),
    ('auto_delete_days', '7'),
    ('monitor_status', 'stopped');
```

## 🛣️ API 路由

### 基础路由

#### GET /
**健康检查和欢迎页**

响应：
```json
{
  "success": true,
  "name": "tempemail-api",
  "status": "ok",
  "endpoints": ["/api/emails", "/api/messages", "/api/monitor", "/api/config"],
  "health": "/health"
}
```

#### GET /health
**健康状态**

响应：
```json
{
  "success": true,
  "status": "ok"
}
```

### 认证路由 (auth.js)

#### GET /api/auth/check
**检查是否启用访问控制**

响应：
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "message": "访问控制已启用"
  }
}
```

#### POST /api/auth/login
**登录**

请求：
```json
{
  "password": "your_password"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "token": "your_password",
    "expiresIn": 86400,
    "message": "登录成功"
  }
}
```

#### POST /api/auth/verify
**验证令牌**

请求：
```json
{
  "token": "your_token"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "valid": true
  }
}
```

#### POST /api/auth/logout
**登出**

响应：
```json
{
  "success": true,
  "data": {
    "message": "登出成功"
  }
}
```

### 邮箱路由 (email.js)

#### GET /api/emails
**获取所有临时邮箱**

响应：
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "temp_abc123@domain.com",
      "created_at": "2025-10-17T10:00:00Z",
      "last_received_at": "2025-10-17T11:30:00Z",
      "message_count": 5,
      "status": "active"
    }
  ]
}
```

#### POST /api/emails
**创建新的临时邮箱**

响应：
```json
{
  "success": true,
  "data": {
    "id": 2,
    "email": "temp_xyz789@domain.com",
    "created_at": "2025-10-17T12:00:00Z"
  }
}
```

#### DELETE /api/emails/:id
**删除临时邮箱**

响应：
```json
{
  "success": true,
  "data": {
    "message": "邮箱已删除"
  }
}
```

#### GET /api/emails/:id/messages
**获取邮箱的邮件列表（支持分页）**

查询参数：
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20）

响应：
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": 1,
        "sender": "noreply@example.com",
        "subject": "验证码通知",
        "body_text": "您的验证码是：123456",
        "verification_code": "123456",
        "received_at": "2025-10-17T11:30:00Z",
        "is_read": 0
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 25,
      "total_pages": 2
    }
  }
}
```

### 邮件路由 (message.js)

#### GET /api/messages/:id
**获取邮件详情**

响应：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "sender": "noreply@example.com",
    "subject": "验证码通知",
    "body_text": "您的验证码是：123456",
    "body_html": "<p>您的验证码是：<strong>123456</strong></p>",
    "verification_code": "123456",
    "received_at": "2025-10-17T11:30:00Z",
    "is_read": 1
  }
}
```

#### PATCH /api/messages/:id/read
**标记邮件为已读**

响应：
```json
{
  "success": true,
  "data": {
    "message": "已标记为已读"
  }
}
```

### 监控路由 (monitor.js)

#### GET /api/monitor/status
**获取监控状态**

响应：
```json
{
  "success": true,
  "data": {
    "emailCount": 10,
    "messageCount": 45,
    "codeCount": 32,
    "lastUpdate": "2025-10-17T12:00:00Z"
  }
}
```

### 配置路由 (config.js)

#### GET /api/config
**获取系统配置**

响应：
```json
{
  "success": true,
  "data": {
    "cloudflare_api_token": "***",
    "domain_name": "example.com",
    "target_qq_email": "your@qq.com"
  }
}
```

#### POST /api/config
**更新系统配置**

请求：
```json
{
  "cloudflare_api_token": "new_token",
  "domain_name": "example.com"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "message": "配置已更新"
  }
}
```

## 📧 Email Worker

### 工作原理

Email Worker 是 Cloudflare 提供的特殊 Worker，当邮件到达时自动触发。

#### 触发流程

```
邮件发送到 temp_xxx@domain.com
  ↓
Cloudflare Email Routing 接收
  ↓
触发 Email Worker (email() 函数)
  ↓
解析邮件内容
  ↓
提取验证码
  ↓
保存到 D1 数据库
  ↓
发送 WebSocket 通知
  ↓
转发到目标邮箱
```

### Email Worker 实现 (email-worker.js)

#### 核心函数

```javascript
export default {
  async email(message, env, ctx) {
    // 1. 获取邮件基本信息
    const from = message.from
    const to = message.to
    const subject = message.headers.get('subject') || ''
    
    // 2. 查找对应的临时邮箱
    const tempEmail = await env.DB.prepare(`
      SELECT id FROM temp_emails 
      WHERE email = ? AND status = 'active'
    `).bind(to).first()
    
    if (!tempEmail) {
      // 未找到，直接转发
      await message.forward(env.TARGET_EMAIL)
      return
    }
    
    // 3. 解析邮件内容
    const { bodyText, bodyHtml } = await parseEmailBody(message)
    
    // 4. 提取验证码
    const verificationCode = extractCodeFromEmail(subject, bodyText || bodyHtml)
    
    // 5. 保存到数据库
    await saveMessage(env.DB, {
      tempEmailId: tempEmail.id,
      messageId: message.headers.get('message-id'),
      sender: from,
      subject,
      bodyText,
      bodyHtml,
      verificationCode
    })
    
    // 6. 更新邮箱统计
    await updateEmailStats(env.DB, tempEmail.id)
    
    // 7. WebSocket 通知（可选）
    await notifyNewEmail(env, { ... })
    
    // 8. 转发邮件
    await message.forward(env.TARGET_EMAIL)
  }
}
```

### 邮件解析

#### MIME 解析器

支持的编码：
- **multipart/alternative** - 多部分邮件（文本+HTML）
- **base64** - Base64 编码
- **quoted-printable** - Quoted-Printable 编码
- **字符集**: UTF-8, GBK, GB2312

```javascript
function parseMimeMessage(rawBytes) {
  // 1. 检测 Content-Type 和 boundary
  const contentType = extractContentType(raw)
  const boundary = extractBoundary(raw)
  
  // 2. 如果是 multipart，分割各部分
  if (boundary && /multipart\//.test(contentType)) {
    const parts = splitByBoundary(raw, boundary)
    return {
      text: findTextPart(parts),
      html: findHtmlPart(parts)
    }
  }
  
  // 3. 单体邮件直接解码
  return decodeSinglePart(raw, contentType)
}
```

#### 内容解码

```javascript
function decodeBody(body, encoding, charset) {
  let bytes
  
  if (encoding === 'base64') {
    // Base64 解码
    bytes = base64ToBytes(body)
  } else if (encoding === 'quoted-printable') {
    // Quoted-Printable 解码
    bytes = qpToBytes(body)
  } else {
    // 原样
    bytes = new TextEncoder().encode(body)
  }
  
  // 根据字符集解码
  return new TextDecoder(charset).decode(bytes)
}
```

## 🔐 验证码提取

### 提取算法 (codeExtractor.js)

#### 支持的格式（20+ 种）

**中文格式**：
- `验证码：123456`
- `【验证码】AB12CD`
- `动态码：XY9876`
- `激活码：QW45ER`
- `您的验证码是 567890`

**英文格式**：
- `verification code: 456789`
- `OTP is: AB34CD`
- `confirmation code: XY78ZW`
- `security code is 987654`
- `use GH56TY to verify`

**HTML 格式**：
- `<strong>135790</strong>`
- `<b>MX90PN</b>`

#### 提取策略

```javascript
export function extractCodeFromEmail(subject, body) {
  // 1. 优先从主题提取（准确率更高）
  const codeFromSubject = extractVerificationCode(subject)
  if (codeFromSubject) return codeFromSubject
  
  // 2. 从正文提取
  const codeFromBody = extractVerificationCode(body)
  if (codeFromBody) return codeFromBody
  
  // 3. 兜底：宽松匹配
  return extractFallbackCode(body)
}
```

#### 干扰过滤

自动排除：
- ❌ 日期（20241016）
- ❌ 时间（120000）
- ❌ 重复字符（111111）
- ❌ 常见词汇（AMAZON、GOOGLE、SUBMIT）

```javascript
function isInvalidCode(code) {
  // 排除日期
  if (/^20\d{4,6}$/.test(code)) return true
  
  // 排除重复字符
  if (/^(.)\1{3,}$/.test(code)) return true
  
  // 排除常见词
  const commonWords = ['BUTTON', 'SUBMIT', 'LOGIN', ...]
  if (commonWords.includes(code.toUpperCase())) return true
  
  return false
}
```

## 🔒 认证中间件

### 认证流程

```javascript
// middleware/auth.js

// 公开路径（无需认证）
const publicPaths = [
  '/',
  '/health',
  '/api',
  '/api/health',
  '/api/auth/check',
  '/api/auth/login',
  '/ws'
]

// 检查路径是否需要认证
export function requiresAuth(path) {
  return !publicPaths.some(p => path === p || path.startsWith(p + '/'))
}

// 认证中间件
export function requireAuth(request, env) {
  // 1. 检查是否启用访问控制
  const password = env.ACCESS_PASSWORD
  if (!password) {
    return null // 未启用，允许访问
  }
  
  // 2. 获取 Authorization header
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return unauthorized()
  }
  
  // 3. 验证 Bearer Token
  const token = authHeader.replace('Bearer ', '')
  if (token !== password) {
    return unauthorized()
  }
  
  // 4. 认证通过
  return null
}

function unauthorized() {
  return new Response(JSON.stringify({
    success: false,
    error: 'Unauthorized'
  }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="Temp Email System"'
    }
  })
}
```

### 使用方式

```javascript
// index.js

const url = new URL(request.url)
const path = url.pathname

// 检查是否需要认证
if (requiresAuth(path)) {
  const authError = requireAuth(request, env)
  if (authError) {
    return authError // 返回 401
  }
}

// 继续处理请求...
```

## 🌐 WebSocket

### 基础实现

```javascript
function handleWebSocket(request, env) {
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 })
  }
  
  // 创建 WebSocket 对
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)
  
  // 接受连接
  server.accept()
  
  // 发送欢迎消息
  server.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket connected'
  }))
  
  // 处理消息
  server.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    
    if (data.type === 'ping') {
      server.send(JSON.stringify({ type: 'pong' }))
    }
  })
  
  // 返回客户端
  return new Response(null, {
    status: 101,
    webSocket: client
  })
}
```

### Durable Objects（高级）

用于管理多个 WebSocket 连接：

```javascript
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
```

## 🚀 开发指南

### 环境配置

1. **安装 Wrangler**
   ```bash
   npm install -g wrangler@latest
   ```

2. **登录 Cloudflare**
   ```bash
   wrangler login
   ```

3. **安装依赖**
   ```bash
   cd workers
   npm install
   ```

4. **配置环境变量**
   
   创建 `.dev.vars` 文件：
   ```env
   CLOUDFLARE_API_TOKEN=your_api_token
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_ZONE_ID=your_zone_id
   DOMAIN_NAME=yourdomain.com
   TARGET_EMAIL=your@email.com
   ACCESS_PASSWORD=your_password  # 可选
   ```

5. **创建 D1 数据库**
   ```bash
   npx wrangler d1 create tempemail
   ```
   
   将输出的 `database_id` 填入 `wrangler.toml`：
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "tempemail"
   database_id = "your-database-id"
   ```

6. **初始化数据库**
   ```bash
   npx wrangler d1 execute tempemail --file=schema.sql --local
   ```

### 本地开发

```bash
# 启动开发服务器
npm run dev

# 访问
# API: http://localhost:8787
# WebSocket: ws://localhost:8787/ws
```

### 数据库操作

```bash
# 查看所有邮箱
npx wrangler d1 execute tempemail --local --command="SELECT * FROM temp_emails"

# 查看所有邮件
npx wrangler d1 execute tempemail --local --command="SELECT * FROM messages"

# 清空数据
npx wrangler d1 execute tempemail --local --command="DELETE FROM messages; DELETE FROM temp_emails;"
```

### 查看日志

```bash
# 实时查看日志
npx wrangler tail
```

### 调试技巧

1. **Console 日志**
   ```javascript
   console.log('Debug:', data)
   console.error('Error:', error)
   ```

2. **查看 D1 数据**
   ```bash
   npx wrangler d1 execute tempemail --local --command="SELECT * FROM messages LIMIT 10"
   ```

3. **测试 API**
   ```bash
   curl http://localhost:8787/api/emails
   ```

## 📦 部署说明

### 部署前准备

1. **设置生产环境变量**
   ```bash
   npx wrangler secret put CLOUDFLARE_API_TOKEN
   npx wrangler secret put ACCESS_PASSWORD
   ```

2. **创建生产数据库**
   ```bash
   npx wrangler d1 create tempemail-prod
   ```

3. **初始化生产数据库**
   ```bash
   npx wrangler d1 execute tempemail-prod --file=schema.sql
   ```

### 部署 Workers

```bash
# 部署主 API Worker
npm run deploy

# 或
npx wrangler deploy
```

部署成功后会显示 URL：
```
https://tempemail-api.your-subdomain.workers.dev
```

### 配置 Email Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 选择你的域名
3. 进入 **Email** → **Email Routing**
4. 点击 **Email Workers** 标签
5. 点击 **Add Route**
6. 选择刚部署的 Worker
7. 保存

### 配置域名路由（可选）

在 `wrangler.toml` 中添加：
```toml
[[routes]]
pattern = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```

然后重新部署：
```bash
npm run deploy
```

### 验证部署

```bash
# 测试 API
curl https://your-worker.workers.dev/health

# 测试邮箱创建
curl -X POST https://your-worker.workers.dev/api/emails \
  -H "Authorization: Bearer your_password"
```

## ⚡ 性能优化

### 1. 数据库索引

已创建的索引：
```sql
-- 邮箱索引
CREATE INDEX idx_email ON temp_emails(email);
CREATE INDEX idx_status ON temp_emails(status);

-- 邮件索引
CREATE INDEX idx_temp_email ON messages(temp_email_id);
CREATE INDEX idx_received ON messages(received_at);
CREATE INDEX idx_is_read ON messages(is_read);
```

### 2. 查询优化

使用 LIMIT 和 OFFSET：
```javascript
SELECT * FROM messages 
WHERE temp_email_id = ? 
ORDER BY received_at DESC 
LIMIT 20 OFFSET 0
```

### 3. 缓存策略

对于不常变化的配置，可使用缓存：
```javascript
let configCache = null
let cacheTime = 0

async function getConfig(env) {
  const now = Date.now()
  if (configCache && now - cacheTime < 60000) {
    return configCache
  }
  
  configCache = await loadConfig(env.DB)
  cacheTime = now
  return configCache
}
```

## 🐛 常见问题

### 1. 数据库查询失败

**问题**: `D1_ERROR: no such table`

**解决**:
```bash
# 重新初始化数据库
npx wrangler d1 execute tempemail --local --file=schema.sql
```

### 2. Email Worker 未触发

**问题**: 邮件无法接收

**解决**:
- 检查 Email Routing 是否已启用
- 确认 Email Worker 路由已配置
- 查看 Workers 日志：`npx wrangler tail`

### 3. CORS 错误

**问题**: 前端请求被阻止

**解决**: 检查 CORS 头设置
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
}
```

### 4. 认证失败

**问题**: 401 Unauthorized

**解决**:
- 检查 `ACCESS_PASSWORD` 环境变量
- 确认前端发送了正确的 Authorization header
- 验证 Token 格式：`Bearer your_password`

## 📚 参考资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Cloudflare Email Routing 文档](https://developers.cloudflare.com/email-routing/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Durable Objects 文档](https://developers.cloudflare.com/durable-objects/)

---

**版本**: 1.0.0  
**最后更新**: 2025-10-17  
**维护者**: TempEmail Team

