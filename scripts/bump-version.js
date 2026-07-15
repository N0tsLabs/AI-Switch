#!/usr/bin/env node
/**
 * 版本同步脚本
 * 用法: node scripts/bump-version.js <new-version>
 * 例如: node scripts/bump-version.js 0.2.0
 */

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/bump-version.js <new-version>');
  process.exit(1);
}

const files = [
  { path: 'package.json', key: 'version' },
  { path: 'src-tauri/Cargo.toml', key: 'version', regex: /^version\s*=\s*"([^"]+)"/m },
  { path: 'src-tauri/tauri.conf.json', key: 'version' },
  { path: 'VERSION', raw: true },
  { path: 'latest.json', key: 'version' },
];

files.forEach(({ path: filePath, key, regex, raw }) => {
  const fullPath = path.join(__dirname, '..', filePath);
  let content = fs.readFileSync(fullPath, 'utf-8');

  if (raw) {
    content = version + '\n';
  } else if (regex) {
    content = content.replace(regex, `version = "${version}"`);
  } else if (filePath.endsWith('.json')) {
    const json = JSON.parse(content);
    json[key] = version;
    content = JSON.stringify(json, null, 2) + '\n';
  }

  fs.writeFileSync(fullPath, content);
  console.log(`✓ ${filePath} -> ${version}`);
});

console.log(`\n版本已同步到 ${version}`);
console.log('接下来运行:');
console.log(`  git add -A && git commit -m "release: v${version}"`);
console.log(`  git tag v${version}`);
console.log('  git push origin master --tags');
