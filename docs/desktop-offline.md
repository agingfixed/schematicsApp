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

## 2. Create a macOS-friendly archive

1. Open Finder and create a new folder such as `SchematicsStudio-macOS`.
2. Copy the entire `dist/` directory contents into that folder.
3. (Optional) Add a `README.txt` describing how to launch `index.html` locally or how to serve the folder with `npx serve dist`.
4. Right-click the folder in Finder and choose **Compress “SchematicsStudio-macOS”** to produce `SchematicsStudio-macOS.zip`.
5. Share the resulting zip. A user only needs to unzip it and open `index.html` in a modern browser. The service worker will
   cache files after the first online session so boards remain available offline.

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

You can automate zip creation inside CI/CD by adding a script similar to:

```json
{
  "scripts": {
    "package:zip": "npm run build && cd dist && zip -r ../schematics-studio-offline.zip ."
  }
}
```

This keeps binary artifacts out of source control but still produces a downloadable bundle for distribution.
