import { nanoid } from 'nanoid';
import { create } from 'zustand';
import {
  CanvasTransform,
  ConnectorModel,
  ConnectorLabelStyle,
  NodeFontWeight,
  NodeKind,
  NodeModel,
  SceneContent,
  SelectionState,
  TextAlign,
  Tool,
  Vec2
} from '../types/scene';
import {
  GRID_SIZE,
  cloneScene,
  createNodeModel,
  getNodeById,
  getSceneBounds
} from '../utils/scene';

const HISTORY_LIMIT = 64;

interface SceneHistory {
  past: SceneContent[];
  future: SceneContent[];
}

export interface NodeStylePatch {
  fill?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontWeight?: NodeFontWeight;
  textAlign?: TextAlign;
}

export interface SnapSettings {
  enabled: boolean;
  tolerance: number;
  showDistanceLabels: boolean;
  showSpacingHandles: boolean;
  snapToGrid: boolean;
}

interface SceneStoreState {
  scene: SceneContent;
  history: SceneHistory;
  selection: SelectionState;
  tool: Tool;
  gridVisible: boolean;
  snap: SnapSettings;
  showMiniMap: boolean;
  isTransaction: boolean;
  transform: CanvasTransform;
  editingNodeId: string | null;
}

interface SceneStoreActions {
  setTool: (tool: Tool) => void;
  addNode: (type: NodeKind, position: Vec2) => NodeModel;
  updateNode: (id: string, patch: Partial<NodeModel>) => void;
  moveNode: (id: string, position: Vec2) => void;
  batchMove: (ids: string[], delta: Vec2) => void;
  resizeNodes: (
    updates: Array<{ id: string; position: Vec2; size: { width: number; height: number } }>
  ) => void;
  removeNode: (id: string) => void;
  addConnector: (sourceId: string, targetId: string) => ConnectorModel | null;
  updateConnector: (id: string, patch: Partial<ConnectorModel>) => void;
  removeConnector: (id: string) => void;
  setSelection: (selection: SelectionState) => void;
  clearSelection: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setSnapSettings: (patch: Partial<SnapSettings>) => void;
  equalizeSpacing: (nodeIds: string[], axis: 'x' | 'y') => void;
  setShowMiniMap: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  setTransform: (transform: CanvasTransform) => void;
  setEditingNode: (nodeId: string | null) => void;
  applyNodeStyles: (nodeIds: string[], patch: NodeStylePatch) => void;
  setNodeText: (nodeId: string, text: string) => void;
  setNodeShape: (nodeIds: string[], shape: NodeKind) => void;
  setNodeLink: (nodeId: string, url: string | null) => void;
}

export type SceneStore = SceneStoreState & SceneStoreActions;

const defaultConnectorStyle: ConnectorModel['style'] = {
  stroke: '#e5e7eb',
  strokeWidth: 2,
  dashed: false,
  startArrow: { shape: 'none', fill: 'filled' },
  endArrow: { shape: 'triangle', fill: 'filled' },
  arrowSize: 1,
  cornerRadius: 12
};

const defaultConnectorLabelStyle: ConnectorLabelStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#f8fafc',
  background: 'rgba(15,23,42,0.85)'
};

const createInitialScene = (): SceneContent => {
  const start = createNodeModel('ellipse', { x: -380, y: -140 }, 'Start');
  const collect = createNodeModel('rectangle', { x: -40, y: -180 }, 'Collect Input');
  const decision = createNodeModel('diamond', { x: 320, y: -200 }, 'Valid?');
  const done = createNodeModel('rounded-rectangle', { x: 700, y: -160 }, 'Archive');

  const connectors: ConnectorModel[] = [
    {
      id: nanoid(),
      mode: 'orthogonal',
      sourceId: start.id,
      targetId: collect.id,
      style: { ...defaultConnectorStyle },
      label: 'Begin',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      mode: 'orthogonal',
      sourceId: collect.id,
      targetId: decision.id,
      style: { ...defaultConnectorStyle },
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      mode: 'orthogonal',
      sourceId: decision.id,
      targetId: done.id,
      style: { ...defaultConnectorStyle },
      label: 'Yes',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    }
  ];

  return {
    nodes: [start, collect, decision, done],
    connectors
  };
};

const normalizeNodeText = (value: string) => (value.trim().length ? value : 'Untitled');

const initialState: SceneStoreState = {
  scene: createInitialScene(),
  history: { past: [], future: [] },
  selection: { nodeIds: [], connectorIds: [] },
  tool: 'select',
  gridVisible: true,
  snap: {
    enabled: true,
    tolerance: 6,
    showDistanceLabels: true,
    showSpacingHandles: true,
    snapToGrid: true
  },
  showMiniMap: true,
  isTransaction: false,
  transform: { x: 0, y: 0, scale: 1 },
  editingNodeId: null
};

const withSceneChange = (state: SceneStoreState, nextScene: SceneContent) => {
  if (state.isTransaction) {
    return { scene: nextScene };
  }

  const updatedPast = [...state.history.past, cloneScene(state.scene)];
  if (updatedPast.length > HISTORY_LIMIT) {
    updatedPast.shift();
  }

  return {
    scene: nextScene,
    history: {
      past: updatedPast,
      future: []
    }
  };
};

export const useSceneStore = create<SceneStore>((set, get) => ({
  ...initialState,
  setTool: (tool) =>
    set((state) => ({
      tool,
      ...(tool !== 'select' && state.editingNodeId ? { editingNodeId: null } : {})
    })),
  addNode: (type, position) => {
    const state = get();
    const shouldSnapToGrid = state.snap.enabled && state.snap.snapToGrid && state.gridVisible;
    const snappedPosition = shouldSnapToGrid
      ? {
          x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
        }
      : position;

    const node = createNodeModel(type, snappedPosition);

    set((current) => {
      const scene = cloneScene(current.scene);
      scene.nodes.push(node);
      return {
        ...withSceneChange(current, scene),
        selection: { nodeIds: [node.id], connectorIds: [] },
        tool: 'select',
        editingNodeId: null
      };
    });

    return node;
  },
  updateNode: (id, patch) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      const node = scene.nodes.find((item) => item.id === id);
      if (!node) {
        return {};
      }

      const { position, size, stroke, link, ...rest } = patch;

      if (position) {
        node.position = { ...node.position, ...position };
      }
      if (size) {
        node.size = { ...node.size, ...size };
      }
      if (stroke) {
        node.stroke = { ...node.stroke, ...stroke };
      }
      if (link !== undefined) {
        node.link = link ? { ...link } : undefined;
      }

      Object.assign(node, rest);

      return withSceneChange(current, scene);
    }),
  moveNode: (id, position) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      const node = scene.nodes.find((item) => item.id === id);
      if (!node) {
        return {};
      }

      node.position = { ...position };

      if (current.isTransaction) {
        return { scene };
      }

      return withSceneChange(current, scene);
    }),
  batchMove: (ids, delta) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      let changed = false;
      scene.nodes.forEach((node) => {
        if (ids.includes(node.id)) {
          node.position = {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y
          };
          changed = true;
        }
      });

      if (!changed) {
        return {};
      }

      if (current.isTransaction) {
        return { scene };
      }

      return withSceneChange(current, scene);
    }),
  resizeNodes: (updates) =>
    set((current) => {
      if (!updates.length) {
        return {};
      }

      const scene = cloneScene(current.scene);
      let changed = false;

      updates.forEach((update) => {
        const node = scene.nodes.find((item) => item.id === update.id);
        if (!node) {
          return;
        }

        const nextPosition = update.position;
        const nextSize = update.size;

        const differs =
          Math.abs(node.position.x - nextPosition.x) > 0.0001 ||
          Math.abs(node.position.y - nextPosition.y) > 0.0001 ||
          Math.abs(node.size.width - nextSize.width) > 0.0001 ||
          Math.abs(node.size.height - nextSize.height) > 0.0001;

        if (!differs) {
          return;
        }

        node.position = { ...nextPosition };
        node.size = { ...nextSize };
        changed = true;
      });

      if (!changed) {
        return {};
      }

      if (current.isTransaction) {
        return { scene };
      }

      return withSceneChange(current, scene);
    }),
  removeNode: (id) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      const before = scene.nodes.length;
      scene.nodes = scene.nodes.filter((node) => node.id !== id);
      scene.connectors = scene.connectors.filter(
        (connector) => connector.sourceId !== id && connector.targetId !== id
      );

      if (scene.nodes.length === before) {
        return {};
      }

      const next = withSceneChange(current, scene);

      return {
        ...next,
        selection: { nodeIds: [], connectorIds: [] },
        editingNodeId: current.editingNodeId === id ? null : current.editingNodeId
      };
    }),
  addConnector: (sourceId, targetId) => {
    if (sourceId === targetId) {
      return null;
    }

    const state = get();
    const existing = state.scene.connectors.find(
      (connector) =>
        connector.sourceId === sourceId && connector.targetId === targetId
    );
    if (existing) {
      return existing;
    }

    const connector: ConnectorModel = {
      id: nanoid(),
      mode: 'orthogonal',
      sourceId,
      targetId,
      style: { ...defaultConnectorStyle },
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    };

    set((current) => {
      const scene = cloneScene(current.scene);
      scene.connectors.push(connector);
      return {
        ...withSceneChange(current, scene),
        selection: { nodeIds: [], connectorIds: [connector.id] },
        tool: 'select',
        editingNodeId: null
      };
    });

    return connector;
  },
  updateConnector: (id, patch) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      const connector = scene.connectors.find((item) => item.id === id);
      if (!connector) {
        return {};
      }

      const { style, points, labelStyle, ...rest } = patch;

      if (points) {
        connector.points = points.map((point) => ({ ...point }));
      }
      if (style) {
        connector.style = { ...connector.style, ...style };
      }
      if (labelStyle !== undefined) {
        connector.labelStyle = labelStyle ? { ...labelStyle } : undefined;
      }

      Object.assign(connector, rest);

      return withSceneChange(current, scene);
    }),
  removeConnector: (id) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      const before = scene.connectors.length;
      scene.connectors = scene.connectors.filter((connector) => connector.id !== id);
      if (scene.connectors.length === before) {
        return {};
      }
      return {
        ...withSceneChange(current, scene),
        selection: { nodeIds: [], connectorIds: [] }
      };
    }),
  setSelection: (selection) =>
    set((state) => {
      const updates: Partial<SceneStoreState> = { selection };
      if (state.editingNodeId && !selection.nodeIds.includes(state.editingNodeId)) {
        updates.editingNodeId = null;
      }
      return updates;
    }),
  clearSelection: () =>
    set({ selection: { nodeIds: [], connectorIds: [] }, editingNodeId: null }),
  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
  toggleSnap: () =>
    set((state) => ({ snap: { ...state.snap, enabled: !state.snap.enabled } })),
  setSnapSettings: (patch) =>
    set((state) => ({ snap: { ...state.snap, ...patch } })),
  equalizeSpacing: (nodeIds, axis) =>
    set((current) => {
      if (nodeIds.length < 2) {
        return {};
      }

      const scene = cloneScene(current.scene);
      const nodes = nodeIds
        .map((id) => scene.nodes.find((node) => node.id === id))
        .filter((node): node is NodeModel => Boolean(node));
      if (nodes.length < 2) {
        return {};
      }

      const sorted = [...nodes].sort((a, b) =>
        axis === 'x' ? a.position.x - b.position.x : a.position.y - b.position.y
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const start = axis === 'x' ? first.position.x : first.position.y;
      const end =
        axis === 'x'
          ? last.position.x + last.size.width
          : last.position.y + last.size.height;
      const totalSpan = end - start;
      const occupied = sorted.reduce(
        (sum, node) => sum + (axis === 'x' ? node.size.width : node.size.height),
        0
      );
      const gapCount = sorted.length - 1;
      if (gapCount <= 0) {
        return {};
      }
      const spacing = Math.max(0, (totalSpan - occupied) / gapCount);

      let cursor = start;
      sorted.forEach((node) => {
        if (axis === 'x') {
          node.position.x = cursor;
          cursor += node.size.width + spacing;
        } else {
          node.position.y = cursor;
          cursor += node.size.height + spacing;
        }
      });

      return withSceneChange(current, scene);
    }),
  setShowMiniMap: (value) => set({ showMiniMap: value }),
  undo: () =>
    set((state) => {
      if (!state.history.past.length) {
        return {};
      }
      const past = [...state.history.past];
      const previous = past.pop()!;
      const future = [cloneScene(state.scene), ...state.history.future];
      return {
        scene: cloneScene(previous),
        history: { past, future },
        selection: { nodeIds: [], connectorIds: [] },
        isTransaction: false,
        editingNodeId: null
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.history.future.length) {
        return {};
      }
      const [next, ...rest] = state.history.future;
      const past = [...state.history.past, cloneScene(state.scene)];
      if (past.length > HISTORY_LIMIT) {
        past.shift();
      }
      return {
        scene: cloneScene(next),
        history: { past, future: rest },
        selection: { nodeIds: [], connectorIds: [] },
        isTransaction: false,
        editingNodeId: null
      };
    }),
  beginTransaction: () =>
    set((state) => {
      if (state.isTransaction) {
        return {};
      }
      const past = [...state.history.past, cloneScene(state.scene)];
      if (past.length > HISTORY_LIMIT) {
        past.shift();
      }
      return {
        history: { past, future: [] },
        isTransaction: true
      };
    }),
  endTransaction: () =>
    set((state) => (state.isTransaction ? { isTransaction: false } : {})),
  setTransform: (transform) => set({ transform }),
  setEditingNode: (nodeId) => set({ editingNodeId: nodeId }),
  applyNodeStyles: (nodeIds, patch) =>
    set((current) => {
      if (!nodeIds.length) {
        return {};
      }

      const scene = cloneScene(current.scene);
      let changed = false;

      scene.nodes.forEach((node) => {
        if (!nodeIds.includes(node.id)) {
          return;
        }

        if (patch.fill !== undefined && node.fill !== patch.fill) {
          node.fill = patch.fill;
          changed = true;
        }
        if (patch.fillOpacity !== undefined && node.fillOpacity !== patch.fillOpacity) {
          node.fillOpacity = Math.min(1, Math.max(0, patch.fillOpacity));
          changed = true;
        }
        if (patch.strokeColor !== undefined && node.stroke.color !== patch.strokeColor) {
          node.stroke = { ...node.stroke, color: patch.strokeColor };
          changed = true;
        }
        if (patch.strokeWidth !== undefined && node.stroke.width !== patch.strokeWidth) {
          node.stroke = { ...node.stroke, width: patch.strokeWidth };
          changed = true;
        }
        if (patch.fontSize !== undefined && node.fontSize !== patch.fontSize) {
          node.fontSize = patch.fontSize;
          changed = true;
        }
        if (patch.fontWeight !== undefined && node.fontWeight !== patch.fontWeight) {
          node.fontWeight = patch.fontWeight;
          changed = true;
        }
        if (patch.textAlign !== undefined && node.textAlign !== patch.textAlign) {
          node.textAlign = patch.textAlign;
          changed = true;
        }
      });

      if (!changed) {
        return {};
      }

      return withSceneChange(current, scene);
    }),
  setNodeText: (nodeId, text) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      const node = scene.nodes.find((item) => item.id === nodeId);
      if (!node) {
        return {};
      }

      const nextText = normalizeNodeText(text);
      if (node.text === nextText) {
        return {};
      }

      node.text = nextText;
      return withSceneChange(current, scene);
    }),
  setNodeShape: (nodeIds, shape) =>
    set((current) => {
      if (!nodeIds.length) {
        return {};
      }

      const scene = cloneScene(current.scene);
      let changed = false;

      scene.nodes.forEach((node) => {
        if (!nodeIds.includes(node.id)) {
          return;
        }

        if (node.shape === shape) {
          return;
        }

        node.shape = shape;
        if (shape === 'rounded-rectangle') {
          node.cornerRadius = node.cornerRadius ?? 24;
        } else if (shape !== 'rectangle') {
          node.cornerRadius = undefined;
        }
        changed = true;
      });

      if (!changed) {
        return {};
      }

      return withSceneChange(current, scene);
    }),
  setNodeLink: (nodeId, url) =>
    set((current) => {
      const scene = cloneScene(current.scene);
      const node = scene.nodes.find((item) => item.id === nodeId);
      if (!node) {
        return {};
      }

      const currentUrl = node.link?.url ?? null;
      const nextUrl = url ? url : null;
      if (currentUrl === nextUrl) {
        return {};
      }

      node.link = nextUrl ? { url: nextUrl } : undefined;
      return withSceneChange(current, scene);
    })
}));

export const selectScene = (state: SceneStore) => state.scene;
export const selectNodes = (state: SceneStore) => state.scene.nodes;
export const selectConnectors = (state: SceneStore) => state.scene.connectors;
export const selectSelection = (state: SceneStore) => state.selection;
export const selectTool = (state: SceneStore) => state.tool;
export const selectGridVisible = (state: SceneStore) => state.gridVisible;
export const selectSnapSettings = (state: SceneStore) => state.snap;
export const selectShowMiniMap = (state: SceneStore) => state.showMiniMap;
export const selectTransform = (state: SceneStore) => state.transform;
export const selectEditingNodeId = (state: SceneStore) => state.editingNodeId;
export const selectSceneBounds = (state: SceneStore, ids?: string[]) =>
  getSceneBounds(state.scene, ids);
export const selectNodeById = (id: string) => (state: SceneStore) =>
  getNodeById(state.scene, id);
export const selectCanUndo = (state: SceneStore) => state.history.past.length > 0;
export const selectCanRedo = (state: SceneStore) => state.history.future.length > 0;
