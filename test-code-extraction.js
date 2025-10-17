// 验证码提取功能测试脚本
// 直接测试 codeExtractor.js 的功能

// 内联验证码提取逻辑（从 codeExtractor.js 复制）
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
  /您的验证码[是为：:\s]*([A-Za-z0-9]{4,8})\b/i,
  /本次验证码[是为：:\s]*([A-Za-z0-9]{4,8})\b/i,
  
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

function isInvalidCode(code) {
  const upper = code.toUpperCase();
  
  const commonWords = ['BUTTON', 'SUBMIT', 'LOGIN', 'EMAIL', 'PHONE', 'CLICK', 'HERE', 'VERIFY', 'CODE', 'AMAZON', 'GOOGLE', 'PAYPAL', 'GITHUB', 'ACCOUNT', 'MICROSOFT', 'APPLE', 'FACEBOOK', 'TWITTER', 'ANYONE', 'SOMEONE', 'PLEASE'];
  if (commonWords.includes(upper)) return true;
  
  if (/^20\d{4,6}$/.test(code)) return true;
  if (/^[0-2]\d[0-5]\d[0-5]\d$/.test(code)) return true;
  if (/^(.)\1{3,}$/.test(code)) return true;
  if (/^0+$/.test(code) || /^9+$/.test(code)) return true;
  
  return false;
}

function extractVerificationCode(text) {
  if (!text) return null;

  const originalText = text;
  const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const candidates = [];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    
    const isHtmlPattern = pattern.source.includes('<');
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

function extractFallbackCode(text) {
  if (!text) return null;
  
  const plainText = text.replace(/<[^>]+>/g, ' ');
  
  const isolated = plainText.match(/(?:^|[\s\r\n,.;!?(){}[\]"'"""''《》「」【】])\s*([A-Z0-9]{4,8})\s*(?:[\s\r\n,.;!?(){}[\]"'"""''《》「」【】]|$)/i);
  if (isolated && isolated[1]) {
    const code = isolated[1].trim().toUpperCase();
    if (!isInvalidCode(code)) {
      return code;
    }
  }
  
  return null;
}

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

const testCases = [
  // ========== 中文格式 ==========
  {
    name: '中文标准格式',
    subject: '【重要】您的验证码',
    body: '尊敬的用户，您好！\n\n您的验证码：123456\n\n验证码5分钟内有效，请勿泄露给他人。',
    expected: '123456'
  },
  {
    name: '中文后置格式',
    subject: '支付宝验证码',
    body: '亲爱的用户：\n\n您正在进行重要操作，验证码 789012 为您的动态验证码，请在5分钟内完成验证。',
    expected: '789012'
  },
  {
    name: '中文括号格式',
    subject: '淘宝账户安全验证',
    body: '【验证码】AB12CD\n\n请使用上述验证码完成身份验证，验证码有效期为10分钟。',
    expected: 'AB12CD'
  },
  {
    name: '动态码',
    subject: '工商银行动态密码',
    body: '尊敬的客户：\n\n您的动态码：XY9876\n\n此动态码用于完成转账操作，请妥善保管。',
    expected: 'XY9876'
  },
  {
    name: '激活码',
    subject: '账号激活邮件',
    body: '欢迎注册我们的平台！\n\n激活码：QW45ER\n\n请在24小时内使用此激活码完成账号激活。',
    expected: 'QW45ER'
  },
  {
    name: '主题中的验证码',
    subject: '您的验证码：567890',
    body: '请使用邮件主题中的验证码完成验证。',
    expected: '567890'
  },
  {
    name: '短信验证码',
    subject: '短信验证码通知',
    body: '【平台名称】您的短信验证码 321654 ，5分钟内有效。请勿泄露给他人。',
    expected: '321654'
  },

  // ========== 英文格式 ==========
  {
    name: '英文标准格式',
    subject: 'Google Account Verification',
    body: 'Hello,\n\nYour verification code is: 456789\n\nThis code will expire in 10 minutes.',
    expected: '456789'
  },
  {
    name: 'OTP格式',
    subject: 'Amazon OTP Code',
    body: 'Your Amazon One-Time Password (OTP) is: AB34CD\n\nDo not share this code with anyone.',
    expected: 'AB34CD'
  },
  {
    name: 'Confirmation Code',
    subject: 'Microsoft Account Confirmation',
    body: 'Hi there,\n\nConfirmation code: XY78ZW\n\nEnter this code to confirm your identity.',
    expected: 'XY78ZW'
  },
  {
    name: 'Security Code',
    subject: 'PayPal Security Code',
    body: 'Your PayPal security code is 987654\n\nUse this code to complete your transaction.',
    expected: '987654'
  },
  {
    name: 'Use code to verify',
    subject: 'Verify your email for GitHub',
    body: 'Welcome to GitHub!\n\nUse code GH56TY to verify your email address.',
    expected: 'GH56TY'
  },
  {
    name: 'PIN Code',
    subject: 'Your PIN Code',
    body: 'Dear Customer,\n\nYour PIN code: 4567\n\nPlease keep this code confidential.',
    expected: '4567'
  },

  // ========== HTML格式 ==========
  {
    name: 'HTML加粗突出',
    subject: 'Account Verification',
    body: '<div style="text-align:center;padding:50px;"><p>Please use the following code:</p><h1 style="color:#f44336;font-size:48px;">135790</h1></div>',
    expected: '135790'
  },
  {
    name: '中英混合',
    subject: 'Verification Code / 验证码',
    body: 'Your verification code / 您的验证码：MX90PN\n\nCode is valid for 10 minutes / 验证码10分钟内有效',
    expected: 'MX90PN'
  },

  // ========== 干扰项测试（不应提取）==========
  {
    name: '日期干扰',
    subject: '会议提醒',
    body: '您的会议安排在 20241016 下午3点。\n\n会议编号：20241016',
    expected: null
  },
  {
    name: '重复数字干扰',
    subject: '测试邮件',
    body: '这是一封测试邮件。订单号：111111\n\n金额：999999元',
    expected: null
  }
];

// 运行测试
console.log('🧪 验证码提取功能测试\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;
const failedCases = [];

for (const testCase of testCases) {
  const result = extractCodeFromEmail(testCase.subject, testCase.body);
  const success = result === testCase.expected || 
                  (result && testCase.expected && result.toUpperCase() === testCase.expected.toUpperCase());
  
  if (success) {
    passed++;
    console.log(`✓ ${testCase.name.padEnd(25)} | 预期: ${String(testCase.expected).padEnd(10)} | 结果: ${result}`);
  } else {
    failed++;
    failedCases.push(testCase);
    console.log(`✗ ${testCase.name.padEnd(25)} | 预期: ${String(testCase.expected).padEnd(10)} | 结果: ${result || 'null'}`);
  }
}

console.log('='.repeat(80));
console.log(`\n📊 测试统计:`);
console.log(`   总计: ${testCases.length} 个测试用例`);
console.log(`   ✓ 通过: ${passed} 个 (${(passed / testCases.length * 100).toFixed(1)}%)`);
console.log(`   ✗ 失败: ${failed} 个 (${(failed / testCases.length * 100).toFixed(1)}%)`);

if (failedCases.length > 0) {
  console.log(`\n❌ 失败的测试用例详情:`);
  failedCases.forEach((tc, index) => {
    console.log(`\n${index + 1}. ${tc.name}`);
    console.log(`   主题: ${tc.subject}`);
    console.log(`   正文: ${tc.body.substring(0, 100)}${tc.body.length > 100 ? '...' : ''}`);
    console.log(`   预期: ${tc.expected}`);
    console.log(`   实际: ${extractCodeFromEmail(tc.subject, tc.body) || 'null'}`);
  });
}

console.log('\n' + '='.repeat(80));
console.log(failed === 0 ? '✅ 所有测试通过！' : `⚠️  ${failed} 个测试失败，需要优化`);

// 退出码
process.exit(failed > 0 ? 1 : 0);

