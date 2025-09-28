import { nanoid } from 'nanoid';
import { create } from 'zustand';
import {
  AttachedConnectorEndpoint,
  CanvasTransform,
  ConnectorEndpoint,
  ConnectorModel,
  ConnectorLabelStyle,
  NodeFontWeight,
  NodeKind,
  NodeModel,
  SceneContent,
  SelectionState,
  TextAlign,
  Tool,
  Vec2,
  isAttachedConnectorEndpoint
} from '../types/scene';
import {
  GRID_SIZE,
  cloneScene,
  createNodeModel,
  getNodeById,
  getSceneBounds,
  type CreateNodeOptions
} from '../utils/scene';
import { ensureHtmlContent } from '../utils/text';
import { cloneConnectorEndpoint, getConnectorPath } from '../utils/connector';

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
  textColor?: string;
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

export interface UpdateConnectorOptions {
  reroute?: boolean;
}

interface SceneStoreActions {
  setTool: (tool: Tool) => void;
  addNode: (type: NodeKind, position: Vec2, options?: CreateNodeOptions) => NodeModel;
  updateNode: (id: string, patch: Partial<NodeModel>) => void;
  moveNode: (id: string, position: Vec2) => void;
  batchMove: (ids: string[], delta: Vec2) => void;
  addEntities: (entities: { nodes: NodeModel[]; connectors: ConnectorModel[] }) => SelectionState;
  resizeNodes: (
    updates: Array<{ id: string; position: Vec2; size: { width: number; height: number } }>
  ) => void;
  removeNode: (id: string) => void;
  addConnector: (source: ConnectorEndpoint, target: ConnectorEndpoint) => ConnectorModel | null;
  updateConnector: (
    id: string,
    patch: Partial<ConnectorModel>,
    options?: UpdateConnectorOptions
  ) => void;
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
  replaceScene: (scene: SceneContent, options?: ReplaceSceneOptions) => void;
  resetScene: () => void;
}

export type SceneStore = SceneStoreState & SceneStoreActions;

export interface ReplaceSceneOptions {
  resetHistory?: boolean;
  resetTransform?: boolean;
}

const defaultConnectorCap = { shape: 'none', size: 14 } as const;

const defaultConnectorStyle: ConnectorModel['style'] = {
  stroke: '#e5e7eb',
  strokeWidth: 2,
  dashed: false,
  cornerRadius: 12,
  startCap: { ...defaultConnectorCap },
  endCap: { ...defaultConnectorCap }
};

const createDefaultConnectorStyle = (): ConnectorModel['style'] => ({
  ...defaultConnectorStyle,
  startCap: defaultConnectorStyle.startCap ? { ...defaultConnectorStyle.startCap } : undefined,
  endCap: defaultConnectorStyle.endCap ? { ...defaultConnectorStyle.endCap } : undefined
});

const defaultConnectorLabelStyle: ConnectorLabelStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#f8fafc',
  background: 'rgba(15,23,42,0.85)'
};

const createInitialScene = (): SceneContent => {
  const start = createNodeModel('circle', { x: -380, y: -140 }, { text: 'Start' });
  const collect = createNodeModel('rectangle', { x: -40, y: -180 }, { text: 'Collect Input' });
  const decision = createNodeModel('diamond', { x: 320, y: -200 }, { text: 'Valid?' });
  const done = createNodeModel('ellipse', { x: 700, y: -160 }, { text: 'Archive' });
  const review = createNodeModel('rectangle', { x: -40, y: 140 }, { text: 'Review Input' });
  const retry = createNodeModel('triangle', { x: -380, y: 120 }, { text: 'Retry Capture' });
  const notify = createNodeModel('ellipse', { x: 320, y: 160 }, { text: 'Notify Team' });

  const connectors: ConnectorModel[] = [
    {
      id: nanoid(),
      source: { nodeId: start.id, port: 'right' },
      target: { nodeId: collect.id, port: 'left' },
      style: createDefaultConnectorStyle(),
      label: 'Begin',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: collect.id, port: 'right' },
      target: { nodeId: decision.id, port: 'left' },
      style: createDefaultConnectorStyle(),
      label: 'Forward',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: decision.id, port: 'right' },
      target: { nodeId: done.id, port: 'left' },
      style: createDefaultConnectorStyle(),
      label: 'Yes',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: collect.id, port: 'bottom' },
      target: { nodeId: review.id, port: 'top' },
      style: createDefaultConnectorStyle(),
      label: 'Needs Review',
      labelPosition: 0.5,
      labelOffset: 22,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: review.id, port: 'left' },
      target: { nodeId: retry.id, port: 'right' },
      style: createDefaultConnectorStyle(),
      label: 'Rework',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: retry.id, port: 'top' },
      target: { nodeId: start.id, port: 'bottom' },
      style: createDefaultConnectorStyle(),
      label: 'Loop Back',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: decision.id, port: 'bottom' },
      target: { nodeId: notify.id, port: 'top' },
      style: createDefaultConnectorStyle(),
      label: 'No',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: notify.id, port: 'right' },
      target: { position: { x: 620, y: 220 } },
      style: createDefaultConnectorStyle(),
      label: 'Webhook',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    },
    {
      id: nanoid(),
      source: { nodeId: start.id, port: 'top' },
      target: { position: { x: -380, y: -360 } },
      style: createDefaultConnectorStyle(),
      label: 'Monitoring',
      labelPosition: 0.5,
      labelOffset: 18,
      labelStyle: { ...defaultConnectorLabelStyle }
    }
  ];

  return {
    nodes: [start, collect, decision, done, review, retry, notify],
    connectors
  };
};

const normalizeNodeText = (value: string) => ensureHtmlContent(value, 'Untitled');

const initialState: SceneStoreState = {
  scene: createInitialScene(),
  history: { past: [], future: [] },
  selection: { nodeIds: [], connectorIds: [] },
  tool: 'select',
  gridVisible: true,
  snap: {
    enabled: true,
    tolerance: 6,
    showDistanceLabels: false,
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
  addEntities: ({ nodes, connectors }) => {
    let selection: SelectionState = { nodeIds: [], connectorIds: [] };
    set((current) => {
      if (!nodes.length && !connectors.length) {
        return {};
      }

      const scene = cloneScene(current.scene);

      const addedNodeIds: string[] = [];
      nodes.forEach((node) => {
        const clone: NodeModel = {
          ...node,
          position: { ...node.position },
          size: { ...node.size },
          stroke: { ...node.stroke },
          link: node.link ? { ...node.link } : undefined,
          image: node.image ? { ...node.image } : undefined
        };
        scene.nodes.push(clone);
        addedNodeIds.push(clone.id);
      });

      const addedConnectorIds: string[] = [];
      connectors.forEach((connector) => {
        const nextConnector: ConnectorModel = {
          ...connector,
          source: cloneConnectorEndpoint(connector.source),
          target: cloneConnectorEndpoint(connector.target),
          style: { ...connector.style },
          labelStyle: connector.labelStyle ? { ...connector.labelStyle } : undefined,
          points: connector.points?.map((point) => ({ ...point }))
        };
        scene.connectors.push(nextConnector);
        addedConnectorIds.push(nextConnector.id);
      });

      selection = { nodeIds: addedNodeIds, connectorIds: addedConnectorIds };

      return {
        ...withSceneChange(current, scene),
        selection,
        tool: 'select',
        editingNodeId: null
      };
    });

    return selection;
  },
  addNode: (type, position, options) => {
    const state = get();
    const shouldSnapToGrid = state.snap.enabled && state.snap.snapToGrid && state.gridVisible;
    const snappedPosition = shouldSnapToGrid
      ? {
          x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
        }
      : position;

    const node = createNodeModel(type, snappedPosition, options);

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

      const { position, size, stroke, link, image, ...rest } = patch;

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
      if (image !== undefined) {
        node.image = image ? { ...image } : undefined;
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
      scene.connectors = scene.connectors.filter((connector) => {
        const sourceAttached = isAttachedConnectorEndpoint(connector.source);
        const targetAttached = isAttachedConnectorEndpoint(connector.target);
        const sourceMatches = sourceAttached && connector.source.nodeId === id;
        const targetMatches = targetAttached && connector.target.nodeId === id;
        return !sourceMatches && !targetMatches;
      });

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
  addConnector: (sourceEndpoint, targetEndpoint) => {
    const source = cloneConnectorEndpoint(sourceEndpoint);
    const target = cloneConnectorEndpoint(targetEndpoint);

    if (
      isAttachedConnectorEndpoint(source) &&
      isAttachedConnectorEndpoint(target) &&
      source.nodeId === target.nodeId &&
      source.port === target.port
    ) {
      return null;
    }

    const state = get();
    const existing = state.scene.connectors.find((connector) => {
      if (
        isAttachedConnectorEndpoint(source) &&
        isAttachedConnectorEndpoint(target) &&
        isAttachedConnectorEndpoint(connector.source) &&
        isAttachedConnectorEndpoint(connector.target)
      ) {
        return (
          connector.source.nodeId === source.nodeId &&
          connector.source.port === source.port &&
          connector.target.nodeId === target.nodeId &&
          connector.target.port === target.port
        );
      }
      return false;
    });

    if (existing) {
      return existing;
    }

      const connector: ConnectorModel = {
        id: nanoid(),
        source,
        target,
        style: createDefaultConnectorStyle(),
        labelPosition: 0.5,
        labelOffset: 18,
        labelStyle: { ...defaultConnectorLabelStyle }
      };

    set((current) => {
      const scene = cloneScene(current.scene);
      scene.connectors.push({
        ...connector,
        source: cloneConnectorEndpoint(connector.source),
        target: cloneConnectorEndpoint(connector.target)
      });
      return {
        ...withSceneChange(current, scene),
        selection: { nodeIds: [], connectorIds: [connector.id] },
        tool: 'select',
        editingNodeId: null
      };
    });

    return connector;
  },
  updateConnector: (id, patch, options) =>
    set((current) => {
      const { reroute = true } = options ?? {};
      const scene = cloneScene(current.scene);
      const index = scene.connectors.findIndex((item) => item.id === id);
      if (index === -1) {
        return {};
      }

      const existing = scene.connectors[index];
      const nextConnector: ConnectorModel = {
        ...existing,
        source: cloneConnectorEndpoint(existing.source),
        target: cloneConnectorEndpoint(existing.target),
        style: {
          ...existing.style,
          startCap: existing.style.startCap ? { ...existing.style.startCap } : undefined,
          endCap: existing.style.endCap ? { ...existing.style.endCap } : undefined
        },
        labelStyle: existing.labelStyle ? { ...existing.labelStyle } : undefined,
        points: existing.points?.map((point) => ({ ...point }))
      };

      const { style, points, labelStyle, source, target, ...rest } = patch;

      if (style) {
        const { startCap, endCap, ...restStyle } = style;
        const mergedStyle: ConnectorModel['style'] = {
          ...nextConnector.style,
          ...restStyle
        };
        if (startCap) {
          mergedStyle.startCap = {
            ...(nextConnector.style.startCap ?? { ...defaultConnectorCap }),
            ...startCap
          };
        } else if ('startCap' in style && !startCap) {
          mergedStyle.startCap = undefined;
        }
        if (endCap) {
          mergedStyle.endCap = {
            ...(nextConnector.style.endCap ?? { ...defaultConnectorCap }),
            ...endCap
          };
        } else if ('endCap' in style && !endCap) {
          mergedStyle.endCap = undefined;
        }
        nextConnector.style = mergedStyle;
      }
      if (labelStyle !== undefined) {
        nextConnector.labelStyle = labelStyle ? { ...labelStyle } : undefined;
      }
      if (source) {
        nextConnector.source = cloneConnectorEndpoint(source);
      }
      if (target) {
        nextConnector.target = cloneConnectorEndpoint(target);
      }
      if (points) {
        nextConnector.points = points.map((point) => ({ ...point }));
      }

      Object.assign(nextConnector, rest);

      if (points && reroute) {
        const sourceNode = isAttachedConnectorEndpoint(nextConnector.source)
          ? scene.nodes.find((node) => node.id === nextConnector.source.nodeId)
          : undefined;
        const targetNode = isAttachedConnectorEndpoint(nextConnector.target)
          ? scene.nodes.find((node) => node.id === nextConnector.target.nodeId)
          : undefined;
        const geometry = getConnectorPath(nextConnector, sourceNode, targetNode, scene.nodes);
        nextConnector.points = geometry.waypoints.map((point) => ({ ...point }));
      }

      scene.connectors[index] = nextConnector;

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
        if (patch.textColor !== undefined && node.textColor !== patch.textColor) {
          node.textColor = patch.textColor;
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

        if (node.shape === 'image' && shape !== 'image') {
          node.image = undefined;
        }

        node.shape = shape;
        node.cornerRadius = undefined;
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
    }),
  replaceScene: (scene, options) =>
    set(() => {
      const { resetHistory = true, resetTransform = true } = options ?? {};
      const updates: Partial<SceneStoreState> = {
        scene: cloneScene(scene),
        selection: { nodeIds: [], connectorIds: [] },
        tool: 'select',
        editingNodeId: null,
        isTransaction: false
      };

      if (resetHistory) {
        updates.history = { past: [], future: [] };
      }

      if (resetTransform) {
        updates.transform = { x: 0, y: 0, scale: 1 };
      }

      return updates;
    }),
  resetScene: () =>
    set(() => ({
      scene: createInitialScene(),
      history: { past: [], future: [] },
      selection: { nodeIds: [], connectorIds: [] },
      tool: 'select',
      editingNodeId: null,
      isTransaction: false,
      transform: { x: 0, y: 0, scale: 1 }
    }))
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
