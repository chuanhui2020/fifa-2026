#!/usr/bin/env node
/**
 * 清理 KV 中的重复比赛数据
 *
 * 使用方法：
 * 1. 确保已登录管理员账号
 * 2. 在浏览器控制台运行: localStorage.getItem('adminToken')
 * 3. 复制 token
 * 4. 运行: node scripts/cleanup-duplicates.mjs YOUR_TOKEN
 *
 * 或者提供密码和 secret：
 *   ADMIN_PASSWORD=xxx ADMIN_SECRET=yyy node scripts/cleanup-duplicates.mjs
 */

import https from 'https';
import crypto from 'crypto';

const BASE_URL = 'fifa-2026-6ep.pages.dev';
const tokenArg = process.argv[2];
let token = tokenArg;

// 如果没有提供 token，尝试从环境变量生成
if (!token && process.env.ADMIN_PASSWORD && process.env.ADMIN_SECRET) {
  const hmac = crypto.createHmac('sha256', process.env.ADMIN_SECRET);
  hmac.update(process.env.ADMIN_PASSWORD);
  token = hmac.digest('hex');
  console.log('✓ Token 已从环境变量生成');
}

if (!token) {
  console.error('❌ 错误：需要提供 token 或环境变量\n');
  console.log('方式1: 使用浏览器 token');
  console.log('  1. 打开 https://fifa2026.ch-tools.org');
  console.log('  2. 登录管理员');
  console.log('  3. 打开控制台运行: localStorage.getItem("adminToken")');
  console.log('  4. 复制 token');
  console.log('  5. 运行: node scripts/cleanup-duplicates.mjs YOUR_TOKEN\n');
  console.log('方式2: 使用环境变量');
  console.log('  ADMIN_PASSWORD=xxx ADMIN_SECRET=yyy node scripts/cleanup-duplicates.mjs\n');
  process.exit(1);
}

console.log('开始清理重复数据...\n');

const options = {
  hostname: BASE_URL,
  path: '/api/cleanup-duplicates',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.success) {
        console.log('✅ 清理成功！\n');
        console.log('删除的比赛ID:', data.merged.deletedId);
        console.log('合并到:', data.merged.mergedInto);
        console.log('最终对阵:', data.merged.finalFixture);
        console.log('\n比赛总数:', data.before, '→', data.after);
        console.log('\n✓ 请刷新页面查看结果');
      } else {
        console.error('❌ 清理失败:', data.message || data.error);
        if (data.found) {
          console.log('找到的记录:', data.found);
        }
      }
    } catch (e) {
      console.error('❌ 解析响应失败:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ 请求失败:', e.message);
});

req.end();
