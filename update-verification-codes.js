// 更新现有消息的验证码提取
// 用于测试或修复已存在但未提取验证码的邮件

import { extractCodeFromEmail } from './src/utils/codeExtractor.js';

// 模拟 Cloudflare Workers 环境
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/1f1d5a74893248318128092c2cd6675.sqlite');

console.log('📦 连接本地 D1 数据库...');
const db = new Database(dbPath);

// 获取所有未提取验证码的消息
const messages = db.prepare(`
  SELECT id, subject, body_text, body_html, verification_code
  FROM messages
  WHERE verification_code IS NULL OR verification_code = ''
`).all();

console.log(`\n🔍 找到 ${messages.length} 条需要处理的消息\n`);

let updated = 0;
let extracted = 0;

for (const msg of messages) {
  const body = msg.body_text || msg.body_html || '';
  const code = extractCodeFromEmail(msg.subject, body);
  
  if (code) {
    db.prepare(`
      UPDATE messages 
      SET verification_code = ? 
      WHERE id = ?
    `).run(code, msg.id);
    
    extracted++;
    console.log(`✓ [${msg.id}] 提取验证码: ${code} | 主题: ${msg.subject.substring(0, 40)}`);
  } else {
    console.log(`✗ [${msg.id}] 未提取到 | 主题: ${msg.subject.substring(0, 40)}`);
  }
  
  updated++;
}

console.log(`\n📊 处理完成:`);
console.log(`   总计: ${messages.length} 条消息`);
console.log(`   ✓ 提取成功: ${extracted} 个验证码`);
console.log(`   ✗ 未提取: ${messages.length - extracted} 条`);
console.log(`   成功率: ${(extracted / messages.length * 100).toFixed(1)}%`);

db.close();

