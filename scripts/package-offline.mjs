import { build as viteBuild } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const desktopDir = path.join(rootDir, 'desktop');
const offlineOutDir = path.join(desktopDir, 'schematics-studio');
const archivePath = path.join(desktopDir, 'schematics-studio.zip');
const publicDesktopDir = path.join(rootDir, 'public', 'desktop');
const publicArchivePath = path.join(publicDesktopDir, 'schematics-studio.zip');
const offlineReadmePath = path.join(offlineOutDir, 'README.txt');

const OFFLINE_README = `Schematics Studio Offline\n===========================\n\nThanks for downloading the offline build!\n\nGetting started:\n1. Extract the contents of this archive to a folder on your computer.\n2. Open the file named \"index.html\" in a modern Chromium, Firefox, or Safari browser.\n3. The editor runs entirely in your browser tab. Use the \"Download\" and \"Upload\" buttons in the toolbar to save and reopen *.json boards.\n\nBecause everything is stored locally, the browser's undo history will be cleared if you refresh the tab.\n`; // eslint-disable-line max-len

async function ensureCleanWorkspace() {
  await mkdir(desktopDir, { recursive: true });
  await rm(offlineOutDir, { recursive: true, force: true });
  await rm(archivePath, { force: true });
}

async function runOfflineBuild() {
  await viteBuild({
    configFile: path.join(rootDir, 'vite.config.ts'),
    root: rootDir,
    mode: 'offline',
    build: {
      outDir: offlineOutDir,
      emptyOutDir: true
    }
  });
}

async function writeOfflineReadme() {
  await writeFile(offlineReadmePath, OFFLINE_README, 'utf8');
}

async function createArchive() {
  await mkdir(desktopDir, { recursive: true });
  await rm(archivePath, { force: true });

  await new Promise((resolve, reject) => {
    const child = spawn('zip', ['-r', '-q', archivePath, '.'], {
      cwd: offlineOutDir,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`zip exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('The "zip" command is required to package the offline build. Install a zip utility and try again.'));
      } else {
        reject(error);
      }
    });
  });
}

async function copyArchiveToPublic() {
  await mkdir(publicDesktopDir, { recursive: true });
  await rm(publicArchivePath, { force: true });
  await copyFile(archivePath, publicArchivePath);
}

async function main() {
  console.info('[package-offline] Preparing offline desktop package...');
  await ensureCleanWorkspace();
  await runOfflineBuild();
  await writeOfflineReadme();
  await createArchive();
  await copyArchiveToPublic();
  console.info('[package-offline] Offline package ready at', archivePath);
  console.info('[package-offline] Public copy available at', publicArchivePath);
}

main().catch((error) => {
  console.error('[package-offline] Failed to create offline package');
  console.error(error);
  process.exitCode = 1;
});
