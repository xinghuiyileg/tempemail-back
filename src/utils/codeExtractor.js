// 验证码提取工具

const patterns = [
  // 中文格式
  /验证码[：:]\s*([A-Za-z0-9]{4,8})/,
  /(\d{6})\s*为您的验证码/,
  /(\d{4,8})\s*是您的验证码/,
  /[【\[]验证码[】\]]\s*([A-Za-z0-9]{4,8})/,
  /验证码为\s*([A-Za-z0-9]{4,8})/,
  /动态码[：:]\s*([A-Za-z0-9]{4,8})/,
  /激活码[：:]\s*([A-Za-z0-9]{4,8})/,
  /验证码是\s*([A-Za-z0-9]{4,8})/,
  
  // 英文格式
  /code[：:]\s*([A-Za-z0-9]{4,8})/i,
  /Your verification code is[：:]?\s*([A-Za-z0-9]{4,8})/i,
  /verification code[：:]\s*([A-Za-z0-9]{4,8})/i,
  /confirm(?:ation)? code[：:]\s*([A-Za-z0-9]{4,8})/i,
  /OTP[：:]\s*([A-Za-z0-9]{4,8})/i,
  /PIN[：:]\s*([A-Za-z0-9]{4,8})/i,
  
  // 特殊格式
  /\b([A-Z0-9]{6})\b.*验证/,
  /验证.*\b([A-Z0-9]{6})\b/,
  /\bcode:\s*([A-Za-z0-9]{4,8})\b/i,
  
  // HTML 格式
  /<(?:strong|b|span)[^>]*>([A-Za-z0-9]{6})<\/(?:strong|b|span)>/i
]

/**
 * 从文本中提取验证码
 * @param {string} text - 邮件文本或HTML内容
 * @returns {string|null} - 提取的验证码或 null
 */
export function extractVerificationCode(text) {
  if (!text) return null

  // 移除HTML标签（简单处理）
  const plainText = text.replace(/<[^>]+>/g, ' ')

  for (const pattern of patterns) {
    const match = plainText.match(pattern)
    if (match && match[1]) {
      const code = match[1].trim()
      // 验证码长度合理性检查
      if (code.length >= 4 && code.length <= 8) {
        return code
      }
    }
  }

  return null
}

/**
 * 从邮件主题和正文中提取验证码
 * @param {string} subject - 邮件主题
 * @param {string} body - 邮件正文
 * @returns {string|null}
 */
export function extractCodeFromEmail(subject, body) {
  // 先从主题中查找
  const codeFromSubject = extractVerificationCode(subject)
  if (codeFromSubject) {
    return codeFromSubject
  }

  // 再从正文中查找
  return extractVerificationCode(body)
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

