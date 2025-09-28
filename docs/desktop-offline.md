# Desktop & Offline Distribution Guide

This guide explains how to install Schematics Studio for offline use and how to share the static build when teammates cannot rely on the in-app installer.

## 1. Build & package the production bundle

```bash
npm install
npm run build
```

The build command type-checks the project, emits the production assets into `dist/`, and then packages desktop-ready archives for macOS, Windows, and Linux under `dist/downloads/`:

| Platform  | Archive                                    |
|-----------|--------------------------------------------|
| macOS     | `dist/downloads/schematics-studio-mac.zip` |
| Windows   | `dist/downloads/schematics-studio-windows.zip` |
| Linux/ChromeOS | `dist/downloads/schematics-studio-linux.zip` |

Each archive contains a `schematics-studio` folder with the fully built site. The packaging step also emits `dist/downloads/index.json` so the login screen can auto-detect the correct bundle for one-click downloads.

## 2. Built-in installer behaviour

- The login screen surfaces an install card tailored to the visitor’s platform (macOS, Windows, etc.).
- Supported browsers fire the `beforeinstallprompt` event, enabling a one-click install button. When unavailable (Safari on macOS/iOS), the card now falls back to downloading the appropriate offline archive.
- Once installed or extracted locally, the app caches assets for offline work after an initial online sign-in.

## 3. Sharing the static build manually

If you need to distribute the build outside of the in-app download:

1. Run `npm run build` to regenerate the archives.
2. Share the relevant file from `dist/downloads/` (for example, `schematics-studio-mac.zip`).
3. Recipients should extract the archive, open `index.html` in a modern browser, and optionally use the browser install menu to pin the app.

## 4. Verifying offline readiness

After installing the PWA or opening the shared build:

1. Sign in while connected to the internet so the app can cache the board data.
2. Disconnect from the network and reload the installed app or the local `index.html`.
3. You should still be able to open previously saved boards and make edits. Reconnect later to sync any changes.

## 5. Automating distribution (optional)

CI/CD pipelines only need to run `npm install && npm run build`. The resulting `dist/downloads/index.json` and archives can be published to release storage or a CDN to power one-click downloads in other environments.
