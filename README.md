# Schematics Studio

An experimental infinite-canvas diagram editor focused on building flowcharts, org charts, and lightweight schematic documents.
The goal is to provide a Figma-like authoring experience optimised for nodes, connectors, and rapid iteration.

## Getting Started

```bash
npm install
npm run dev
```

If your environment blocks direct access to the public npm registry you may need to configure a mirror before installing:

```bash
npm config set registry https://registry.npmmirror.com
```

## Available Scripts

- `npm run dev` – start the Vite development server.
- `npm run build` – type-check, produce a production build, and generate desktop-ready archives in `dist/downloads/`.
- `npm run preview` – preview the build output locally.

## Offline & Desktop installation

Schematics Studio ships as an installable Progressive Web App (PWA). When you visit the site in a supported browser you will
see an install card that automatically detects your operating system and explains the correct install flow (for example, “Add to
Dock” on macOS or “Install app” in Chrome on Windows).

If your browser surfaces an install button you can add the app in a single click. Safari on macOS exposes this as **File → Add
to Dock**, while Chromium browsers show an install icon in the address bar or under **More → Install app**. When the browser
cannot offer an install prompt, the login screen falls back to a one-click download of the correct offline bundle (macOS,
Windows, or Linux) generated during `npm run build`. That packaging step also writes `dist/offline-bundles.js`, which preloads
the manifest that powers one-click downloads so the installer still works when the site is served from a static folder or opened
directly from disk. See [`docs/desktop-offline.md`](docs/desktop-offline.md) for a deeper look at distributing and verifying
these archives.

## Current Capabilities

- Infinite zoomable canvas with grid background and smooth panning.
- Palette for primary flowchart node types (rectangle, rounded rectangle, ellipse, decision diamond) plus connector tool.
- Straight connectors with selectable arrowheads, inline labels, and live preview when creating a connection.
- Undo/redo with transaction batching while dragging.
- Selection-based inspector for editing node size, fill, stroke, and connector styling.
- Mini map that visualises the entire board and recentres the viewport on click.
- Inline text editing for nodes and connectors with content-aware shortcuts (double-click to edit, escape to cancel).

## Testing Layout

The default canvas now boots with a validation scene that fans connectors across every cardinal port and a couple of floating endpoints. This makes it easy to confirm connector rendering, labeling, and request handling without any manual setup. Start the dev server and you should immediately see connectors that:

- Traverse left-to-right, right-to-left, top-to-bottom, and bottom-to-top between nodes.
- Loop back between stages to exercise multiple ports on a single node.
- Terminate at floating positions so you can inspect API behaviour for unattached endpoints.
- Display start-arrow variations (filled triangles, outlined diamonds, circles, line arrows, and inward arrows) so testers can confirm both inbound and outbound arrowhead rendering.

Feel free to duplicate or delete the seeded nodes once you finish verifying connector flows.

## Roadmap

- Orthogonal routing improvements with preserved waypoints.
- Frame and container support with auto-resize.
- Export to PNG/SVG and import templates.
- Realtime collaboration via CRDT and WebSocket layers.

Contributions and feedback are welcome while the editor is still evolving.
