#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const desktopDir = path.join(repoRoot, 'apps', 'desktop');
const releaseDir = path.join(desktopDir, 'release');

function shouldInstallDeps(dir) {
  const nodeModules = path.join(dir, 'node_modules');
  return !fs.existsSync(nodeModules);
}

function runStep(label, command, args, cwd) {
  console.log(`\n→ ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    console.error(`\n✖ ${label} failed.`);
    process.exit(result.status ?? 1);
  }

  console.log(`✓ ${label} completed.`);
}

if (shouldInstallDeps(repoRoot)) {
  runStep('Installing root dependencies', 'npm', ['install'], repoRoot);
} else {
  console.log('✓ Root dependencies already installed.');
}

if (shouldInstallDeps(desktopDir)) {
  runStep('Installing desktop shell dependencies', 'npm', ['install'], desktopDir);
} else {
  console.log('✓ Desktop shell dependencies already installed.');
}

runStep('Building web client', 'npm', ['run', 'build'], repoRoot);
runStep('Packaging desktop installers', 'npm', ['run', 'desktop:package'], repoRoot);

if (fs.existsSync(releaseDir)) {
  const entries = fs.readdirSync(releaseDir);
  if (entries.length) {
    console.log('\nInstallers generated in:');
    console.log(`  ${releaseDir}`);
    for (const entry of entries) {
      console.log(`  • ${entry}`);
    }
  } else {
    console.log('\nNo installers found in release directory yet.');
  }
} else {
  console.log('\nRelease directory not found.');
}

console.log('\nAll done! Share the installer that matches each target platform.');
