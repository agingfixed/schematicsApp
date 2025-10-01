# Schematics Studio

An experimental infinite-canvas diagram editor focused on building flowcharts, org charts, and lightweight schematic documents. The goal is to provide a Figma-like authoring experience optimised for nodes, connectors, and rapid iteration.

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
- `npm run build` – type-check and produce a production build.
- `npm run preview` – preview the build output locally.
- `npm run test` – execute the Node-based unit test suite. Extra flags like `--watch=false` are ignored when unsupported so CI
  environments can safely append them.

## Offline & Desktop Installation

Schematics Studio now ships as a Progressive Web App (PWA). Visit the app in a supported browser (Chrome, Edge, or any Chromium-
based browser on Windows/macOS/Linux) and click **Install Desktop App** inside the board controls. The browser will offer to add
Schematics Studio to your desktop or applications menu. Once installed, the editor runs in its own window and will cache assets
locally so existing boards and downloaded JSON files remain accessible offline.

The install button becomes enabled when the browser determines the PWA can be installed. If you dismiss the prompt you can try
again later from the same button. When a browser does not expose the install prompt (for example Firefox today), use the
browser menu and choose the built-in **Install** or **Add to Home Screen** command to pin the app manually.

During development the service worker only registers against production builds. Run `npm run build && npm run preview` to test
the offline behaviour locally.

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
