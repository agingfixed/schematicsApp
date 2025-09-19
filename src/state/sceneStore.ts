import { nanoid } from 'nanoid';
import { create } from 'zustand';
import {
  CanvasTransform,
  ConnectorModel,
  NodeKind,
  NodeModel,
  SceneContent,
  SelectionState,
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

interface SceneStoreState {
  scene: SceneContent;
  history: SceneHistory;
  selection: SelectionState;
  tool: Tool;
  gridVisible: boolean;
  snapToGrid: boolean;
  showMiniMap: boolean;
  isTransaction: boolean;
  transform: CanvasTransform;
}

interface SceneStoreActions {
  setTool: (tool: Tool) => void;
  addNode: (type: NodeKind, position: Vec2) => NodeModel;
  updateNode: (id: string, patch: Partial<NodeModel>) => void;
  moveNode: (id: string, position: Vec2) => void;
  batchMove: (ids: string[], delta: Vec2) => void;
  removeNode: (id: string) => void;
  addConnector: (sourceId: string, targetId: string) => ConnectorModel | null;
  updateConnector: (id: string, patch: Partial<ConnectorModel>) => void;
  removeConnector: (id: string) => void;
  setSelection: (selection: SelectionState) => void;
  clearSelection: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setShowMiniMap: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  setTransform: (transform: CanvasTransform) => void;
}

export type SceneStore = SceneStoreState & SceneStoreActions;

const defaultConnectorStyle: ConnectorModel['style'] = {
  stroke: '#e5e7eb',
  strokeWidth: 2,
  arrowEnd: 'arrow',
  arrowStart: 'none'
};

const createInitialScene = (): SceneContent => {
  const start = createNodeModel('ellipse', { x: -380, y: -140 }, 'Start');
  const collect = createNodeModel('rectangle', { x: -40, y: -180 }, 'Collect Input');
  const decision = createNodeModel('diamond', { x: 320, y: -200 }, 'Valid?');
  const done = createNodeModel('rounded-rectangle', { x: 700, y: -160 }, 'Archive');

  const connectors: ConnectorModel[] = [
    {
      id: nanoid(),
      type: 'straight',
      sourceId: start.id,
      targetId: collect.id,
      style: { ...defaultConnectorStyle },
      label: 'Begin'
    },
    {
      id: nanoid(),
      type: 'straight',
      sourceId: collect.id,
      targetId: decision.id,
      style: { ...defaultConnectorStyle }
    },
    {
      id: nanoid(),
      type: 'straight',
      sourceId: decision.id,
      targetId: done.id,
      style: { ...defaultConnectorStyle },
      label: 'Yes'
    }
  ];

  return {
    nodes: [start, collect, decision, done],
    connectors
  };
};

const initialState: SceneStoreState = {
  scene: createInitialScene(),
  history: { past: [], future: [] },
  selection: { nodeIds: [], connectorIds: [] },
  tool: 'select',
  gridVisible: true,
  snapToGrid: true,
  showMiniMap: true,
  isTransaction: false,
  transform: { x: 0, y: 0, scale: 1 }
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
  setTool: (tool) => set({ tool }),
  addNode: (type, position) => {
    const state = get();
    const snappedPosition = state.snapToGrid
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
        tool: 'select'
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

      const { position, size, style, ...rest } = patch;

      if (position) {
        node.position = { ...node.position, ...position };
      }
      if (size) {
        node.size = { ...node.size, ...size };
      }
      if (style) {
        node.style = { ...node.style, ...style };
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
      if (current.snapToGrid) {
        node.position.x = Math.round(node.position.x / GRID_SIZE) * GRID_SIZE;
        node.position.y = Math.round(node.position.y / GRID_SIZE) * GRID_SIZE;
      }

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
          if (current.snapToGrid) {
            node.position.x = Math.round(node.position.x / GRID_SIZE) * GRID_SIZE;
            node.position.y = Math.round(node.position.y / GRID_SIZE) * GRID_SIZE;
          }
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

      return {
        ...withSceneChange(current, scene),
        selection: { nodeIds: [], connectorIds: [] }
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
      type: 'straight',
      sourceId,
      targetId,
      style: { ...defaultConnectorStyle }
    };

    set((current) => {
      const scene = cloneScene(current.scene);
      scene.connectors.push(connector);
      return {
        ...withSceneChange(current, scene),
        selection: { nodeIds: [], connectorIds: [connector.id] },
        tool: 'select'
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

      const { style, points, ...rest } = patch;

      if (points) {
        connector.points = points.map((point) => ({ ...point }));
      }
      if (style) {
        connector.style = { ...connector.style, ...style };
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
  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: { nodeIds: [], connectorIds: [] } }),
  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
  toggleSnap: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
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
        isTransaction: false
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
        isTransaction: false
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
  setTransform: (transform) => set({ transform })
}));

export const selectScene = (state: SceneStore) => state.scene;
export const selectNodes = (state: SceneStore) => state.scene.nodes;
export const selectConnectors = (state: SceneStore) => state.scene.connectors;
export const selectSelection = (state: SceneStore) => state.selection;
export const selectTool = (state: SceneStore) => state.tool;
export const selectGridVisible = (state: SceneStore) => state.gridVisible;
export const selectSnapToGrid = (state: SceneStore) => state.snapToGrid;
export const selectShowMiniMap = (state: SceneStore) => state.showMiniMap;
export const selectTransform = (state: SceneStore) => state.transform;
export const selectSceneBounds = (state: SceneStore, ids?: string[]) =>
  getSceneBounds(state.scene, ids);
export const selectNodeById = (id: string) => (state: SceneStore) =>
  getNodeById(state.scene, id);
export const selectCanUndo = (state: SceneStore) => state.history.past.length > 0;
export const selectCanRedo = (state: SceneStore) => state.history.future.length > 0;
