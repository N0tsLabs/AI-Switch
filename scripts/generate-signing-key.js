#!/usr/bin/env node
/**
 * 生成 Tauri 更新器签名密钥对
 * 使用 Node.js crypto 生成 Ed25519 密钥对
 */

import { generateKeyPairSync } from 'crypto';

// 生成 Ed25519 密钥对
const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  publicKeyEncoding: { type: 'spki', format: 'der' }
});

// 转换为 base64
const privateKeyBase64 = privateKey.toString('base64');
const publicKeyBase64 = publicKey.toString('base64');

console.log('=== Tauri 更新器签名密钥 ===\n');
console.log('【公钥 - 填入 tauri.conf.json 的 pubkey 字段】');
console.log(publicKeyBase64);
console.log('\n【私钥 - 填入 GitHub Secret: TAURI_SIGNING_PRIVATE_KEY】');
console.log(privateKeyBase64);
console.log('\n注意：私钥请妥善保管，不要提交到代码仓库！');
