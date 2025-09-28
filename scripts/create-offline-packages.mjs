import { access, cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const DIST_DIR = path.resolve('dist');
const DOWNLOADS_DIR = path.join(DIST_DIR, 'downloads');

const PACKAGES = [
  {
    filename: 'schematics-studio-mac.tar.gz',
    format: 'tar',
    readme: `Schematics Studio (macOS)
================================

Thanks for downloading the Schematics Studio offline bundle.

How to launch:
1. Unzip the archive anywhere on your Mac.
2. Open the folder named "Schematics Studio".
3. Double-click index.html. Safari or Chrome will open the app and cache it for offline work after you sign in.

Tips:
- Pin the page using Safari's File → Add to Dock or Chrome's Install feature for a native window.
- After the first online session your boards are cached for offline edits.
`
  },
  {
    filename: 'schematics-studio-windows.zip',
    format: 'zip',
    readme: `Schematics Studio (Windows)
================================

Thanks for downloading the Schematics Studio offline bundle.

How to launch:
1. Extract the archive to a folder (for example, in Documents).
2. Open the "Schematics Studio" folder.
3. Double-click index.html and choose your preferred browser when prompted.

Tips:
- In Microsoft Edge or Chrome, install the site (⋮ → Apps → Install) for an app-like experience.
- Let the app sync once online so that boards stay available offline.
`
  },
  {
    filename: 'schematics-studio-linux.zip',
    format: 'zip',
    readme: `Schematics Studio (Linux)
================================

Thanks for downloading the Schematics Studio offline bundle.

How to launch:
1. Extract the archive (\`unzip schematics-studio-linux.zip\`).
2. Open the "Schematics Studio" folder.
3. Launch index.html in a Chromium browser (Chrome, Edge) to run the app offline.

Tips:
- Create a desktop shortcut or launcher entry pointing to the extracted folder for quick access.
- Let the app sync once online so that boards stay available offline.
`
  },
  {
    filename: 'schematics-studio-desktop.zip',
    format: 'zip',
    readme: `Schematics Studio (Desktop)
=================================

Thanks for downloading the Schematics Studio offline bundle.

How to launch:
1. Extract the archive on your machine.
2. Open the "Schematics Studio" folder.
3. Launch index.html in a modern browser (Chrome, Edge, or Safari).

Tips:
- Install the app using your browser's install/Add to Dock feature for a native window.
- Let the app sync once online so that boards stay available offline.
`
  }
];

const ensureDistExists = async () => {
  try {
    await access(DIST_DIR);
    return true;
  } catch (error) {
    console.warn('[offline-packager] dist/ directory not found; skipping bundle creation.');
    return false;
  }
};

const zipAvailable = async () =>
  new Promise((resolve) => {
    const child = spawn('zip', ['-v']);
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });

const tarAvailable = async () =>
  new Promise((resolve) => {
    const child = spawn('tar', ['--version']);
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });

const runZip = (cwd, destination, targetFolder) =>
  new Promise((resolve, reject) => {
    const args = ['-r', '--quiet', destination, targetFolder];
    const child = spawn('zip', args, { cwd });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`zip command failed with code ${code}: ${stderr}`));
      }
    });
  });

const runTar = (cwd, destination, targetFolder) =>
  new Promise((resolve, reject) => {
    const args = ['-czf', destination, targetFolder];
    const child = spawn('tar', args, { cwd });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar command failed with code ${code}: ${stderr}`));
      }
    });
  });

const createPackage = async ({ filename, readme, format }) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'schematics-offline-'));
  const bundleFolderName = 'Schematics Studio';
  const bundleDir = path.join(tempRoot, bundleFolderName);
  await mkdir(bundleDir, { recursive: true });

  await cp(DIST_DIR, bundleDir, { recursive: true });
  await rm(path.join(bundleDir, 'downloads'), { recursive: true, force: true });
  await writeFile(path.join(bundleDir, 'README.txt'), readme, 'utf8');

  const destination = path.join(DOWNLOADS_DIR, filename);
  if (format === 'tar') {
    await runTar(tempRoot, destination, bundleFolderName);
  } else {
    await runZip(tempRoot, destination, bundleFolderName);
  }

  await rm(tempRoot, { recursive: true, force: true });
};

const main = async () => {
  const hasDist = await ensureDistExists();
  if (!hasDist) {
    return;
  }

  const needsTar = PACKAGES.some((pkg) => pkg.format === 'tar');
  const needsZip = PACKAGES.some((pkg) => pkg.format !== 'tar');

  const toolAvailability = {
    tar: needsTar ? await tarAvailable() : true,
    zip: needsZip ? await zipAvailable() : true
  };

  if (!toolAvailability.tar && needsTar) {
    console.warn('[offline-packager] tar command is not available on this system; macOS bundle will be skipped.');
  }

  if (!toolAvailability.zip && needsZip) {
    console.warn('[offline-packager] zip command is not available on this system; zip bundles will be skipped.');
  }

  if (!toolAvailability.tar && !toolAvailability.zip) {
    return;
  }

  await rm(DOWNLOADS_DIR, { recursive: true, force: true });
  await mkdir(DOWNLOADS_DIR, { recursive: true });

  for (const pkg of PACKAGES) {
    if (pkg.format === 'tar' && !toolAvailability.tar) {
      continue;
    }
    if (pkg.format !== 'tar' && !toolAvailability.zip) {
      continue;
    }
    try {
      await createPackage(pkg);
      console.log(`[offline-packager] Created ${pkg.filename}`);
    } catch (error) {
      console.error(`[offline-packager] Failed to create ${pkg.filename}:`, error);
    }
  }
};

main().catch((error) => {
  console.error('[offline-packager] Unexpected error:', error);
  process.exitCode = 1;
});
