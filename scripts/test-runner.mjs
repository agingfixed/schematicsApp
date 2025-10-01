// Lightweight wrapper around the previous shell-based test runner that gracefully ignores
// unsupported watch flags when executed by CI.
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const rawArgs = process.argv.slice(2);
const extraArgs = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--watch') {
    const next = rawArgs[index + 1];
    if (next === 'false') {
      index += 1;
      continue;
    }
    continue;
  }
  if (arg === '--watch=false' || arg === '--no-watch') {
    continue;
  }
  if (arg.startsWith('--watch=')) {
    const [, value] = arg.split('=');
    if (value === 'false') {
      continue;
    }
  }
  extraArgs.push(arg);
}

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit', cwd: projectRoot });
};

rmSync(resolve(projectRoot, 'build-tests'), { recursive: true, force: true });
run('tsc', ['--project', 'tsconfig.tests.json']);
run('node', ['scripts/fix-esm-extensions.mjs']);
const testDirectory = resolve(projectRoot, 'build-tests/utils/__tests__');
let testFiles = [];
try {
  testFiles = readdirSync(testDirectory)
    .filter((file) => file.endsWith('.js'))
    .map((file) => resolve(testDirectory, file));
} catch (error) {
  console.warn('No compiled tests were found. Did the TypeScript build succeed?', error);
}

if (testFiles.length > 0) {
  run('node', ['--test', ...testFiles, ...extraArgs]);
} else {
  console.warn('Skipping node --test execution because no test files are available.');
  if (!process.exitCode) {
    process.exitCode = 1;
  }
}
