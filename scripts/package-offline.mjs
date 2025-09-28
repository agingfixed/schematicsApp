import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = join(projectRoot, 'dist');

if (!existsSync(distDir)) {
  throw new Error('The dist directory was not found. Build the project before packaging offline bundles.');
}

const downloadsDir = join(distDir, 'downloads');
if (existsSync(downloadsDir)) {
  rmSync(downloadsDir, { recursive: true, force: true });
}
mkdirSync(downloadsDir, { recursive: true });

const ensureCommand = (command) => {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(checker, [command], { stdio: 'ignore' });
  } catch {
    throw new Error(`Required command "${command}" is not available. Install it to package offline bundles.`);
  }
};

ensureCommand('zip');

const bundleTargets = [
  {
    id: 'mac',
    fileName: 'schematics-studio-mac.zip'
  },
  {
    id: 'windows',
    fileName: 'schematics-studio-windows.zip'
  },
  {
    id: 'linux',
    fileName: 'schematics-studio-linux.zip'
  }
];

const tempRoot = mkdtempSync(join(tmpdir(), 'schematics-offline-'));

try {
  const payloadDir = join(tempRoot, 'schematics-studio');
  mkdirSync(payloadDir);

  const entries = readdirSync(distDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'downloads') {
      continue;
    }
    const source = join(distDir, entry.name);
    const destination = join(payloadDir, entry.name);
    cpSync(source, destination, { recursive: true });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    bundles: {}
  };

  for (const target of bundleTargets) {
    const outputPath = join(downloadsDir, target.fileName);
    if (existsSync(outputPath)) {
      rmSync(outputPath);
    }
    execFileSync('zip', ['-rq', outputPath, basename(payloadDir)], { cwd: tempRoot, stdio: 'inherit' });

    const fileStats = statSync(outputPath);
    const hash = createHash('sha256');
    hash.update(readFileSync(outputPath));

    manifest.bundles[target.id] = {
      fileName: target.fileName,
      file: `downloads/${target.fileName}`,
      size: fileStats.size,
      sha256: hash.digest('hex')
    };
  }

  const manifestPath = join(downloadsDir, 'index.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const bootstrapPath = join(distDir, 'offline-bundles.js');
  const bootstrapContents = `globalThis.__SCHEMATICS_OFFLINE_BUNDLES__ = ${JSON.stringify(manifest, null, 2)};\n`;
  writeFileSync(bootstrapPath, bootstrapContents);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
