// 验证码提取工具 - 增强版

const patterns = [
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
]

/**
 * 从文本中提取验证码（增强版）
 * @param {string} text - 邮件文本或HTML内容
 * @returns {string|null} - 提取的验证码或 null
 */
export function extractVerificationCode(text) {
  if (!text) return null

  // 保留原始文本用于 HTML 标签匹配
  const originalText = text
  // 移除HTML标签生成纯文本（但保留结构用于上下文理解）
  const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  // 候选验证码（带权重评分）
  const candidates = []

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i]
    
    // 对原始文本和纯文本都尝试匹配（HTML 标签模式用原始，其他用纯文本）
    const isHtmlPattern = pattern.source.includes('<')
    const targetText = isHtmlPattern ? originalText : plainText
    
    const match = targetText.match(pattern)
    if (match && match[1]) {
      const code = match[1].trim().toUpperCase()
      
      // 基础验证
      if (code.length < 4 || code.length > 8) continue
      
      // 排除明显不是验证码的（如日期、时间、常见词汇）
      if (isInvalidCode(code)) continue
      
      // 计算权重：索引越小（优先级越高）权重越大
      const priority = patterns.length - i
      candidates.push({ code, priority })
    }
  }

  // 返回权重最高的候选验证码
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority)
    return candidates[0].code
  }

  return null
}

/**
 * 判断是否为无效验证码（排除常见干扰）
 * @param {string} code
 * @returns {boolean}
 */
function isInvalidCode(code) {
  const upper = code.toUpperCase()
  
  // 排除纯字母的常见词（不太可能是验证码）
  const commonWords = ['BUTTON', 'SUBMIT', 'LOGIN', 'EMAIL', 'PHONE', 'CLICK', 'HERE', 'VERIFY', 'CODE', 'AMAZON', 'GOOGLE', 'PAYPAL', 'GITHUB', 'ACCOUNT', 'MICROSOFT', 'APPLE', 'FACEBOOK', 'TWITTER', 'ANYONE', 'SOMEONE', 'PLEASE']
  if (commonWords.includes(upper)) return true
  
  // 排除明显的日期格式（如 202410、20241016）
  if (/^20\d{4,6}$/.test(code)) return true
  
  // 排除明显的时间格式（如 120000、235959）
  if (/^[0-2]\d[0-5]\d[0-5]\d$/.test(code)) return true
  
  // 排除纯重复字符（如 111111、AAAAAA）
  if (/^(.)\1{3,}$/.test(code)) return true
  
  // 排除全0或全9
  if (/^0+$/.test(code) || /^9+$/.test(code)) return true
  
  return false
}

/**
 * 从邮件主题和正文中提取验证码（增强版）
 * @param {string} subject - 邮件主题
 * @param {string} body - 邮件正文
 * @returns {string|null}
 */
export function extractCodeFromEmail(subject, body) {
  // 优先从主题中查找（主题命中率通常更高且更准确）
  const codeFromSubject = extractVerificationCode(subject)
  if (codeFromSubject) {
    return codeFromSubject
  }

  // 再从正文中查找
  const codeFromBody = extractVerificationCode(body)
  if (codeFromBody) {
    return codeFromBody
  }

  // 最后尝试更宽松的匹配（仅当前两步都失败）
  // 针对部分邮件正文只有一个突出的数字串的情况
  return extractFallbackCode(body)
}

/**
 * 兜底验证码提取（极宽松，仅用于前面方法都失败时）
 * @param {string} text
 * @returns {string|null}
 */
function extractFallbackCode(text) {
  if (!text) return null
  
  const plainText = text.replace(/<[^>]+>/g, ' ')
  
  // 查找被空白或标点完全隔离的4-8位字母数字组合
  const isolated = plainText.match(/(?:^|[\s\r\n,.;!?(){}[\]"'"""''《》「」【】])\s*([A-Z0-9]{4,8})\s*(?:[\s\r\n,.;!?(){}[\]"'"""''《》「」【】]|$)/i)
  if (isolated && isolated[1]) {
    const code = isolated[1].trim().toUpperCase()
    if (!isInvalidCode(code)) {
      return code
    }
  }
  
  return null
}

/**
 * 验证码类型识别
 * @param {string} code
 * @returns {string} - 'numeric', 'alphanumeric', 'alpha'
 */
export function getCodeType(code) {
  if (/^\d+$/.test(code)) {
    return 'numeric'
  } else if (/^[A-Z]+$/i.test(code)) {
    return 'alpha'
  } else {
    return 'alphanumeric'
  }
}

