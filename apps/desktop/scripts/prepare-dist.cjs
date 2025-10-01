#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const distDir = path.join(repoRoot, 'dist');
const indexHtml = path.join(distDir, 'index.html');

if (fs.existsSync(indexHtml)) {
  console.log(`Using existing build output at ${distDir}`);
  process.exit(0);
}

console.log('Build output not found. Running "npm run build" in project root...');
const result = spawnSync('npm', ['run', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (result.status !== 0) {
  console.error('Failed to generate dist assets.');
  process.exit(result.status || 1);
}
