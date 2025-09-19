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

## Current Capabilities

- Infinite zoomable canvas with grid background and smooth panning.
- Palette for primary flowchart node types (rectangle, rounded rectangle, ellipse, decision diamond) plus connector tool.
- Straight connectors with selectable arrowheads, inline labels, and live preview when creating a connection.
- Undo/redo with transaction batching while dragging.
- Selection-based inspector for editing node size, fill, stroke, and connector styling.
- Mini map that visualises the entire board and recentres the viewport on click.
- Inline text editing for nodes and connectors with content-aware shortcuts (double-click to edit, escape to cancel).

## Roadmap

- Orthogonal routing improvements with preserved waypoints.
- Frame and container support with auto-resize.
- Export to PNG/SVG and import templates.
- Realtime collaboration via CRDT and WebSocket layers.

Contributions and feedback are welcome while the editor is still evolving.
