# Desktop & Offline Distribution Guide

This guide explains how to package Schematics Studio so teammates can install it locally (macOS example) and how the in-app
installer works.

## 1. Build the production bundle

```bash
npm install
npm run build
```

The compiled files are emitted into `dist/`. Every asset is static, so the folder can be zipped and shared or hosted behind a
simple file server.

## 2. Generate desktop archives automatically

Running `npm run build` now creates pre-packaged archives under `dist/downloads/` for macOS, Windows, Linux, and a universal
desktop bundle. macOS uses a `.tar.gz` to stay compatible with Archive Utility, while the other platforms remain `.zip` files.
Each archive contains:

- the production build under a `Schematics Studio` folder,
- a platform-specific `README.txt` with launch instructions, and
- cached assets ready for offline use after the first online sign-in.

Need to refresh the archives without a new build? Run `npm run package:offline` after `npm run build`; it will regenerate the
archives using the existing `dist/` output.

## 3. Built-in installer behaviour

- The login screen now surfaces an “Install on macOS” card (or Windows/Linux/etc.) that adapts instructions based on the
  visitor’s platform.
- Supported browsers fire the `beforeinstallprompt` event, enabling a one-click install button. When unavailable (Safari on
  macOS/iOS), the card shows manual steps such as Safari’s **File → Add to Dock** flow.
- Once installed, the Progressive Web App (PWA) runs in its own window and stores assets in the browser cache for offline work.

## 4. Verifying offline readiness

After installing the PWA or unzipping the archive:

1. Sign in while connected to the internet so the app can cache the board data.
2. Disconnect from the network and reload the installed app or `index.html` from the archive.
3. You should still be able to open previously saved boards and make edits. Reconnect later to sync any changes.

## 5. Automating archive creation (optional)

CI/CD pipelines only need to run `npm install && npm run build`. The build script already invokes the offline packager so the
archives land in `dist/downloads/`. Upload those artifacts to your preferred storage (S3, GCS, internal fileshare) and surface the
direct download links in release notes or the in-app “Download for …” button.
