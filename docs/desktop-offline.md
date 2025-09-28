# Desktop & Offline Distribution Guide

This guide explains how to install Schematics Studio for offline use and how to share the static build when teammates cannot rely on the in-app installer.

## 1. Build the production bundle

```bash
npm install
npm run build
```

The compiled files are emitted into `dist/`. Every asset is static, so the folder can be shared directly or hosted behind a simple file server.

## 2. Built-in installer behaviour

- The login screen surfaces an install card tailored to the visitor’s platform (macOS, Windows, etc.).
- Supported browsers fire the `beforeinstallprompt` event, enabling a one-click install button. When unavailable (Safari on macOS/iOS), the card shows manual steps such as Safari’s **File → Add to Dock** flow.
- Once installed, the Progressive Web App (PWA) runs in its own window and stores assets in the browser cache for offline work.

## 3. Sharing the static build

If a teammate cannot use the browser-based install flow, share the `dist/` folder produced by `npm run build`:

1. Zip the `dist/` directory using your platform tools (`Compress` in Finder, `Send to → Compressed folder` on Windows, or `zip -r dist.zip dist` on Linux).
2. Deliver the archive through your preferred channel (shared drive, release artifact, etc.).
3. The recipient should extract the files, open the `index.html` file in a modern browser, and install the app from the browser menu for a desktop-like experience.

## 4. Verifying offline readiness

After installing the PWA or opening the shared build:

1. Sign in while connected to the internet so the app can cache the board data.
2. Disconnect from the network and reload the installed app or the local `index.html`.
3. You should still be able to open previously saved boards and make edits. Reconnect later to sync any changes.

## 5. Automating distribution (optional)

CI/CD pipelines can archive the `dist/` folder however they prefer (zip, tar, etc.) after running `npm install && npm run build`. Upload the result to your release storage and reference it in documentation if teams need a pre-packaged download.
