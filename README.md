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
- `npm run package:offline` – build and archive the offline desktop bundle without running the production build.

## Offline Desktop Bundle

The project now ships with an automated packaging step that prepares a downloadable desktop bundle whenever `npm run build` (or `npm run package:offline`) runs. The workflow is designed to work within GitHub pull requests without committing large binary artifacts:

1. The packaging script runs `vite build --mode offline` with a relative base path so the generated `index.html` and assets work from the local filesystem.
2. The resulting bundle is zipped into `desktop/schematics-studio.zip` and duplicated to `public/desktop/schematics-studio.zip`, which the web app serves through the “Download for desktop” button.
3. Inside the archive you will find a `README.txt` explaining how to extract the files and open `index.html` in a modern browser. The in-app “Download” and “Upload” buttons continue to save and reopen the existing `.json` board format entirely offline.

Because the archive is generated during the build, no binary files live in the repository—avoiding the “Binary files are not supported” errors seen in previous attempts. When publishing a new release, run `npm run build` and upload `desktop/schematics-studio.zip` from the project root as the downloadable desktop artifact.

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
