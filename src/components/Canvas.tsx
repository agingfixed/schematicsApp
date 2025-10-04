import React, {
  ForwardedRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { nanoid } from 'nanoid';
import {
  AttachedConnectorEndpoint,
  CanvasTransform,
  CardinalConnectorPort,
  ConnectorEndpoint,
  ConnectorEndpointCap,
  ConnectorModel,
  NodeKind,
  NodeModel,
  SelectionState,
  Tool,
  Vec2,
  cloneConnectorEndpointStyles,
  isAttachedConnectorEndpoint
} from '../types/scene';
import {
  GRID_SIZE,
  boundsToSize,
  centerOfBounds,
  expandBounds,
  getNodeById,
  getSceneBounds,
  getDefaultNodeSize,
  screenToWorld,
  worldToScreen,
  Bounds
} from '../utils/scene';
import {
  findClosestPointOnPolyline,
  CARDINAL_PORTS,
  cloneConnectorEndpoint,
  buildRoundedConnectorPath,
  getConnectorPath,
  getConnectorPortAnchor,
  getConnectorPortDirection,
  getConnectorPortPositions,
  getConnectorStubLength,
  getNearestConnectorPort,
  getNormalAtRatio,
  getPointAtRatio,
  measurePolyline,
  tidyOrthogonalWaypoints
} from '../utils/connector';
import {
  selectConnectors,
  selectEditingNodeId,
  selectGridVisible,
  selectNodes,
  selectSelection,
  selectSnapSettings,
  selectTool,
  useSceneStore
} from '../state/sceneStore';
import {
  ActiveSnapMatches,
  DistanceBadge as SnapDistanceBadge,
  SmartSelectionHandle,
  SmartSelectionResult,
  SnapMatch,
  computeDistanceBadges,
  computeSmartGuides,
  detectSmartSelection,
  getNodeRectInfo,
  translateBounds
} from '../utils/snap';
import { DiagramNode } from './DiagramNode';
import { DiagramConnector, DiagramConnectorEndpoints } from './DiagramConnector';
import { SelectionToolbar } from './SelectionToolbar';
import { ConnectorToolbar } from './ConnectorToolbar';
import { ConnectorTextToolbar } from './ConnectorTextToolbar';
import { InlineTextEditor, InlineTextEditorHandle } from './InlineTextEditor';
import { useCommands } from '../state/commands';
import { useFloatingMenuStore } from '../state/menuStore';
import { CaretPoint } from '../utils/text';
import { ensureHttpProtocol } from '../utils/url';
import { fetchImageAsDataUrl, getImageDimensions, readFileAsDataUrl } from '../utils/image';
import '../styles/canvas.css';

// Allow users to comfortably view very large boards by permitting deeper zoom-outs.
const MIN_SCALE = 0.05;
const MAX_SCALE = 4;
const ZOOM_FACTOR = 1.1;
const FIT_PADDING = 160;
const DOUBLE_CLICK_DELAY = 320;
const DEFAULT_CONNECTOR_LABEL_POSITION = 0.5;
const DEFAULT_CONNECTOR_LABEL_DISTANCE = 18;
const MAX_CONNECTOR_LABEL_DISTANCE = 60;
const DEFAULT_CONNECTOR_LABEL_STYLE = {
  fontSize: 14,
  fontWeight: 600 as const,
  color: '#f8fafc',
  background: 'rgba(15,23,42,0.85)'
};
const IMAGE_MAX_DIMENSION = 520;
const IMAGE_MIN_DIMENSION = 64;
const PORT_VISIBILITY_DISTANCE = 72;
const PORT_SNAP_DISTANCE = 12;
const PORT_TIE_DISTANCE = 0.25;
const PORT_PRIORITY: Record<CardinalConnectorPort, number> = {
  top: 0,
  right: 1,
  bottom: 2,
  left: 3
};

const PENDING_CONNECTOR_STYLE: ConnectorModel['style'] = {
  stroke: '#e5e7eb',
  strokeWidth: 2,
  dashed: false,
  cornerRadius: 12
};

const MARQUEE_ACTIVATION_THRESHOLD = 2;
const PASTE_OFFSET_STEP = 32;

const NODE_CREATION_TOOLS: ReadonlyArray<NodeKind> = [
  'rectangle',
  'circle',
  'ellipse',
  'triangle',
  'diamond',
  'text',
  'link',
  'image'
] as const;

const isNodeCreationTool = (tool: Tool): tool is NodeKind =>
  NODE_CREATION_TOOLS.includes(tool as NodeKind);

const clampConnectorLabelOffset = (value: number) =>
  Math.max(-MAX_CONNECTOR_LABEL_DISTANCE, Math.min(MAX_CONNECTOR_LABEL_DISTANCE, value));

const clampConnectorLabelRadius = (value: number) =>
  Math.max(0, Math.min(MAX_CONNECTOR_LABEL_DISTANCE, Math.abs(value)));

const CONNECTOR_SNAP_RATIO = 0.5;

interface ConnectorSnapTargets {
  x: number[];
  y: number[];
}

const createConnectorSnapTargets = (
  connectors: ConnectorModel[],
  nodes: NodeModel[],
  excludeId: string
): ConnectorSnapTargets => {
  const xValues = new Set<number>();
  const yValues = new Set<number>();

  connectors.forEach((candidate) => {
    if (candidate.id === excludeId) {
      return;
    }

    const geometry = getConnectorPath(candidate, undefined, undefined, nodes);
    geometry.points.forEach((point) => {
      if (Number.isFinite(point.x)) {
        xValues.add(point.x);
      }
      if (Number.isFinite(point.y)) {
        yValues.add(point.y);
      }
    });
  });

  return { x: Array.from(xValues), y: Array.from(yValues) };
};

const findClosestSnapValue = (
  value: number,
  candidates: number[],
  tolerance: number
): number | null => {
  let closest: number | null = null;
  let bestDistance = tolerance + 1;

  candidates.forEach((candidate) => {
    if (!Number.isFinite(candidate)) {
      return;
    }
    const distance = Math.abs(candidate - value);
    if (distance <= tolerance && distance < bestDistance) {
      closest = candidate;
      bestDistance = distance;
    }
  });

  return closest;
};

export interface CanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomToHundred: () => void;
  focusOn: (worldPoint: Vec2, scale?: number) => void;
  getTransform: () => CanvasTransform;
  setTransform: (transform: CanvasTransform) => void;
}

export interface CanvasProps {
  onTransformChange?: (transform: CanvasTransform) => void;
  onViewportChange?: (viewport: { width: number; height: number }) => void;
}

interface DragState {
  pointerId: number;
  nodeIds: string[];
  initialWorld: Vec2;
  initialBounds: Bounds;
  translation: Vec2;
  activeSnap: ActiveSnapMatches;
  axisLock: 'x' | 'y' | null;
  moved: boolean;
}

interface SpacingDragState {
  pointerId: number;
  axis: 'x' | 'y';
  handle: SmartSelectionHandle;
  originWorld: Vec2;
  translation: number;
}

interface ConnectionSnap {
  nodeId: string;
  port: CardinalConnectorPort;
  position: Vec2;
}

type PendingConnection =
  | {
      type: 'create';
      source: AttachedConnectorEndpoint;
      worldPoint: Vec2;
      snapPort: ConnectionSnap | null;
      bypassSnap: boolean;
    }
  | {
      type: 'reconnect';
      connectorId: string;
      endpoint: 'source' | 'target';
      original: ConnectorEndpoint;
      fixed: ConnectorEndpoint;
      worldPoint: Vec2;
      snapPort: ConnectionSnap | null;
      bypassSnap: boolean;
    };

type ConnectorSegmentAxis = 'horizontal' | 'vertical';

interface MarqueeState {
  pointerId: number;
  originWorld: Vec2;
  currentWorld: Vec2;
  originScreen: Vec2;
  currentScreen: Vec2;
  additive: boolean;
  baseSelection: SelectionState;
  active: boolean;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ClipboardPayload {
  nodes: NodeModel[];
  connectors: ConnectorModel[];
}

const cloneNodeForClipboard = (node: NodeModel): NodeModel => ({
  ...node,
  position: { ...node.position },
  size: { ...node.size },
  stroke: { ...node.stroke },
  link: node.link ? { ...node.link } : undefined
});

const cloneConnectorStyle = (style: ConnectorModel['style']): ConnectorModel['style'] => ({
  ...style
});

const cloneConnectorForClipboard = (connector: ConnectorModel): ConnectorModel => ({
  ...connector,
  source: cloneConnectorEndpoint(connector.source),
  target: cloneConnectorEndpoint(connector.target),
  style: cloneConnectorStyle(connector.style),
  labelStyle: connector.labelStyle ? { ...connector.labelStyle } : undefined,
  points: connector.points?.map((point) => ({ ...point }))
});

const pointInBounds = (point: Vec2, bounds: { minX: number; minY: number; maxX: number; maxY: number }) =>
  point.x >= bounds.minX &&
  point.x <= bounds.maxX &&
  point.y >= bounds.minY &&
  point.y <= bounds.maxY;

const getEndpointPosition = (
  endpoint: ConnectorEndpoint,
  nodes: NodeModel[]
): Vec2 | null => {
  if (isAttachedConnectorEndpoint(endpoint)) {
    const node = nodes.find((item) => item.id === endpoint.nodeId);
    if (!node) {
      return null;
    }
    return getConnectorPortAnchor(node, endpoint.port);
  }
  if ('position' in endpoint) {
    return { ...endpoint.position };
  }
  return null;
};

interface ConnectorEditStateBase {
  pointerId: number;
  connectorId: string;
  start: Vec2;
  end: Vec2;
  baseWaypoints: Vec2[];
  originalWaypoints: Vec2[];
  previewWaypoints: Vec2[];
  previewPoints: Vec2[];
  snapTargets: ConnectorSnapTargets;
  moved: boolean;
}

interface ConnectorSegmentDragState extends ConnectorEditStateBase {
  type: 'segment';
  segmentIndex: number;
  axis: ConnectorSegmentAxis;
  grabOffset: number;
}

interface ConnectorJointDragState extends ConnectorEditStateBase {
  type: 'joint';
  waypointIndex: number;
  grabOffset: Vec2;
  prevAxis: ConnectorSegmentAxis | null;
  nextAxis: ConnectorSegmentAxis | null;
  origin: Vec2;
  axisLock: ConnectorSegmentAxis | null;
}

type ConnectorEditState = ConnectorSegmentDragState | ConnectorJointDragState;

const inferSegmentAxis = (start: Vec2, end: Vec2): ConnectorSegmentAxis => {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx >= dy) {
    return 'horizontal';
  }
  return 'vertical';
};

interface ConnectorLabelDragState {
  pointerId: number;
  connectorId: string;
  originalPosition: number;
  originalOffsetValue: number;
  originalRadius: number;
  originalAngle: number;
  lastPosition: number;
  lastRadius: number;
  lastAngle: number;
  moved: boolean;
  hadAngle: boolean;
}

type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

interface PortHint {
  nodeId: string;
  port: CardinalConnectorPort;
  position: Vec2;
  screen: Vec2;
  active: boolean;
}

interface ResizeState {
  pointerId: number;
  handle: ResizeHandle;
  initialBounds: Bounds;
  anchor: Vec2;
  center: Vec2;
  nodes: Array<{
    id: string;
    position: Vec2;
    size: { width: number; height: number };
  }>;
  initialWidth: number;
  initialHeight: number;
}

const RESIZE_HANDLES: Array<{ key: ResizeHandle; x: number; y: number; cursor: string }> = [
  { key: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { key: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { key: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { key: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { key: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { key: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { key: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { key: 'w', x: 0, y: 0.5, cursor: 'ew-resize' }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const CanvasComponent = (
  { onTransformChange, onViewportChange }: CanvasProps,
  ref: ForwardedRef<CanvasHandle>
) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransformState] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStateRef = useRef<{ pointerId: number; last: { x: number; y: number } } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const spacingDragStateRef = useRef<SpacingDragState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const connectionPointerRef = useRef<number | null>(null);
  const initialFitDoneRef = useRef(false);
  const connectorEditRef = useRef<ConnectorEditState | null>(null);
  const marqueeStateRef = useRef<MarqueeState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const lastPasteOffsetRef = useRef<Vec2>({ x: 0, y: 0 });
  const releasePointerCapture = useCallback((pointerId: number) => {
    const element = containerRef.current;
    if (element && element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  }, []);

  const nodes = useSceneStore(selectNodes);
  const connectors = useSceneStore(selectConnectors);
  const selection = useSceneStore(selectSelection);
  const tool = useSceneStore(selectTool);
  const gridVisible = useSceneStore(selectGridVisible);
  const snapSettings = useSceneStore(selectSnapSettings);
  const editingNodeId = useSceneStore(selectEditingNodeId);
  const setSelection = useSceneStore((state) => state.setSelection);
  const clearSelection = useSceneStore((state) => state.clearSelection);
  const addNode = useSceneStore((state) => state.addNode);
  const addEntities = useSceneStore((state) => state.addEntities);
  const removeNode = useSceneStore((state) => state.removeNode);
  const beginTransaction = useSceneStore((state) => state.beginTransaction);
  const endTransaction = useSceneStore((state) => state.endTransaction);
  const batchMove = useSceneStore((state) => state.batchMove);
  const resizeNodes = useSceneStore((state) => state.resizeNodes);
  const addConnector = useSceneStore((state) => state.addConnector);
  const removeConnector = useSceneStore((state) => state.removeConnector);
  const updateConnector = useSceneStore((state) => state.updateConnector);
  const setGlobalTransform = useSceneStore((state) => state.setTransform);
  const setEditingNode = useSceneStore((state) => state.setEditingNode);
  const equalizeSpacing = useSceneStore((state) => state.equalizeSpacing);
  const setNodeLink = useSceneStore((state) => state.setNodeLink);
  const { applyStyles, setText } = useCommands();

  const selectedNodeIds = selection.nodeIds;
  const selectedConnectorIds = selection.connectorIds;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [lastPointerPosition, setLastPointerPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [activeGuides, setActiveGuides] = useState<SnapMatch[]>([]);
  const [distanceBadges, setDistanceBadges] = useState<SnapDistanceBadge[]>([]);
  const [smartSelectionState, setSmartSelectionState] = useState<SmartSelectionResult | null>(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [connectorCommitSignal, setConnectorCommitSignal] = useState(0);
  const [connectorCancelSignal, setConnectorCancelSignal] = useState(0);
  const [portHints, setPortHints] = useState<PortHint[]>([]);
  const inlineEditorRef = useRef<InlineTextEditorHandle | null>(null);
  const editingEntryPointRef = useRef<{ x: number; y: number } | null>(null);
  const pendingTextEditRef = useRef<{
    nodeId: string;
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const linkActivationRef = useRef<{
    nodeId: string;
    pointerId: number;
    url: string;
    moved: boolean;
  } | null>(null);
  const linkActivationTimerRef = useRef<number | null>(null);
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null);
  const lastConnectorClickRef = useRef<{ connectorId: string; time: number } | null>(null);
  const pendingConnectorEditRef = useRef<{
    connectorId: string;
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const connectorLabelDragRef = useRef<ConnectorLabelDragState | null>(null);
  const connectorLabelToolbarInteractionRef = useRef(false);
  const selectionToolbarInteractionRef = useRef(false);
  const connectorLabelEntryPointRef = useRef<CaretPoint | null>(null);
  const clearFloatingMenuPlacement = useFloatingMenuStore((state) => state.clearSharedPlacement);
  const hadFloatingMenuRef = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImagePointRef = useRef<Vec2 | null>(null);

  const isConnectorLabelToolbarInteracting = useCallback(
    () => connectorLabelToolbarInteractionRef.current,
    []
  );

  const setConnectorLabelToolbarInteracting = useCallback((active: boolean) => {
    connectorLabelToolbarInteractionRef.current = active;
  }, []);

  const isSelectionToolbarInteracting = useCallback(
    () => selectionToolbarInteractionRef.current,
    []
  );

  const setSelectionToolbarInteracting = useCallback((active: boolean) => {
    selectionToolbarInteractionRef.current = active;
  }, []);

  useEffect(() => {
    if (tool !== 'image') {
      pendingImagePointRef.current = null;
    }
  }, [tool]);

  const clearLinkActivationTimer = useCallback(() => {
    if (linkActivationTimerRef.current !== null) {
      window.clearTimeout(linkActivationTimerRef.current);
      linkActivationTimerRef.current = null;
    }
  }, []);

  const hasConnectorBetween = useCallback(
    (source: AttachedConnectorEndpoint, target: AttachedConnectorEndpoint, ignoreId?: string) =>
      connectors.some((connector) => {
        if (connector.id === ignoreId) {
          return false;
        }
        if (
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
      }),
    [connectors]
  );

  const resolveEndpointNode = useCallback(
    (endpoint: ConnectorEndpoint): NodeModel | undefined => {
      if (!isAttachedConnectorEndpoint(endpoint)) {
        return undefined;
      }
      return getNodeById({ nodes, connectors }, endpoint.nodeId);
    },
    [nodes, connectors]
  );

  const completePendingConnection = useCallback(
    (pending: PendingConnection, dropEndpoint: ConnectorEndpoint) => {
      if (pending.type === 'create') {
        const source = pending.source;
        if (
          isAttachedConnectorEndpoint(dropEndpoint) &&
          dropEndpoint.nodeId === source.nodeId
        ) {
          return;
        }
        if (
          isAttachedConnectorEndpoint(source) &&
          isAttachedConnectorEndpoint(dropEndpoint) &&
          hasConnectorBetween(source, dropEndpoint)
        ) {
          return;
        }
        addConnector(source, dropEndpoint);
        return;
      }

      const connector = connectors.find((item) => item.id === pending.connectorId);
      if (!connector) {
        return;
      }
      const otherEndpoint = pending.endpoint === 'source' ? connector.target : connector.source;
      const skipSelfLoop =
        isAttachedConnectorEndpoint(otherEndpoint) &&
        isAttachedConnectorEndpoint(dropEndpoint) &&
        otherEndpoint.nodeId === dropEndpoint.nodeId;

      if (skipSelfLoop) {
        return;
      }

      const duplicate =
        isAttachedConnectorEndpoint(dropEndpoint) &&
        isAttachedConnectorEndpoint(otherEndpoint) &&
        (pending.endpoint === 'source'
          ? hasConnectorBetween(dropEndpoint, otherEndpoint, connector.id)
          : hasConnectorBetween(otherEndpoint, dropEndpoint, connector.id));

      if (duplicate) {
        return;
      }

      const patch: Partial<ConnectorModel> =
        pending.endpoint === 'source'
          ? { source: dropEndpoint, points: [] }
          : { target: dropEndpoint, points: [] };
      updateConnector(connector.id, patch);
      setSelection({ nodeIds: [], connectorIds: [connector.id] });
    },
    [addConnector, connectors, hasConnectorBetween, setSelection, updateConnector]
  );

  const updateMarqueeSelection = useCallback(
    (marquee: MarqueeState) => {
      const bounds = {
        minX: Math.min(marquee.originWorld.x, marquee.currentWorld.x),
        minY: Math.min(marquee.originWorld.y, marquee.currentWorld.y),
        maxX: Math.max(marquee.originWorld.x, marquee.currentWorld.x),
        maxY: Math.max(marquee.originWorld.y, marquee.currentWorld.y)
      };

      const insideNodeIds = nodes
        .filter(
          (node) =>
            node.position.x >= bounds.minX &&
            node.position.y >= bounds.minY &&
            node.position.x + node.size.width <= bounds.maxX &&
            node.position.y + node.size.height <= bounds.maxY
        )
        .map((node) => node.id);

      const combinedNodeIds = marquee.additive
        ? Array.from(new Set([...marquee.baseSelection.nodeIds, ...insideNodeIds]))
        : insideNodeIds;

      const combinedNodeSet = new Set(combinedNodeIds);

      const insideConnectorIds: string[] = [];
      connectors.forEach((connector) => {
        const sourceAttached = isAttachedConnectorEndpoint(connector.source);
        const targetAttached = isAttachedConnectorEndpoint(connector.target);

        if (sourceAttached && targetAttached) {
          if (
            combinedNodeSet.has(connector.source.nodeId) &&
            combinedNodeSet.has(connector.target.nodeId)
          ) {
            insideConnectorIds.push(connector.id);
            return;
          }
        }

        const sourcePoint = getEndpointPosition(connector.source, nodes);
        const targetPoint = getEndpointPosition(connector.target, nodes);
        if (
          sourcePoint &&
          targetPoint &&
          pointInBounds(sourcePoint, bounds) &&
          pointInBounds(targetPoint, bounds)
        ) {
          insideConnectorIds.push(connector.id);
        }
      });

      const combinedConnectorIds = marquee.additive
        ? Array.from(new Set([...marquee.baseSelection.connectorIds, ...insideConnectorIds]))
        : insideConnectorIds;

      setSelection({ nodeIds: combinedNodeIds, connectorIds: combinedConnectorIds });
    },
    [connectors, nodes, setSelection]
  );

  const copySelection = useCallback(() => {
    if (!selectedNodeIds.length && !selectedConnectorIds.length) {
      clipboardRef.current = null;
      return false;
    }

    const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
    const selectedNodes = selectedNodeIds
      .map((id) => nodeLookup.get(id))
      .filter((node): node is NodeModel => Boolean(node));

    const connectorLookup = new Map(connectors.map((connector) => [connector.id, connector]));
    const selectedConnectors = selectedConnectorIds
      .map((id) => connectorLookup.get(id))
      .filter((connector): connector is ConnectorModel => Boolean(connector));

    if (!selectedNodes.length && !selectedConnectors.length) {
      clipboardRef.current = null;
      return false;
    }

    clipboardRef.current = {
      nodes: selectedNodes.map(cloneNodeForClipboard),
      connectors: selectedConnectors.map(cloneConnectorForClipboard)
    };
    lastPasteOffsetRef.current = { x: 0, y: 0 };
    return true;
  }, [connectors, nodes, selectedConnectorIds, selectedNodeIds]);

  const getRelativePoint = (event: PointerEvent | React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const getWorldPoint = (event: PointerEvent | React.PointerEvent): Vec2 => {
    const relative = getRelativePoint(event);
    return screenToWorld(relative.x, relative.y, transform);
  };

  const selectedNode = useMemo(() => {
    if (selectedNodeIds.length !== 1 || selectedConnectorIds.length > 0) {
      return null;
    }
    return nodes.find((node) => node.id === selectedNodeIds[0]) ?? null;
  }, [nodes, selectedNodeIds, selectedConnectorIds.length]);

  useEffect(() => {
    return () => {
      clearLinkActivationTimer();
    };
  }, [clearLinkActivationTimer]);

  const selectedConnector = useMemo(() => {
    if (selectedConnectorIds.length !== 1 || selectedNodeIds.length > 0) {
      return null;
    }
    return connectors.find((item) => item.id === selectedConnectorIds[0]) ?? null;
  }, [connectors, selectedConnectorIds, selectedNodeIds.length]);

  useEffect(() => {
    const hasMenu = Boolean(selectedConnector) || Boolean(selectedNode);
    if (!hasMenu && hadFloatingMenuRef.current) {
      clearFloatingMenuPlacement();
    }
    hadFloatingMenuRef.current = hasMenu;
  }, [selectedConnector, selectedNode, clearFloatingMenuPlacement]);

  const createImageNode = useCallback(
    async (dataUrl: string, worldPoint: Vec2) => {
      const { width, height } = await getImageDimensions(dataUrl);
      const fitted = fitImageWithinBounds(width, height);
      const position = {
        x: worldPoint.x - fitted.width / 2,
        y: worldPoint.y - fitted.height / 2
      };

      addNode('image', position, {
        size: fitted,
        image: { src: dataUrl, naturalWidth: width, naturalHeight: height }
      });
    },
    [addNode]
  );

  const getPasteWorldPoint = useCallback((): Vec2 => {
    if (lastPointerPosition) {
      return screenToWorld(lastPointerPosition.x, lastPointerPosition.y, transform);
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      return screenToWorld(rect.width / 2, rect.height / 2, transform);
    }

    return screenToWorld(0, 0, transform);
  }, [lastPointerPosition, transform]);

  type ClipboardImageCandidate = {
    source: string;
    confidence: 'high' | 'medium' | 'low';
  };

  const extractImageSourceFromClipboard = useCallback(
    (clipboardData: DataTransfer): ClipboardImageCandidate | null => {
      const html = clipboardData.getData('text/html');
      if (html) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const img = doc.querySelector('img');
          if (img?.src) {
            return { source: img.src, confidence: 'high' };
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to parse clipboard HTML', error);
        }
      }

      const uriList = clipboardData.getData('text/uri-list');
      if (uriList) {
        const candidate = uriList.split('\n')[0]?.trim();
        if (candidate) {
          return { source: candidate, confidence: 'medium' };
        }
      }

      const text = clipboardData.getData('text/plain');
      if (text) {
        return { source: text.trim(), confidence: 'low' };
      }

      return null;
    },
    []
  );

  const isImageSource = useCallback(({ confidence, source }: ClipboardImageCandidate): boolean => {
    if (!source) {
      return false;
    }

    if (source.startsWith('data:image/')) {
      return true;
    }

    if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('blob:')) {
      if (confidence === 'high') {
        return true;
      }

      try {
        const url = new URL(source);
        return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(url.pathname);
      } catch (error) {
        return false;
      }
    }

    return false;
  }, []);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isEditable =
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (isEditable) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        const handled = pasteClipboard();
        if (handled) {
          event.preventDefault();
        }
        return;
      }

      const imageItem = Array.from(clipboardData.items).find(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      );
      const file = imageItem?.getAsFile();
      const imageSource = !file ? extractImageSourceFromClipboard(clipboardData) : null;

      if (file || (imageSource && isImageSource(imageSource))) {
        event.preventDefault();

        try {
          const worldPoint = getPasteWorldPoint();
          let dataUrl: string;

          if (file) {
            dataUrl = await readFileAsDataUrl(file);
          } else if (imageSource?.source.startsWith('data:image/')) {
            dataUrl = imageSource.source;
          } else if (imageSource) {
            dataUrl = await fetchImageAsDataUrl(imageSource.source);
          } else {
            return;
          }

          await createImageNode(dataUrl, worldPoint);
          return;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to paste image', error);
        }
      }

      const handled = pasteClipboard();
      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [
    createImageNode,
    extractImageSourceFromClipboard,
    getPasteWorldPoint,
    isImageSource,
    pasteClipboard
  ]);

  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [nodes, selectedNodeIds]
  );

  const selectionBounds = useMemo(() => {
    if (!selectedNodes.length) {
      return null;
    }
    return selectedNodes.reduce<Bounds>(
      (acc, current) => ({
        minX: Math.min(acc.minX, current.position.x),
        minY: Math.min(acc.minY, current.position.y),
        maxX: Math.max(acc.maxX, current.position.x + current.size.width),
        maxY: Math.max(acc.maxY, current.position.y + current.size.height)
      }),
      {
        minX: selectedNodes[0].position.x,
        minY: selectedNodes[0].position.y,
        maxX: selectedNodes[0].position.x + selectedNodes[0].size.width,
        maxY: selectedNodes[0].position.y + selectedNodes[0].size.height
      }
    );
  }, [selectedNodes]);

  const selectionFrame = useMemo(() => {
    if (!selectionBounds) {
      return null;
    }
    const topLeft = worldToScreen(
      { x: selectionBounds.minX, y: selectionBounds.minY },
      transform
    );
    const bottomRight = worldToScreen(
      { x: selectionBounds.maxX, y: selectionBounds.maxY },
      transform
    );
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
      centerX: topLeft.x + (bottomRight.x - topLeft.x) / 2,
      centerY: topLeft.y + (bottomRight.y - topLeft.y) / 2
    };
  }, [selectionBounds, transform]);

  const connectorToolbarAnchor = useMemo(() => {
    if (!selectedConnector) {
      return null;
    }
    const sourceNode = resolveEndpointNode(selectedConnector.source);
    const targetNode = resolveEndpointNode(selectedConnector.target);
    const geometry = getConnectorPath(selectedConnector, sourceNode, targetNode, nodes);
    if (!geometry.points.length) {
      return null;
    }
    const { point } = getPointAtRatio(geometry.points, 0.5);
    const screenPoint = worldToScreen(point, transform);
    return { x: screenPoint.x, y: screenPoint.y };
  }, [selectedConnector, resolveEndpointNode, transform]);

  const connectorLabelToolbarAnchor = useMemo(() => {
    if (!selectedConnector) {
      return null;
    }
    const sourceNode = resolveEndpointNode(selectedConnector.source);
    const targetNode = resolveEndpointNode(selectedConnector.target);
    const geometry = getConnectorPath(selectedConnector, sourceNode, targetNode, nodes);
    if (!geometry.points.length) {
      return null;
    }
    const position = selectedConnector.labelPosition ?? DEFAULT_CONNECTOR_LABEL_POSITION;
    const rawOffset = selectedConnector.labelOffset ?? DEFAULT_CONNECTOR_LABEL_DISTANCE;
    const hasCustomAngle = typeof selectedConnector.labelAngle === 'number';
    const offset = hasCustomAngle
      ? clampConnectorLabelRadius(rawOffset)
      : clampConnectorLabelOffset(rawOffset);
    const angle = hasCustomAngle ? selectedConnector.labelAngle ?? 0 : undefined;
    const { point, segmentIndex } = getPointAtRatio(geometry.points, position);
    const labelCenter = hasCustomAngle && typeof angle === 'number'
      ? {
          x: point.x + Math.cos(angle) * offset,
          y: point.y + Math.sin(angle) * offset
        }
      : (() => {
          const normal = getNormalAtRatio(geometry.points, segmentIndex);
          return {
            x: point.x + normal.x * offset,
            y: point.y + normal.y * offset
          };
        })();
    const screenPoint = worldToScreen(labelCenter, transform);
    return { x: screenPoint.x, y: screenPoint.y };
  }, [selectedConnector, resolveEndpointNode, transform]);

  const showResizeFrame = useMemo(
    () => tool === 'select' && !isPanning && selectedNodes.length > 0 && !editingNodeId,
    [tool, isPanning, selectedNodes.length, editingNodeId]
  );

  const editingNode = useMemo(() => {
    if (!editingNodeId) {
      return null;
    }
    return nodes.find((node) => node.id === editingNodeId) ?? null;
  }, [nodes, editingNodeId]);

  const editorNode = editingNode ?? selectedNode;

  useEffect(() => {
    if (!snapSettings.enabled || !snapSettings.showSpacingHandles || tool !== 'select') {
      setSmartSelectionState(null);
      return;
    }
    const selectionNodes = nodes.filter((node) => selectedNodeIds.includes(node.id));
    if (selectionNodes.length < 3) {
      setSmartSelectionState(null);
      return;
    }
    const rects = selectionNodes.map(getNodeRectInfo);
    const result = detectSmartSelection(rects);
    setSmartSelectionState(result);
  }, [
    nodes,
    selectedNodeIds,
    snapSettings.enabled,
    snapSettings.showSpacingHandles,
    tool
  ]);

  useEffect(() => {
    if (!snapSettings.enabled) {
      setActiveGuides([]);
      setDistanceBadges([]);
    }
  }, [snapSettings.enabled]);

  useEffect(() => {
    if (!snapSettings.showDistanceLabels) {
      setDistanceBadges([]);
    }
  }, [snapSettings.showDistanceLabels]);

  const toolbarAnchor = useMemo(() => {
    if (!selectedNode) {
      return null;
    }
    const topLeft = worldToScreen(selectedNode.position, transform);
    const bottomRight = worldToScreen(
      {
        x: selectedNode.position.x + selectedNode.size.width,
        y: selectedNode.position.y + selectedNode.size.height
      },
      transform
    );
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }, [selectedNode, transform]);

  const editorBounds = useMemo(() => {
    if (!editorNode) {
      return null;
    }
    const paddingX = 12;
    const paddingTop = 8;
    const paddingBottom = 12;
    const topLeft = worldToScreen(
      {
        x: editorNode.position.x + paddingX,
        y: editorNode.position.y + paddingTop
      },
      transform
    );
    const bottomRight = worldToScreen(
      {
        x: editorNode.position.x + editorNode.size.width - paddingX,
        y: editorNode.position.y + editorNode.size.height - paddingBottom
      },
      transform
    );
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: Math.max(24, bottomRight.x - topLeft.x),
      height: Math.max(24, bottomRight.y - topLeft.y)
    };
  }, [editorNode, transform]);

  const guideLines = useMemo(
    () =>
      activeGuides.map((guide) => ({
        id: `${guide.axis}-${guide.edge}-${guide.target}-${guide.neighborId ?? 'none'}`,
        type: guide.type,
        axis: guide.axis,
        start: worldToScreen(guide.line.start, transform),
        end: worldToScreen(guide.line.end, transform)
      })),
    [activeGuides, transform]
  );

  const badgeScreens = useMemo(
    () =>
      distanceBadges.map((badge) => ({
        ...badge,
        screen: worldToScreen(badge.position, transform)
      })),
    [distanceBadges, transform]
  );

  const spacingHandles = useMemo(() => {
    if (!smartSelectionState) {
      return [] as Array<{ handle: SmartSelectionHandle; screen: Vec2 }>;
    }
    return smartSelectionState.handles.map((handle) => ({
      handle,
      screen: worldToScreen(handle.position, transform)
    }));
  }, [smartSelectionState, transform]);

  const editingEntryPoint = editingNodeId ? editingEntryPointRef.current : null;

  const commitEditingIfNeeded = useCallback(() => {
    if (editingConnectorId) {
      setConnectorCommitSignal((value) => value + 1);
    }
    if (editingNodeId) {
      inlineEditorRef.current?.commit();
    }
  }, [editingConnectorId, editingNodeId]);

  const pasteClipboard = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard || (!clipboard.nodes.length && !clipboard.connectors.length)) {
      return false;
    }

    commitEditingIfNeeded();

    lastPasteOffsetRef.current = {
      x: lastPasteOffsetRef.current.x + PASTE_OFFSET_STEP,
      y: lastPasteOffsetRef.current.y + PASTE_OFFSET_STEP
    };
    const offset = lastPasteOffsetRef.current;

    const nodeIdMap = new Map<string, string>();
    const newNodes = clipboard.nodes.map((node) => {
      const id = nanoid();
      nodeIdMap.set(node.id, id);
      const cloned = cloneNodeForClipboard(node);
      cloned.id = id;
      cloned.position = {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y
      };
      return cloned;
    });

    const remapEndpoint = (endpoint: ConnectorEndpoint): ConnectorEndpoint | null => {
      if (isAttachedConnectorEndpoint(endpoint)) {
        const mappedId = nodeIdMap.get(endpoint.nodeId);
        return { nodeId: mappedId ?? endpoint.nodeId, port: endpoint.port };
      }
      if ('position' in endpoint) {
        return {
          position: {
            x: endpoint.position.x + offset.x,
            y: endpoint.position.y + offset.y
          }
        };
      }
      return null;
    };

    const newConnectors: ConnectorModel[] = [];
    clipboard.connectors.forEach((connector) => {
      const nextSource = remapEndpoint(connector.source);
      const nextTarget = remapEndpoint(connector.target);
      if (!nextSource || !nextTarget) {
        return;
      }
      const cloned = cloneConnectorForClipboard(connector);
      cloned.id = nanoid();
      cloned.source = nextSource;
      cloned.target = nextTarget;
      cloned.points = cloned.points?.map((point) => ({
        x: point.x + offset.x,
        y: point.y + offset.y
      }));
      newConnectors.push(cloned);
    });

    const selectionResult = addEntities({ nodes: newNodes, connectors: newConnectors });
    return Boolean(selectionResult.nodeIds.length || selectionResult.connectorIds.length);
  }, [addEntities, commitEditingIfNeeded]);

  const beginTextEditing = useCallback(
    (nodeId: string, point?: { x: number; y: number }) => {
      clearLinkActivationTimer();
      editingEntryPointRef.current = point ?? null;
      pendingTextEditRef.current = null;
      setEditingNode(nodeId);
    },
    [clearLinkActivationTimer, setEditingNode]
  );

  const handleTextCommit = useCallback(
    (value: string, metadata?: { linkUrl?: string }) => {
      if (editingNode) {
        setText(editingNode.id, value);
        if (editingNode.shape === 'link') {
          const normalizedUrl = ensureHttpProtocol(metadata?.linkUrl ?? '');
          setNodeLink(editingNode.id, normalizedUrl ? normalizedUrl : null);
        }
      }
      editingEntryPointRef.current = null;
      setEditingNode(null);
    },
    [editingNode, setNodeLink, setText, setEditingNode]
  );

  const handleTextCancel = useCallback(() => {
    editingEntryPointRef.current = null;
    setEditingNode(null);
  }, [setEditingNode]);

  const handleImageFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const worldPoint = pendingImagePointRef.current;
      const file = event.target.files?.[0] ?? null;
      event.target.value = '';

      if (!worldPoint || !file) {
        pendingImagePointRef.current = null;
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        await createImageNode(dataUrl, worldPoint);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to create image node', error);
      } finally {
        pendingImagePointRef.current = null;
      }
    },
    [createImageNode]
  );

  const handleConnectorLabelCommit = useCallback(
    (connectorId: string, value: string) => {
      updateConnector(connectorId, { label: value.trim().length ? value : undefined });
      setEditingConnectorId((current) => (current === connectorId ? null : current));
      setConnectorLabelToolbarInteracting(false);
      connectorLabelEntryPointRef.current = null;
    },
    [setConnectorLabelToolbarInteracting, updateConnector]
  );

  const handleConnectorLabelCancel = useCallback(() => {
    setConnectorLabelToolbarInteracting(false);
    setEditingConnectorId(null);
    connectorLabelEntryPointRef.current = null;
  }, [setConnectorLabelToolbarInteracting]);

  const handleConnectorLabelToolbarClose = useCallback(() => {
    handleConnectorLabelCancel();
    clearSelection();
  }, [handleConnectorLabelCancel, clearSelection]);

  const handleConnectorRequestLabelEdit = useCallback(
    (connectorId: string, entryPoint?: CaretPoint) => {
      connectorLabelEntryPointRef.current = entryPoint ?? null;
      if (editingConnectorId === connectorId) {
        return;
      }
      commitEditingIfNeeded();
      setSelection({ nodeIds: [], connectorIds: [connectorId] });
      setConnectorLabelToolbarInteracting(false);
      setEditingConnectorId(connectorId);
    },
    [
      commitEditingIfNeeded,
      editingConnectorId,
      setConnectorLabelToolbarInteracting,
      setSelection
    ]
  );

  const handleConnectorStyleChange = useCallback(
    (connector: ConnectorModel, patch: Partial<ConnectorModel['style']>) => {
      updateConnector(connector.id, { style: patch });
    },
    [updateConnector]
  );

  const handleConnectorEndpointStyleChange = useCallback(
    (connector: ConnectorModel, endpoint: 'start' | 'end', patch: Partial<ConnectorEndpointCap>) => {
      const styles = cloneConnectorEndpointStyles(connector.endpointStyles);
      if (endpoint === 'start') {
        styles.start = { ...styles.start, ...patch };
      } else {
        styles.end = { ...styles.end, ...patch };
      }
      updateConnector(connector.id, { endpointStyles: styles });
    },
    [updateConnector]
  );

  const handleConnectorLabelStyleChange = useCallback(
    (connector: ConnectorModel, style: ConnectorModel['labelStyle']) => {
      const merged = { ...DEFAULT_CONNECTOR_LABEL_STYLE, ...(style ?? {}) };
      updateConnector(connector.id, { labelStyle: merged });
    },
    [updateConnector]
  );

  useEffect(() => {
    setGlobalTransform(transform);
    onTransformChange?.(transform);
  }, [transform, onTransformChange, setGlobalTransform]);

  useEffect(() => {
    if (!pendingConnection) {
      setPortHints([]);
    }
  }, [pendingConnection]);

  useEffect(() => {
    if (editingConnectorId && !selectedConnectorIds.includes(editingConnectorId)) {
      setConnectorCommitSignal((value) => value + 1);
    }
  }, [editingConnectorId, selectedConnectorIds]);

  useEffect(() => {
    if (editingConnectorId && tool !== 'select') {
      setConnectorCommitSignal((value) => value + 1);
    }
  }, [editingConnectorId, tool]);

  useEffect(() => {
    if (!editingConnectorId) {
      connectorLabelEntryPointRef.current = null;
    }
  }, [editingConnectorId]);

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setViewport({ width, height });
        onViewportChange?.({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onViewportChange]);

  useEffect(() => {
    if (initialFitDoneRef.current) {
      return;
    }
    if (!viewport.width || !viewport.height) {
      return;
    }
    if (!nodes.length) {
      return;
    }

    const bounds = getSceneBounds({ nodes, connectors }, undefined);
    if (!bounds) {
      return;
    }

    const transformForFit = createTransformToFit(bounds, viewport);
    if (transformForFit) {
      setTransformState(transformForFit);
      initialFitDoneRef.current = true;
    }
  }, [viewport, nodes, connectors]);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? 1 : -1;
    const factor = direction > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
    const relative = getRelativePoint(event);
    zoomAtPoint(relative, factor);
  };

  const zoomAtPoint = (point: { x: number; y: number }, factor: number) => {
    setTransformState((previous) => {
      const nextScale = clamp(previous.scale * factor, MIN_SCALE, MAX_SCALE);
      const worldX = (point.x - previous.x) / previous.scale;
      const worldY = (point.y - previous.y) / previous.scale;
      const nextX = point.x - worldX * nextScale;
      const nextY = point.y - worldY * nextScale;
      return { x: nextX, y: nextY, scale: nextScale };
    });
  };

  const zoomToFit = () => {
    if (!viewport.width || !viewport.height) {
      return;
    }
    const bounds = getSceneBounds({ nodes, connectors });
    if (!bounds) {
      return;
    }
    const expanded = expandBounds(bounds, FIT_PADDING);
    const transformForFit = createTransformToFit(expanded, viewport);
    if (transformForFit) {
      setTransformState(transformForFit);
    }
  };

  const zoomToHundred = () => {
    if (!viewport.width || !viewport.height) {
      return;
    }
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    setTransformState({ x: center.x, y: center.y, scale: 1 });
  };

  const focusOn = (worldPoint: Vec2, scale?: number) => {
    if (!viewport.width || !viewport.height) {
      return;
    }
    setTransformState((previous) => {
      const nextScale = scale ? clamp(scale, MIN_SCALE, MAX_SCALE) : previous.scale;
      return {
        scale: nextScale,
        x: viewport.width / 2 - worldPoint.x * nextScale,
        y: viewport.height / 2 - worldPoint.y * nextScale
      };
    });
  };

  const setTransform = (next: CanvasTransform) => {
    setTransformState({
      x: next.x,
      y: next.y,
      scale: clamp(next.scale, MIN_SCALE, MAX_SCALE)
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomAtPoint({ x: viewport.width / 2, y: viewport.height / 2 }, ZOOM_FACTOR),
      zoomOut: () => zoomAtPoint({ x: viewport.width / 2, y: viewport.height / 2 }, 1 / ZOOM_FACTOR),
      zoomToFit,
      zoomToHundred,
      focusOn,
      getTransform: () => transform,
      setTransform
    }),
    [viewport, transform]
  );

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    panStateRef.current = {
      pointerId: event.pointerId,
      last: { x: event.clientX, y: event.clientY }
    };
    setIsPanning(true);
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const updatePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const panState = panStateRef.current;
    if (!panState || panState.pointerId !== event.pointerId) {
      return false;
    }
    const { last } = panState;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    if (dx !== 0 || dy !== 0) {
      setTransformState((previous) => ({
        x: previous.x + dx,
        y: previous.y + dy,
        scale: previous.scale
      }));
    }
    panStateRef.current = {
      pointerId: event.pointerId,
      last: { x: event.clientX, y: event.clientY }
    };
    return true;
  }, []);

  const continueNodeDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return false;
      }

      pendingTextEditRef.current = null;
      const worldPoint = getWorldPoint(event);
      let translation = {
        x: worldPoint.x - dragState.initialWorld.x,
        y: worldPoint.y - dragState.initialWorld.y
      };

      if (event.shiftKey) {
        const axis =
          dragState.axisLock ??
          (Math.abs(translation.x) >= Math.abs(translation.y) ? 'x' : 'y');
        translation =
          axis === 'x' ? { ...translation, y: 0 } : { ...translation, x: 0 };
        dragState.axisLock = axis;
      } else if (dragState.axisLock) {
        dragState.axisLock = null;
      }

      let appliedTranslation = { ...translation };
      let nextActiveSnap: ActiveSnapMatches = {};

      if (snapSettings.enabled && !event.altKey) {
        if (snapSettings.snapToGrid && gridVisible) {
          appliedTranslation = {
            x: Math.round(appliedTranslation.x / GRID_SIZE) * GRID_SIZE,
            y: Math.round(appliedTranslation.y / GRID_SIZE) * GRID_SIZE
          };
        }

        const movingRect = translateBounds(dragState.initialBounds, appliedTranslation);
        const otherRects = nodes
          .filter((node) => !dragState.nodeIds.includes(node.id))
          .map(getNodeRectInfo);
        const tolerance = snapSettings.tolerance / transform.scale;
        const guideResult = computeSmartGuides({
          movingRect,
          otherRects,
          tolerance,
          activeMatches: dragState.activeSnap,
          centerOnly: event.metaKey || event.ctrlKey
        });

        if (guideResult.matches.vertical) {
          appliedTranslation.x += guideResult.matches.vertical.delta;
        }
        if (guideResult.matches.horizontal) {
          appliedTranslation.y += guideResult.matches.horizontal.delta;
        }

        const snappedRect = translateBounds(dragState.initialBounds, appliedTranslation);

        nextActiveSnap = {
          vertical: guideResult.matches.vertical
            ? {
                axis: 'x',
                edge: guideResult.matches.vertical.edge,
                neighborEdge: guideResult.matches.vertical.neighborEdge,
                type: guideResult.matches.vertical.type,
                target: guideResult.matches.vertical.target,
                neighborId: guideResult.matches.vertical.neighborId
              }
            : undefined,
          horizontal: guideResult.matches.horizontal
            ? {
                axis: 'y',
                edge: guideResult.matches.horizontal.edge,
                neighborEdge: guideResult.matches.horizontal.neighborEdge,
                type: guideResult.matches.horizontal.type,
                target: guideResult.matches.horizontal.target,
                neighborId: guideResult.matches.horizontal.neighborId
              }
            : undefined
        };

        setActiveGuides(guideResult.guides);
        setDistanceBadges(
          snapSettings.showDistanceLabels
            ? computeDistanceBadges(snappedRect, otherRects)
            : []
        );
      } else {
        setActiveGuides([]);
        setDistanceBadges([]);
      }

      const delta = {
        x: appliedTranslation.x - dragState.translation.x,
        y: appliedTranslation.y - dragState.translation.y
      };

      if (Math.abs(delta.x) > 0.0001 || Math.abs(delta.y) > 0.0001) {
        batchMove(dragState.nodeIds, delta);
        dragState.moved = true;
        if (linkActivationRef.current && linkActivationRef.current.pointerId === event.pointerId) {
          linkActivationRef.current.moved = true;
        }
      }

      dragState.translation = appliedTranslation;
      dragState.activeSnap = nextActiveSnap;

      return true;
    },
    [batchMove, gridVisible, nodes, snapSettings, transform]
  );

  const continueConnectorLabelDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const labelDrag = connectorLabelDragRef.current;
      if (!labelDrag || labelDrag.pointerId !== event.pointerId) {
        return false;
      }

      const connector = connectors.find((item) => item.id === labelDrag.connectorId);
      if (!connector) {
        return false;
      }

      const sourceNode = resolveEndpointNode(connector.source);
      const targetNode = resolveEndpointNode(connector.target);
      const geometry = getConnectorPath(connector, sourceNode, targetNode, nodes);
      if (geometry.points.length < 2) {
        return false;
      }

      const worldPoint = getWorldPoint(event);
      const closest = findClosestPointOnPolyline(worldPoint, geometry.points);
      const measure = measurePolyline(geometry.points);
      const totalLength = measure.totalLength;
      if (totalLength <= 0) {
        return false;
      }

      const start = geometry.points[closest.index];
      const end = geometry.points[closest.index + 1] ?? start;
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      const localLength = Math.hypot(closest.point.x - start.x, closest.point.y - start.y);
      const segmentOffset = measure.segments[closest.index] ?? 0;
      let position = (segmentOffset + Math.min(localLength, segmentLength)) / totalLength;
      position = Math.max(0, Math.min(1, position));
      const delta = {
        x: worldPoint.x - closest.point.x,
        y: worldPoint.y - closest.point.y
      };
      const radius = clampConnectorLabelRadius(Math.hypot(delta.x, delta.y));
      let angle: number;
      if (radius < 1e-6) {
        angle = labelDrag.lastAngle ?? labelDrag.originalAngle;
      } else {
        angle = Math.atan2(delta.y, delta.x);
      }
      if (!Number.isFinite(angle)) {
        angle = labelDrag.lastAngle ?? labelDrag.originalAngle;
      }

      labelDrag.lastPosition = position;
      labelDrag.lastRadius = radius;
      labelDrag.lastAngle = angle;
      labelDrag.moved = true;

      updateConnector(connector.id, {
        labelPosition: position,
        labelOffset: radius,
        labelAngle: angle
      });

      return true;
    },
    [connectors, nodes, resolveEndpointNode, updateConnector]
  );

  const continueConnectorEdit = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const edit = connectorEditRef.current;
      if (!edit || edit.pointerId !== event.pointerId) {
        return false;
      }

      const worldPoint = getWorldPoint(event);
      const baseWaypoints = edit.baseWaypoints.map((point) => ({ ...point }));
      const path = [
        { ...edit.start },
        ...baseWaypoints.map((point) => ({ ...point })),
        { ...edit.end }
      ];

      edit.moved = true;

      const snapTargets = edit.snapTargets;
      const hasSnapTargets = snapTargets.x.length > 0 || snapTargets.y.length > 0;
      const snapTolerance =
        snapSettings.enabled &&
        !event.altKey &&
        hasSnapTargets &&
        snapSettings.tolerance > 0
          ? (snapSettings.tolerance * CONNECTOR_SNAP_RATIO) / Math.max(transform.scale, 1e-6)
          : 0;

      if (edit.type === 'segment') {
        const pointerValue = edit.axis === 'horizontal' ? worldPoint.y : worldPoint.x;
        let newValue = pointerValue - edit.grabOffset;
        const index = Math.max(0, Math.min(path.length - 2, edit.segmentIndex));
        if (index === 0 || index === path.length - 2) {
          return true;
        }
        if (snapTolerance > 0) {
          const candidates = edit.axis === 'horizontal' ? snapTargets.y : snapTargets.x;
          const snapped = findClosestSnapValue(newValue, candidates, snapTolerance);
          if (snapped !== null) {
            newValue = snapped;
          }
        }
        if (edit.axis === 'horizontal') {
          path[index] = { ...path[index], y: newValue };
          path[index + 1] = { ...path[index + 1], y: newValue };
        } else {
          path[index] = { ...path[index], x: newValue };
          path[index + 1] = { ...path[index + 1], x: newValue };
        }
      } else {
        const pathIndex = edit.waypointIndex + 1;
        if (!path[pathIndex]) {
          return true;
        }
        let point = {
          x: worldPoint.x - edit.grabOffset.x,
          y: worldPoint.y - edit.grabOffset.y
        };

        const origin = edit.origin;
        const allowHorizontal = edit.prevAxis === 'horizontal' || edit.nextAxis === 'horizontal';
        const allowVertical = edit.prevAxis === 'vertical' || edit.nextAxis === 'vertical';
        let lock = edit.axisLock;

        if (!lock) {
          if (allowHorizontal && !allowVertical) {
            lock = 'horizontal';
          } else if (!allowHorizontal && allowVertical) {
            lock = 'vertical';
          } else if (allowHorizontal && allowVertical) {
            const deltaX = Math.abs(point.x - origin.x);
            const deltaY = Math.abs(point.y - origin.y);
            lock = deltaX >= deltaY ? 'horizontal' : 'vertical';
          } else {
            const deltaX = Math.abs(point.x - origin.x);
            const deltaY = Math.abs(point.y - origin.y);
            lock = deltaX >= deltaY ? 'horizontal' : 'vertical';
          }
          edit.axisLock = lock;
        }

        if (lock === 'horizontal') {
          if (allowHorizontal) {
            point = { ...point, y: origin.y };
          } else if (allowVertical) {
            lock = 'vertical';
            edit.axisLock = lock;
            point = { ...point, x: origin.x };
          } else {
            point = { x: origin.x, y: origin.y };
          }
        } else if (lock === 'vertical') {
          if (allowVertical) {
            point = { ...point, x: origin.x };
          } else if (allowHorizontal) {
            lock = 'horizontal';
            edit.axisLock = lock;
            point = { ...point, y: origin.y };
          } else {
            point = { x: origin.x, y: origin.y };
          }
        }

        if (snapTolerance > 0) {
          if (lock !== 'vertical') {
            const snappedX = findClosestSnapValue(point.x, snapTargets.x, snapTolerance);
            if (snappedX !== null) {
              point = { ...point, x: snappedX };
            }
          }
          if (lock !== 'horizontal') {
            const snappedY = findClosestSnapValue(point.y, snapTargets.y, snapTolerance);
            if (snappedY !== null) {
              point = { ...point, y: snappedY };
            }
          }
        }

        const prev = path[pathIndex - 1];
        const next = path[pathIndex + 1];

        if (edit.prevAxis === 'horizontal') {
          if (pathIndex - 1 > 0) {
            path[pathIndex - 1] = { ...prev, y: point.y };
          } else {
            point.y = prev.y;
          }
        } else if (edit.prevAxis === 'vertical') {
          if (pathIndex - 1 > 0) {
            path[pathIndex - 1] = { ...prev, x: point.x };
          } else {
            point.x = prev.x;
          }
        }

        if (edit.nextAxis === 'horizontal') {
          if (pathIndex + 1 < path.length - 1) {
            path[pathIndex + 1] = { ...next, y: point.y };
          } else if (next) {
            point.y = next.y;
          }
        } else if (edit.nextAxis === 'vertical') {
          if (pathIndex + 1 < path.length - 1) {
            path[pathIndex + 1] = { ...next, x: point.x };
          } else if (next) {
            point.x = next.x;
          }
        }

        path[pathIndex] = point;
      }

      const startPoint = path[0];
      const endPoint = path[path.length - 1];
      const interior = path.slice(1, path.length - 1);
      const cleaned = tidyOrthogonalWaypoints(startPoint, interior, endPoint).map((point) => ({ ...point }));
      const previewPoints = [startPoint, ...cleaned, endPoint].map((point) => ({ ...point }));

      edit.previewWaypoints = cleaned;
      edit.previewPoints = previewPoints;

      updateConnector(edit.connectorId, { points: cleaned }, { reroute: false });

      return true;
    },
    [
      getWorldPoint,
      snapSettings.enabled,
      snapSettings.tolerance,
      transform.scale,
      updateConnector
    ]
  );

  const continuePendingConnection = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (connectionPointerRef.current !== event.pointerId) {
        return false;
      }

      const pending = pendingConnection;
      const worldPoint = getWorldPoint(event);
      const screenPoint = getRelativePoint(event);
      const hints: PortHint[] = [];
      let best: { hint: PortHint; distance: number; hovered: boolean } | null = null;
      const bypassSnap = event.metaKey || event.ctrlKey;

      if (pending && !bypassSnap) {
        for (const node of nodes) {
          if (pending.type === 'create' && node.id === pending.source.nodeId) {
            continue;
          }
          const positions = getConnectorPortPositions(node);
          const nodeHovered = hoveredNodeId === node.id;
          for (const portKey of CARDINAL_PORTS) {
            const position = positions[portKey];
            const screen = worldToScreen(position, transform);
            const dx = screen.x - screenPoint.x;
            const dy = screen.y - screenPoint.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= PORT_VISIBILITY_DISTANCE) {
              const hint: PortHint = {
                nodeId: node.id,
                port: portKey,
                position,
                screen,
                active: false
              };
              hints.push(hint);
              if (!best || distance < best.distance - PORT_TIE_DISTANCE) {
                best = { hint, distance, hovered: nodeHovered };
              } else if (best && Math.abs(distance - best.distance) <= PORT_TIE_DISTANCE) {
                const currentHovered = nodeHovered;
                const bestHovered = best.hovered;
                if (currentHovered && !bestHovered) {
                  best = { hint, distance, hovered: currentHovered };
                } else if (currentHovered === bestHovered) {
                  const currentPriority = PORT_PRIORITY[portKey];
                  const bestPriority = PORT_PRIORITY[best.hint.port];
                  if (currentPriority < bestPriority) {
                    best = { hint, distance, hovered: currentHovered };
                  }
                }
              }
            }
          }
        }
      }

      let activeHint: PortHint | null = null;
      if (!bypassSnap && best && best.distance <= PORT_SNAP_DISTANCE) {
        activeHint = { ...best.hint, active: true };
      }

      const normalizedHints = hints.map((hint) => ({
        ...hint,
        active: Boolean(activeHint && hint.nodeId === activeHint.nodeId && hint.port === activeHint.port)
      }));

      setPortHints(normalizedHints);
      const nextWorld = activeHint ? activeHint.position : worldPoint;

      setPendingConnection((current) =>
        current
          ? {
              ...current,
              worldPoint: nextWorld,
              snapPort: activeHint
                ? { nodeId: activeHint.nodeId, port: activeHint.port, position: activeHint.position }
                : null,
              bypassSnap
            }
          : current
      );

      return true;
    },
    [hoveredNodeId, nodes, pendingConnection, transform]
  );

  const finalizeResizeDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) {
        return null;
      }
      resizeStateRef.current = null;
      endTransaction();
      releasePointerCapture(event.pointerId);
      return true;
    },
    [endTransaction, releasePointerCapture]
  );

  const finalizeMarquee = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const marquee = marqueeStateRef.current;
      if (!marquee || marquee.pointerId !== event.pointerId) {
        return null;
      }

      if (marquee.active) {
        updateMarqueeSelection(marquee);
      } else if (marquee.additive) {
        setSelection(marquee.baseSelection);
      } else {
        setSelection({ nodeIds: [], connectorIds: [] });
      }

      marqueeStateRef.current = null;
      setMarqueeRect(null);
      releasePointerCapture(event.pointerId);
      return marquee.active;
    },
    [releasePointerCapture, setSelection, updateMarqueeSelection]
  );

  const finalizePan = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId) {
        return null;
      }
      panStateRef.current = null;
      setIsPanning(false);
      releasePointerCapture(event.pointerId);
      return false;
    },
    [releasePointerCapture, setIsPanning]
  );

  const finalizeNodeDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return null;
      }
      setActiveGuides([]);
      setDistanceBadges([]);
      dragStateRef.current = null;
      endTransaction();
      releasePointerCapture(event.pointerId);
      return false;
    },
    [endTransaction, releasePointerCapture]
  );

  const finalizeSpacingDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = spacingDragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return null;
      }
      spacingDragStateRef.current = null;
      endTransaction();
      setActiveGuides([]);
      setDistanceBadges([]);
      releasePointerCapture(event.pointerId);
      return false;
    },
    [endTransaction, releasePointerCapture]
  );

  const finalizeConnectorEdit = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const edit = connectorEditRef.current;
      if (!edit || edit.pointerId !== event.pointerId) {
        return null;
      }
      connectorEditRef.current = null;

      let nextPoints: Vec2[];
      if (edit.moved) {
        const preview = edit.previewWaypoints.length
          ? edit.previewWaypoints
          : edit.baseWaypoints.map((point) => ({ ...point }));
        nextPoints = tidyOrthogonalWaypoints(edit.start, preview, edit.end).map((point) => ({ ...point }));
      } else {
        nextPoints = edit.originalWaypoints.map((point) => ({ ...point }));
      }

      updateConnector(edit.connectorId, { points: nextPoints }, { reroute: false });
      endTransaction();
      releasePointerCapture(edit.pointerId);
      return edit.moved;
    },
    [endTransaction, releasePointerCapture, updateConnector]
  );

  const finalizeConnectorLabelDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = connectorLabelDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return null;
      }
      connectorLabelDragRef.current = null;
      const nextPosition = drag.moved ? drag.lastPosition : drag.originalPosition;
      const nextRadius = drag.moved ? drag.lastRadius : drag.originalRadius;
      const nextAngle = drag.moved ? drag.lastAngle : drag.originalAngle;
      const patch: Partial<ConnectorModel> = {
        labelPosition: nextPosition,
        labelOffset: drag.moved ? nextRadius : drag.originalOffsetValue
      };
      if (drag.moved || drag.hadAngle) {
        patch.labelAngle = nextAngle;
      }
      updateConnector(drag.connectorId, patch);
      endTransaction();
      releasePointerCapture(event.pointerId);
      return drag.moved;
    },
    [endTransaction, releasePointerCapture, updateConnector]
  );

  const finalizeConnectionPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (connectionPointerRef.current !== event.pointerId) {
        return null;
      }
      const pending = pendingConnection;
      if (pending) {
        const dropPoint = getWorldPoint(event);
        const dropEndpoint =
          !pending.bypassSnap && pending.snapPort
            ? { nodeId: pending.snapPort.nodeId, port: pending.snapPort.port }
            : { position: dropPoint };
        completePendingConnection(pending, dropEndpoint);
      }
      setPendingConnection(null);
      setPortHints([]);
      connectionPointerRef.current = null;
      releasePointerCapture(event.pointerId);
      return true;
    },
    [completePendingConnection, pendingConnection, releasePointerCapture]
  );

  const handleBackgroundPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    pendingTextEditRef.current = null;
    lastClickRef.current = null;

    if (tool === 'pan' || event.button === 1 || event.button === 2) {
      beginPan(event);
      return;
    }

    if (event.button !== 0) {
      return;
    }

    commitEditingIfNeeded();

    if (tool === 'select') {
      const selectionSnapshot = useSceneStore.getState().selection;
      const additive = event.shiftKey;
      if (!additive) {
        setSelection({ nodeIds: [], connectorIds: [] });
      }
      const worldPoint = getWorldPoint(event);
      const screenPoint = getRelativePoint(event);
      marqueeStateRef.current = {
        pointerId: event.pointerId,
        originWorld: worldPoint,
        currentWorld: worldPoint,
        originScreen: screenPoint,
        currentScreen: screenPoint,
        additive,
        baseSelection: additive ? selectionSnapshot : { nodeIds: [], connectorIds: [] },
        active: false
      };
      setMarqueeRect(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === 'connector') {
      return;
    }

    if (tool === 'image') {
      const worldPoint = getWorldPoint(event);
      pendingImagePointRef.current = worldPoint;
      const input = imageFileInputRef.current;
      if (input) {
        input.value = '';
        window.requestAnimationFrame(() => input.click());
      }
      return;
    }

    const worldPoint = getWorldPoint(event);
    const { width, height } = getDefaultSizeForTool(tool);
    const position = {
      x: worldPoint.x - width / 2,
      y: worldPoint.y - height / 2
    };
    if (isNodeCreationTool(tool)) {
      addNode(tool, position);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (resizeState && resizeState.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      updateResizeDrag(event, resizeState);
      return;
    }

    const marquee = marqueeStateRef.current;
    if (marquee && marquee.pointerId === event.pointerId) {
      const screenPoint = getRelativePoint(event);
      const worldPoint = getWorldPoint(event);
      marquee.currentWorld = worldPoint;
      marquee.currentScreen = screenPoint;

      const deltaX = screenPoint.x - marquee.originScreen.x;
      const deltaY = screenPoint.y - marquee.originScreen.y;
      const shouldActivate =
        marquee.active ||
        Math.abs(deltaX) > MARQUEE_ACTIVATION_THRESHOLD ||
        Math.abs(deltaY) > MARQUEE_ACTIVATION_THRESHOLD;

      if (shouldActivate) {
        marquee.active = true;
        event.preventDefault();
        event.stopPropagation();
        setMarqueeRect({
          left: Math.min(marquee.originScreen.x, screenPoint.x),
          top: Math.min(marquee.originScreen.y, screenPoint.y),
          width: Math.abs(deltaX),
          height: Math.abs(deltaY)
        });
        updateMarqueeSelection(marquee);
      }
      return;
    }

    if (updatePan(event)) {
      return;
    }

    if (continueNodeDrag(event)) {
      return;
    }

    if (pendingConnectorEditRef.current?.pointerId === event.pointerId) {
      pendingConnectorEditRef.current = null;
    }

    if (continueConnectorLabelDrag(event)) {
      return;
    }

    if (continueConnectorEdit(event)) {
      return;
    }

    continuePendingConnection(event);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    let textEditRequest: { nodeId: string; clientX: number; clientY: number } | null = null;
    const pending = pendingTextEditRef.current;
    if (pending && pending.pointerId === event.pointerId) {
      const drag = dragStateRef.current;
      const moved = drag && drag.pointerId === event.pointerId ? drag.moved : false;
      if (!moved && tool === 'select') {
        textEditRequest = {
          nodeId: pending.nodeId,
          clientX: pending.clientX,
          clientY: pending.clientY
        };
      }
      pendingTextEditRef.current = null;
    }

    const linkActivation =
      linkActivationRef.current && linkActivationRef.current.pointerId === event.pointerId
        ? { ...linkActivationRef.current }
        : null;
    if (linkActivationRef.current && linkActivationRef.current.pointerId === event.pointerId) {
      linkActivationRef.current = null;
    }

    let connectorEditRequest: { connectorId: string; entryPoint: CaretPoint | null } | null = null;
    const pendingConnector = pendingConnectorEditRef.current;
    if (pendingConnector && pendingConnector.pointerId === event.pointerId) {
      const connectorEdit = connectorEditRef.current;
      const labelDrag = connectorLabelDragRef.current;
      const movedConnector =
        connectorEdit && connectorEdit.pointerId === event.pointerId ? connectorEdit.moved : false;
      const movedLabel =
        labelDrag && labelDrag.pointerId === event.pointerId ? labelDrag.moved : false;
      if (!movedConnector && !movedLabel && tool === 'select') {
        connectorEditRequest = {
          connectorId: pendingConnector.connectorId,
          entryPoint: { x: pendingConnector.clientX, y: pendingConnector.clientY }
        };
      }
      pendingConnectorEditRef.current = null;
    }

    let handled = false;
    const finalizers = [
      finalizeMarquee,
      finalizeResizeDrag,
      finalizePan,
      finalizeNodeDrag,
      finalizeSpacingDrag,
      finalizeConnectorEdit,
      finalizeConnectorLabelDrag,
      finalizeConnectionPointer
    ];

    for (const finalize of finalizers) {
      if (handled) {
        break;
      }
      const result = finalize(event);
      if (result !== null) {
        handled = result;
      }
    }

    if (!handled && connectorEditRequest) {
      setSelection({ nodeIds: [], connectorIds: [connectorEditRequest.connectorId] });
      setConnectorLabelToolbarInteracting(false);
      handleConnectorRequestLabelEdit(
        connectorEditRequest.connectorId,
        connectorEditRequest.entryPoint ?? undefined
      );
      handled = true;
    }

    if (!handled && textEditRequest) {
      const node = nodes.find((item) => item.id === textEditRequest.nodeId);
      if (node) {
        setSelection({ nodeIds: [node.id], connectorIds: [] });
        beginTextEditing(node.id, {
          x: textEditRequest.clientX,
          y: textEditRequest.clientY
        });
        handled = true;
        clearLinkActivationTimer();
      }
    }

    if (linkActivation) {
      clearLinkActivationTimer();
    }

    if (!handled && linkActivation && tool === 'select') {
      if (!linkActivation.moved) {
        const targetNode = nodes.find((item) => item.id === linkActivation.nodeId);
        const normalizedUrl = ensureHttpProtocol(targetNode?.link?.url ?? linkActivation.url ?? '');
        if (
          targetNode?.shape === 'link' &&
          normalizedUrl &&
          normalizedUrl !== (targetNode.link?.url ?? '')
        ) {
          setNodeLink(targetNode.id, normalizedUrl);
        }
        if (normalizedUrl) {
          linkActivationTimerRef.current = window.setTimeout(() => {
            window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
            linkActivationTimerRef.current = null;
          }, DOUBLE_CLICK_DELAY);
        }
      }
    }
  };

  const handleNodePointerDown = (event: React.PointerEvent, node: NodeModel) => {
    setLastPointerPosition(getRelativePoint(event));
    clearLinkActivationTimer();
    const isLinkNode = node.shape === 'link';
    linkActivationRef.current = null;
    if (tool === 'connector') {
      if (event.button !== 0) {
        return;
      }
      pendingTextEditRef.current = null;
      event.stopPropagation();
      event.preventDefault();
      const worldPoint = getWorldPoint(event);
      const targetElement = event.target as Element | null;
      const requestedPort = (targetElement?.getAttribute?.('data-port') ?? null) as
        | CardinalConnectorPort
        | null;
      let originPort: CardinalConnectorPort;
      if (requestedPort && CARDINAL_PORTS.includes(requestedPort)) {
        originPort = requestedPort;
      } else {
        originPort = getNearestConnectorPort(node, worldPoint);
      }
      const source: AttachedConnectorEndpoint = { nodeId: node.id, port: originPort };
      setPendingConnection({
        type: 'create',
        source,
        worldPoint,
        snapPort: null,
        bypassSnap: event.metaKey || event.ctrlKey
      });
      setPortHints([]);
      connectionPointerRef.current = event.pointerId;
      containerRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (tool !== 'select') {
      pendingTextEditRef.current = null;
      lastClickRef.current = null;
      return;
    }

    const now = performance.now();
    const lastClick = lastClickRef.current;
    const selectionState = useSceneStore.getState().selection;
    const currentSelectedNodeIds = selectionState.nodeIds;
    const wasSelected = currentSelectedNodeIds.includes(node.id);
    const wasSingleSelected =
      currentSelectedNodeIds.length === 1 && currentSelectedNodeIds[0] === node.id;
    const isQuickRepeat =
      !!lastClick && lastClick.nodeId === node.id && now - lastClick.time < DOUBLE_CLICK_DELAY;

    const shouldPrepareTextEdit =
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      (wasSingleSelected || isQuickRepeat);

    if (shouldPrepareTextEdit) {
      pendingTextEditRef.current = {
        nodeId: node.id,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY
      };
    } else {
      pendingTextEditRef.current = null;
    }

    lastClickRef.current = { nodeId: node.id, time: now };

    if (
      isLinkNode &&
      event.button === 0 &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      event.detail === 1 &&
      !shouldPrepareTextEdit
    ) {
      const url = ensureHttpProtocol(node.link?.url ?? '');
      if (url) {
        linkActivationRef.current = {
          nodeId: node.id,
          pointerId: event.pointerId,
          url,
          moved: false
        };
      }
    }

    commitEditingIfNeeded();

    let nextSelection = currentSelectedNodeIds;
    if (event.shiftKey) {
      nextSelection = wasSelected
        ? currentSelectedNodeIds.filter((id) => id !== node.id)
        : [...currentSelectedNodeIds, node.id];
    } else if (!wasSelected) {
      nextSelection = [node.id];
    }

    setSelection({ nodeIds: nextSelection, connectorIds: [] });

    if (event.detail > 1) {
      return;
    }

    const worldPoint = getWorldPoint(event);
    const nodeIdsToDrag = nextSelection.length ? nextSelection : [node.id];
    const nodesToDrag = nodes.filter((current) => nodeIdsToDrag.includes(current.id));
    if (!nodesToDrag.length) {
      return;
    }
    const initialBounds = nodesToDrag.reduce<Bounds>(
      (acc, current) => ({
        minX: Math.min(acc.minX, current.position.x),
        minY: Math.min(acc.minY, current.position.y),
        maxX: Math.max(acc.maxX, current.position.x + current.size.width),
        maxY: Math.max(acc.maxY, current.position.y + current.size.height)
      }),
      {
        minX: nodesToDrag[0].position.x,
        minY: nodesToDrag[0].position.y,
        maxX: nodesToDrag[0].position.x + nodesToDrag[0].size.width,
        maxY: nodesToDrag[0].position.y + nodesToDrag[0].size.height
      }
    );
    beginTransaction();
    setActiveGuides([]);
    setDistanceBadges([]);
    dragStateRef.current = {
      pointerId: event.pointerId,
      nodeIds: nodeIdsToDrag,
      initialWorld: worldPoint,
      initialBounds,
      translation: { x: 0, y: 0 },
      activeSnap: {},
      axisLock: null,
      moved: false
    };
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const handleNodeDoubleClick = (event: React.MouseEvent<SVGGElement>, node: NodeModel) => {
    if (tool !== 'select') {
      return;
    }
    if (node.shape !== 'text' && node.shape !== 'link') {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    clearLinkActivationTimer();
    linkActivationRef.current = null;
    pendingTextEditRef.current = null;
    if (editingNodeId && editingNodeId !== node.id) {
      commitEditingIfNeeded();
    }
    if (!selectedNodeIds.includes(node.id)) {
      setSelection({ nodeIds: [node.id], connectorIds: [] });
    }
    beginTextEditing(node.id, { x: event.clientX, y: event.clientY });
  };

  const handleNodePointerUp = (event: React.PointerEvent, node: NodeModel) => {
    const pending = pendingConnection;
    if (!pending) {
      return;
    }

    if (connectionPointerRef.current !== event.pointerId) {
      return;
    }

    const dropPoint = getWorldPoint(event);
    const snap = pending.snapPort && pending.snapPort.nodeId === node.id ? pending.snapPort : null;
    let dropEndpoint: ConnectorEndpoint;
    if (snap) {
      dropEndpoint = { nodeId: node.id, port: snap.port };
    } else if (!pending.bypassSnap) {
      const nearest = getNearestConnectorPort(node, dropPoint);
      dropEndpoint = { nodeId: node.id, port: nearest };
    } else {
      dropEndpoint = { position: dropPoint };
    }

    completePendingConnection(pending, dropEndpoint);

    setPendingConnection(null);
    connectionPointerRef.current = null;
    setPortHints([]);
    releasePointerCapture(event.pointerId);
  };

  const handleSpacingHandlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: SmartSelectionHandle
  ) => {
    if (event.button !== 0 || dragStateRef.current || spacingDragStateRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pendingTextEditRef.current = null;
    beginTransaction();
    setActiveGuides([]);
    setDistanceBadges([]);
    const worldPoint = getWorldPoint(event);
    spacingDragStateRef.current = {
      pointerId: event.pointerId,
      axis: handle.axis,
      handle,
      originWorld: worldPoint,
      translation: 0
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSpacingHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = spacingDragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const worldPoint = getWorldPoint(event);
    const rawTranslation =
      drag.axis === 'x'
        ? worldPoint.x - drag.originWorld.x
        : worldPoint.y - drag.originWorld.y;
    let translationValue = rawTranslation;
    if (snapSettings.enabled && snapSettings.snapToGrid && gridVisible && !event.altKey) {
      translationValue = Math.round(translationValue / GRID_SIZE) * GRID_SIZE;
    }
    const deltaValue = translationValue - drag.translation;
    if (Math.abs(deltaValue) < 0.0001) {
      return;
    }
    const deltaVec = drag.axis === 'x' ? { x: deltaValue, y: 0 } : { x: 0, y: deltaValue };
    batchMove(drag.handle.affectedIds, deltaVec);
    spacingDragStateRef.current = { ...drag, translation: translationValue };
  };

  const handleSpacingHandlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = spacingDragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    spacingDragStateRef.current = null;
    endTransaction();
    event.currentTarget.releasePointerCapture(event.pointerId);
    setActiveGuides([]);
    setDistanceBadges([]);
  };

  const handleSpacingHandleDoubleClick = (
    event: React.MouseEvent<HTMLDivElement>,
    handle: SmartSelectionHandle
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedNodeIds.length) {
      return;
    }
    equalizeSpacing(selectedNodeIds, handle.axis);
    setActiveGuides([]);
    setDistanceBadges([]);
  };

  const handleConnectorPointerDown = (
    event: React.PointerEvent<SVGElement>,
    connector: ConnectorModel
  ) => {
    setLastPointerPosition(getRelativePoint(event));
    if (tool !== 'select' || event.button !== 0) {
      return;
    }

    pendingTextEditRef.current = null;
    commitEditingIfNeeded();

    const alreadySelected = selectedConnectorIds.includes(connector.id);
    let nextSelection = selectedConnectorIds;
    if (event.shiftKey) {
      nextSelection = alreadySelected
        ? selectedConnectorIds.filter((id) => id !== connector.id)
        : [...selectedConnectorIds, connector.id];
    } else if (!alreadySelected) {
      nextSelection = [connector.id];
    }

    const willBeSingleSelected =
      nextSelection.length === 1 && nextSelection[0] === connector.id;

    setSelection({ nodeIds: [], connectorIds: nextSelection });

    const now = performance.now();
    const lastClick = lastConnectorClickRef.current;
    const trimmedLabel = connector.label?.trim() ?? '';
    const allowEdit =
      willBeSingleSelected &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey;

    if (
      allowEdit &&
      trimmedLabel.length === 0 &&
      lastClick &&
      lastClick.connectorId === connector.id &&
      now - lastClick.time < DOUBLE_CLICK_DELAY
    ) {
      pendingConnectorEditRef.current = {
        connectorId: connector.id,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY
      };
      lastConnectorClickRef.current = null;
      return;
    }

    if (allowEdit) {
      lastConnectorClickRef.current = { connectorId: connector.id, time: now };
    } else {
      lastConnectorClickRef.current = null;
    }

    if (!willBeSingleSelected) {
      return;
    }

    const sourceNode = resolveEndpointNode(connector.source);
    const targetNode = resolveEndpointNode(connector.target);
    let geometry = getConnectorPath(connector, sourceNode, targetNode, nodes);
    if (geometry.points.length < 2) {
      return;
    }

    const worldPoint = getWorldPoint(event);
    const originalWaypoints = connector.points?.map((point) => ({ ...point })) ?? [];
    let closest = findClosestPointOnPolyline(worldPoint, geometry.points);
    let seededWaypoints: Vec2[] | null = null;

    const segmentIndex = closest.index;
    if (segmentIndex <= 0 || segmentIndex >= geometry.points.length - 2) {
      return;
    }

    const segmentStart = geometry.points[segmentIndex];
    const segmentEnd = geometry.points[segmentIndex + 1];
    const axis = inferSegmentAxis(segmentStart, segmentEnd);

    beginTransaction();

    if (seededWaypoints) {
      updateConnector(connector.id, { points: seededWaypoints }, { reroute: false });
    }

    const pointerValue = axis === 'horizontal' ? worldPoint.y : worldPoint.x;
    const segmentValue = axis === 'horizontal' ? segmentStart.y : segmentStart.x;
    const grabOffset = pointerValue - segmentValue;
    const snapTargets = createConnectorSnapTargets(connectors, nodes, connector.id);

    connectorEditRef.current = {
      pointerId: event.pointerId,
      connectorId: connector.id,
      type: 'segment',
      segmentIndex,
      axis,
      grabOffset,
      start: { ...geometry.start },
      end: { ...geometry.end },
      baseWaypoints: geometry.waypoints.map((point) => ({ ...point })),
      originalWaypoints,
      previewWaypoints: geometry.waypoints.map((point) => ({ ...point })),
      previewPoints: geometry.points.map((point) => ({ ...point })),
      snapTargets,
      moved: false
    };

    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const handleConnectorHandlePointerDown = (
    event: React.PointerEvent<SVGPathElement>,
    connector: ConnectorModel,
    pointIndex: number
  ) => {
    if (tool !== 'select' || event.button !== 0) {
      return;
    }

    pendingTextEditRef.current = null;
    commitEditingIfNeeded();
    event.stopPropagation();

    if (!selectedConnectorIds.includes(connector.id)) {
      setSelection({ nodeIds: [], connectorIds: [connector.id] });
    }

    const sourceNode = resolveEndpointNode(connector.source);
    const targetNode = resolveEndpointNode(connector.target);
    const geometry = getConnectorPath(connector, sourceNode, targetNode, nodes);
    const waypoint = geometry.waypoints[pointIndex];
    if (!waypoint) {
      return;
    }

    const pathIndex = pointIndex + 1;
    const worldPoint = getWorldPoint(event);
    const grabOffset = { x: worldPoint.x - waypoint.x, y: worldPoint.y - waypoint.y };
    const snapTargets = createConnectorSnapTargets(connectors, nodes, connector.id);

    const prevPoint = geometry.points[pathIndex - 1];
    const nextPoint = geometry.points[pathIndex + 1];

    const prevAxis =
      pathIndex > 0 ? inferSegmentAxis(prevPoint, geometry.points[pathIndex]) : null;
    const nextAxis =
      pathIndex < geometry.points.length - 1
        ? inferSegmentAxis(geometry.points[pathIndex], nextPoint ?? geometry.points[pathIndex])
        : null;

    beginTransaction();

    connectorEditRef.current = {
      pointerId: event.pointerId,
      connectorId: connector.id,
      type: 'joint',
      waypointIndex: pointIndex,
      grabOffset,
      prevAxis,
      nextAxis,
      origin: { ...waypoint },
      axisLock: null,
      start: { ...geometry.start },
      end: { ...geometry.end },
      baseWaypoints: geometry.waypoints.map((point) => ({ ...point })),
      originalWaypoints: connector.points?.map((point) => ({ ...point })) ?? [],
      previewWaypoints: geometry.waypoints.map((point) => ({ ...point })),
      previewPoints: geometry.points.map((point) => ({ ...point })),
      snapTargets,
      moved: false
    };

    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const handleConnectorEndpointPointerDown = (
    event: React.PointerEvent<SVGCircleElement>,
    connector: ConnectorModel,
    endpoint: 'start' | 'end'
  ) => {
    if (event.button !== 0) {
      return;
    }

    pendingTextEditRef.current = null;
    commitEditingIfNeeded();
    event.stopPropagation();

    const worldPoint = getWorldPoint(event);
    connectionPointerRef.current = event.pointerId;
    containerRef.current?.setPointerCapture(event.pointerId);

    if (!selectedConnectorIds.includes(connector.id)) {
      setSelection({ nodeIds: [], connectorIds: [connector.id] });
    }

    setPortHints([]);

    if (endpoint === 'end') {
      setPendingConnection({
        type: 'reconnect',
        connectorId: connector.id,
        endpoint: 'target',
        original: cloneConnectorEndpoint(connector.target),
        fixed: cloneConnectorEndpoint(connector.source),
        worldPoint,
        snapPort: null,
        bypassSnap: event.metaKey || event.ctrlKey
      });
    } else {
      setPendingConnection({
        type: 'reconnect',
        connectorId: connector.id,
        endpoint: 'source',
        original: cloneConnectorEndpoint(connector.source),
        fixed: cloneConnectorEndpoint(connector.target),
        worldPoint,
        snapPort: null,
        bypassSnap: event.metaKey || event.ctrlKey
      });
    }
  };

  const handleConnectorLabelPointerDown = (
    event: React.PointerEvent<Element>,
    connector: ConnectorModel
  ) => {
    setLastPointerPosition(getRelativePoint(event));
    if (event.button !== 0) {
      return;
    }

    pendingTextEditRef.current = null;
    const now = performance.now();
    const lastClick = lastConnectorClickRef.current;
    const wasSelected = selectedConnectorIds.includes(connector.id);
    const wasSingleSelected =
      selectedConnectorIds.length === 1 && selectedConnectorIds[0] === connector.id;
    const isQuickRepeat =
      !!lastClick && lastClick.connectorId === connector.id && now - lastClick.time < DOUBLE_CLICK_DELAY;
    const allowEdit =
      tool === 'select' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey;

    if (allowEdit && (wasSingleSelected || isQuickRepeat)) {
      pendingConnectorEditRef.current = {
        connectorId: connector.id,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY
      };
    } else {
      pendingConnectorEditRef.current = null;
    }

    if (allowEdit) {
      lastConnectorClickRef.current = { connectorId: connector.id, time: now };
    } else {
      lastConnectorClickRef.current = null;
    }

    commitEditingIfNeeded();
    event.stopPropagation();

    if (!selectedConnectorIds.includes(connector.id)) {
      setSelection({ nodeIds: [], connectorIds: [connector.id] });
    }

    beginTransaction();
    const originalPosition = connector.labelPosition ?? DEFAULT_CONNECTOR_LABEL_POSITION;
    const rawOffset = connector.labelOffset ?? DEFAULT_CONNECTOR_LABEL_DISTANCE;
    const hadAngle = typeof connector.labelAngle === 'number';
    const originalRadius = clampConnectorLabelRadius(rawOffset);
    const baseAngle = (() => {
      if (hadAngle) {
        return connector.labelAngle ?? 0;
      }
      const sourceNode = resolveEndpointNode(connector.source);
      const targetNode = resolveEndpointNode(connector.target);
      const geometry = getConnectorPath(connector, sourceNode, targetNode, nodes);
      if (!geometry.points.length) {
        return -Math.PI / 2;
      }
      const { point, segmentIndex } = getPointAtRatio(geometry.points, originalPosition);
      const normal = getNormalAtRatio(geometry.points, segmentIndex);
      const direction = rawOffset < 0 ? -1 : 1;
      const dx = normal.x * direction;
      const dy = normal.y * direction;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) {
        return -Math.PI / 2;
      }
      return Math.atan2(dy, dx);
    })();
    connectorLabelDragRef.current = {
      pointerId: event.pointerId,
      connectorId: connector.id,
      originalPosition,
      originalOffsetValue: rawOffset,
      originalRadius,
      originalAngle: baseAngle,
      lastPosition: originalPosition,
      lastRadius: originalRadius,
      lastAngle: baseAngle,
      moved: false,
      hadAngle
    };
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const handleResizeHandlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: ResizeHandle
  ) => {
    if (event.button !== 0 || dragStateRef.current || spacingDragStateRef.current) {
      return;
    }
    if (tool !== 'select') {
      return;
    }
    if (!selectedNodes.length || !selectionBounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const bounds = selectionBounds;
    const center = {
      x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
      y: bounds.minY + (bounds.maxY - bounds.minY) / 2
    };

    const anchor: Vec2 = {
      x:
        handle.includes('w') && !handle.includes('e')
          ? bounds.maxX
          : handle.includes('e') && !handle.includes('w')
          ? bounds.minX
          : center.x,
      y:
        handle.includes('n') && !handle.includes('s')
          ? bounds.maxY
          : handle.includes('s') && !handle.includes('n')
          ? bounds.minY
          : center.y
    };

    beginTransaction();
    setActiveGuides([]);
    setDistanceBadges([]);

    resizeStateRef.current = {
      pointerId: event.pointerId,
      handle,
      initialBounds: bounds,
      anchor,
      center,
      nodes: selectedNodes.map((node) => ({
        id: node.id,
        position: { ...node.position },
        size: { ...node.size }
      })),
      initialWidth: bounds.maxX - bounds.minX,
      initialHeight: bounds.maxY - bounds.minY
    };

    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const updateResizeDrag = (event: React.PointerEvent<HTMLDivElement>, state: ResizeState) => {
    const worldPoint = getWorldPoint(event);
    const minScreenSize = 8;
    const minSize = Math.max(minScreenSize / transform.scale, 2);
    const { initialBounds, handle, anchor, center, nodes, initialWidth, initialHeight } = state;

    const horizontalActive = handle.includes('e') || handle.includes('w');
    const verticalActive = handle.includes('n') || handle.includes('s');
    const useCenter = event.altKey;

    let nextMinX = initialBounds.minX;
    let nextMaxX = initialBounds.maxX;
    let nextMinY = initialBounds.minY;
    let nextMaxY = initialBounds.maxY;

    if (useCenter && horizontalActive) {
      const halfWidth = Math.max(minSize / 2, Math.abs(worldPoint.x - center.x));
      nextMinX = center.x - halfWidth;
      nextMaxX = center.x + halfWidth;
    } else if (horizontalActive) {
      if (handle.includes('e')) {
        const limit = initialBounds.minX + minSize;
        nextMaxX = Math.max(worldPoint.x, limit);
      }
      if (handle.includes('w')) {
        const limit = initialBounds.maxX - minSize;
        nextMinX = Math.min(worldPoint.x, limit);
      }
    }

    if (useCenter && verticalActive) {
      const halfHeight = Math.max(minSize / 2, Math.abs(worldPoint.y - center.y));
      nextMinY = center.y - halfHeight;
      nextMaxY = center.y + halfHeight;
    } else if (verticalActive) {
      if (handle.includes('s')) {
        const limit = initialBounds.minY + minSize;
        nextMaxY = Math.max(worldPoint.y, limit);
      }
      if (handle.includes('n')) {
        const limit = initialBounds.maxY - minSize;
        nextMinY = Math.min(worldPoint.y, limit);
      }
    }

    let nextWidth = nextMaxX - nextMinX;
    if (horizontalActive && nextWidth < minSize) {
      if (useCenter) {
        const half = minSize / 2;
        nextMinX = center.x - half;
        nextMaxX = center.x + half;
      } else if (handle.includes('w') && !handle.includes('e')) {
        nextMinX = nextMaxX - minSize;
      } else {
        nextMaxX = nextMinX + minSize;
      }
      nextWidth = nextMaxX - nextMinX;
    }

    let nextHeight = nextMaxY - nextMinY;
    if (verticalActive && nextHeight < minSize) {
      if (useCenter) {
        const half = minSize / 2;
        nextMinY = center.y - half;
        nextMaxY = center.y + half;
      } else if (handle.includes('n') && !handle.includes('s')) {
        nextMinY = nextMaxY - minSize;
      } else {
        nextMaxY = nextMinY + minSize;
      }
      nextHeight = nextMaxY - nextMinY;
    }

    if (
      event.shiftKey &&
      horizontalActive &&
      verticalActive &&
      initialWidth > 0.0001 &&
      initialHeight > 0.0001
    ) {
      const aspect = initialWidth / initialHeight;
      const widthFromHeight = nextHeight * aspect;
      const heightFromWidth = nextWidth / aspect;
      if (Math.abs(widthFromHeight - nextWidth) < Math.abs(heightFromWidth - nextHeight)) {
        nextWidth = Math.max(minSize, widthFromHeight);
        nextHeight = Math.max(minSize, nextWidth / aspect);
      } else {
        nextHeight = Math.max(minSize, heightFromWidth);
        nextWidth = Math.max(minSize, nextHeight * aspect);
      }

      if (useCenter) {
        nextMinX = center.x - nextWidth / 2;
        nextMaxX = center.x + nextWidth / 2;
        nextMinY = center.y - nextHeight / 2;
        nextMaxY = center.y + nextHeight / 2;
      } else {
        const anchorX = handle.includes('w') && !handle.includes('e') ? initialBounds.maxX : initialBounds.minX;
        const anchorY = handle.includes('n') && !handle.includes('s') ? initialBounds.maxY : initialBounds.minY;
        if (handle.includes('w') && !handle.includes('e')) {
          nextMinX = anchorX - nextWidth;
          nextMaxX = anchorX;
        } else {
          nextMinX = anchorX;
          nextMaxX = anchorX + nextWidth;
        }
        if (handle.includes('n') && !handle.includes('s')) {
          nextMinY = anchorY - nextHeight;
          nextMaxY = anchorY;
        } else {
          nextMinY = anchorY;
          nextMaxY = anchorY + nextHeight;
        }
      }
    }

    const width = nextMaxX - nextMinX;
    const height = nextMaxY - nextMinY;

    const scaleX = horizontalActive && initialWidth !== 0 ? width / initialWidth : 1;
    const scaleY = verticalActive && initialHeight !== 0 ? height / initialHeight : 1;
    const anchorX = useCenter ? center.x : anchor.x;
    const anchorY = useCenter ? center.y : anchor.y;

    const updates = nodes.map((snapshot) => {
      let left = snapshot.position.x;
      let right = snapshot.position.x + snapshot.size.width;
      let top = snapshot.position.y;
      let bottom = snapshot.position.y + snapshot.size.height;

      if (horizontalActive) {
        const leftOffset = left - anchorX;
        const rightOffset = right - anchorX;
        left = anchorX + leftOffset * scaleX;
        right = anchorX + rightOffset * scaleX;
      }

      if (verticalActive) {
        const topOffset = top - anchorY;
        const bottomOffset = bottom - anchorY;
        top = anchorY + topOffset * scaleY;
        bottom = anchorY + bottomOffset * scaleY;
      }

      const nextWidthValue = Math.max(minSize, right - left);
      const nextHeightValue = Math.max(minSize, bottom - top);

      return {
        id: snapshot.id,
        position: { x: left, y: top },
        size: { width: nextWidthValue, height: nextHeightValue }
      };
    });

    resizeNodes(updates);
  };

  const handleDeleteSelection = useCallback(() => {
    commitEditingIfNeeded();
    selectedNodeIds.forEach((id) => removeNode(id));
    selectedConnectorIds.forEach((id) => removeConnector(id));
  }, [selectedNodeIds, selectedConnectorIds, removeNode, removeConnector, commitEditingIfNeeded]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isEditable =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable);
      if (isEditable) {
        return;
      }

      const singleNodeSelected = selectedNodeIds.length === 1 ? selectedNode : null;
      const singleConnectorSelected =
        selectedConnectorIds.length === 1
          ? connectors.find((item) => item.id === selectedConnectorIds[0])
          : null;

      if (event.key === 'Enter' && !event.shiftKey) {
        if (singleNodeSelected && tool === 'select' && !editingNodeId) {
          event.preventDefault();
          beginTextEditing(singleNodeSelected.id);
          return;
        }
        if (singleConnectorSelected && tool === 'select' && !editingConnectorId) {
          event.preventDefault();
          setSelection({ nodeIds: [], connectorIds: [singleConnectorSelected.id] });
          setEditingConnectorId(singleConnectorSelected.id);
          return;
        }
      }

      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();

        if (key === 'c') {
          if (tool === 'select' && !editingNodeId) {
            const copied = copySelection();
            if (copied) {
              event.preventDefault();
            }
          }
          return;
        }

        if (key === 'b') {
          if (singleNodeSelected && !editingNodeId) {
            event.preventDefault();
            const nextWeight = singleNodeSelected.fontWeight >= 700 ? 600 : 700;
            applyStyles([singleNodeSelected.id], { fontWeight: nextWeight });
          }
          return;
        }

        if (event.shiftKey) {
          if (singleNodeSelected && !editingNodeId) {
            if (key === 'l' || key === 'c' || key === 'r') {
              event.preventDefault();
              const align = key === 'l' ? 'left' : key === 'c' ? 'center' : 'right';
              applyStyles([singleNodeSelected.id], { textAlign: align });
              return;
            }
          }
        } else if (singleNodeSelected && !editingNodeId) {
          if (key === '=' || key === '+') {
            event.preventDefault();
            const next = Math.min(200, singleNodeSelected.fontSize + 1);
            applyStyles([singleNodeSelected.id], { fontSize: next });
            return;
          }
          if (key === '-' || key === '_') {
            event.preventDefault();
            const next = Math.max(8, singleNodeSelected.fontSize - 1);
            applyStyles([singleNodeSelected.id], { fontSize: next });
            return;
          }
        }
      }

      if ((event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        handleDeleteSelection();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        commitEditingIfNeeded();
        const allNodeIds = nodes.map((node) => node.id);
        setSelection({ nodeIds: allNodeIds, connectorIds: [] });
      }
      if (event.key === 'Escape') {
        clearSelection();
        setPendingConnection(null);
        setPortHints([]);
        if (editingConnectorId) {
          setConnectorCancelSignal((value) => value + 1);
          setEditingConnectorId(null);
        }
        if (resizeStateRef.current) {
          const resizeState = resizeStateRef.current;
          resizeStateRef.current = null;
          resizeNodes(
            resizeState.nodes.map((snapshot) => ({
              id: snapshot.id,
              position: { ...snapshot.position },
              size: { ...snapshot.size }
            }))
          );
          endTransaction();
          releasePointerCapture(resizeState.pointerId);
        }
        if (connectorEditRef.current) {
          const edit = connectorEditRef.current;
          connectorEditRef.current = null;
          updateConnector(edit.connectorId, { points: edit.originalWaypoints }, { reroute: false });
          endTransaction();
          if (containerRef.current && edit.pointerId !== undefined) {
            releasePointerCapture(edit.pointerId);
          }
        }
        if (connectionPointerRef.current !== null) {
          releasePointerCapture(connectionPointerRef.current);
          connectionPointerRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    nodes,
    connectors,
    clearSelection,
    setSelection,
    handleDeleteSelection,
    selectedNodeIds,
    selectedNode,
    selectedConnectorIds,
    tool,
    applyStyles,
    editingNodeId,
    beginTextEditing,
    commitEditingIfNeeded,
    copySelection
  ]);

  const gridStyle = useMemo(() => {
    const scaledSpacing = Math.max(GRID_SIZE * transform.scale, 8);
    const offsetX = transform.x % scaledSpacing;
    const offsetY = transform.y % scaledSpacing;
    const opacity = gridVisible ? 0.7 : 0;
    const color = 'rgba(148, 163, 184, 0.08)';
    const dotColor = 'rgba(148, 163, 184, 0.18)';
    return {
      backgroundSize: `${scaledSpacing}px ${scaledSpacing}px, ${scaledSpacing}px ${scaledSpacing}px, ${scaledSpacing}px ${scaledSpacing}px`,
      backgroundPosition: `${offsetX}px ${offsetY}px, ${offsetX}px ${offsetY}px, ${offsetX}px ${offsetY}px`,
      backgroundImage: `linear-gradient(90deg, ${color} 1px, transparent 1px), linear-gradient(${color} 1px, transparent 1px), radial-gradient(${dotColor} 1px, transparent 1px)`,
      transition: 'opacity 0.3s ease',
      opacity
    } as React.CSSProperties;
  }, [transform, gridVisible]);

  const activeConnectorEdit = connectorEditRef.current;

  const pendingPreview = useMemo(() => {
    if (!pendingConnection) {
      return null;
    }

    const createPreview = (model: ConnectorModel) => {
      const sourceNode = resolveEndpointNode(model.source);
      const targetNode = resolveEndpointNode(model.target);
      const geometry = getConnectorPath(model, sourceNode, targetNode, nodes);
      const radius = model.style.cornerRadius ?? 12;
      const path = buildRoundedConnectorPath(geometry.points, radius);
      if (!path) {
        return null;
      }
      return {
        path,
        strokeWidth: model.style.strokeWidth ?? 2
      };
    };

    if (pendingConnection.type === 'reconnect') {
      const connector = connectors.find((item) => item.id === pendingConnection.connectorId);
      if (!connector) {
        return null;
      }

      const movingEndpoint: ConnectorEndpoint =
        !pendingConnection.bypassSnap && pendingConnection.snapPort
          ? { nodeId: pendingConnection.snapPort.nodeId, port: pendingConnection.snapPort.port }
          : { position: { ...pendingConnection.worldPoint } };
      const fixedEndpoint = cloneConnectorEndpoint(pendingConnection.fixed);

      const previewConnector: ConnectorModel =
        pendingConnection.endpoint === 'source'
          ? {
              ...connector,
              source: movingEndpoint,
              target: fixedEndpoint,
              points: [],
              style: { ...connector.style }
            }
          : {
              ...connector,
              source: fixedEndpoint,
              target: movingEndpoint,
              points: [],
              style: { ...connector.style }
            };

      return createPreview(previewConnector);
    }

    const targetEndpoint: ConnectorEndpoint =
      !pendingConnection.bypassSnap && pendingConnection.snapPort
        ? { nodeId: pendingConnection.snapPort.nodeId, port: pendingConnection.snapPort.port }
        : { position: { ...pendingConnection.worldPoint } };

    const previewConnector: ConnectorModel = {
      id: 'pending',
      source: cloneConnectorEndpoint(pendingConnection.source),
      target: targetEndpoint,
      points: [],
      style: { ...PENDING_CONNECTOR_STYLE }
    };

    return createPreview(previewConnector);
  }, [pendingConnection, connectors, resolveEndpointNode]);

  return (
    <div
      ref={containerRef}
      className={`canvas-container ${isPanning ? 'is-panning' : ''}`}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleImageFileChange}
      />
      <div className="canvas-grid" style={gridStyle} />
      <svg className="canvas-svg">
        <defs>
          <marker
            id="arrow-end"
            markerWidth="16"
            markerHeight="16"
            refX="12"
            refY="6"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M2 2 L12 6 L2 10 Z" fill="#e5e7eb" />
          </marker>
          <marker
            id="dot-end"
            markerWidth="10"
            markerHeight="10"
            refX="5"
            refY="5"
            markerUnits="strokeWidth"
          >
            <circle cx="5" cy="5" r="3" fill="#e5e7eb" />
          </marker>
        </defs>
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
          {connectors.map((connector) => (
            <DiagramConnector
              key={connector.id}
              connector={connector}
              source={resolveEndpointNode(connector.source)}
              target={resolveEndpointNode(connector.target)}
              nodes={nodes}
              selected={selectedConnectorIds.includes(connector.id)}
              labelEditing={editingConnectorId === connector.id}
              labelEditEntryPoint={
                editingConnectorId === connector.id ? connectorLabelEntryPointRef.current : null
              }
              commitSignal={connectorCommitSignal}
              cancelSignal={connectorCancelSignal}
              onPointerDown={(event) => handleConnectorPointerDown(event, connector)}
              onHandlePointerDown={(event, index) =>
                handleConnectorHandlePointerDown(event, connector, index)
              }
              onEndpointPointerDown={(event, endpoint) =>
                handleConnectorEndpointPointerDown(event, connector, endpoint)
              }
              onCommitLabel={(value) => handleConnectorLabelCommit(connector.id, value)}
              onCancelLabelEdit={handleConnectorLabelCancel}
              onRequestLabelEdit={(point) => handleConnectorRequestLabelEdit(connector.id, point)}
              onLabelPointerDown={(event) => handleConnectorLabelPointerDown(event, connector)}
              shouldIgnoreLabelBlur={isConnectorLabelToolbarInteracting}
              previewPoints={
                activeConnectorEdit?.connectorId === connector.id
                  ? activeConnectorEdit.previewPoints
                  : undefined
              }
              renderEndpoints={false}
            />
          ))}
          {nodes.map((node) => (
            <DiagramNode
              key={node.id}
              node={node}
              selected={selectedNodeIds.includes(node.id)}
              hovered={hoveredNodeId === node.id}
              tool={tool as Tool}
              editing={editingNodeId === node.id}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onPointerUp={(event) => handleNodePointerUp(event, node)}
              onPointerEnter={() => setHoveredNodeId(node.id)}
              onPointerLeave={() => setHoveredNodeId((prev) => (prev === node.id ? null : prev))}
              onDoubleClick={(event) => handleNodeDoubleClick(event, node)}
            />
          ))}
          {connectors.map((connector) => {
            if (!selectedConnectorIds.includes(connector.id)) {
              return null;
            }
            return (
              <DiagramConnectorEndpoints
                key={`${connector.id}-endpoints`}
                connector={connector}
                source={resolveEndpointNode(connector.source)}
                target={resolveEndpointNode(connector.target)}
                nodes={nodes}
                onEndpointPointerDown={(event, endpoint) =>
                  handleConnectorEndpointPointerDown(event, connector, endpoint)
                }
                previewPoints={
                  activeConnectorEdit?.connectorId === connector.id
                    ? activeConnectorEdit.previewPoints
                    : undefined
                }
              />
            );
          })}
          {pendingPreview && (
            <path
              className="connector-pending"
              d={pendingPreview.path}
              strokeWidth={pendingPreview.strokeWidth}
            />
          )}
        </g>
      </svg>
      <div className="canvas-overlays" aria-hidden>
        {marqueeRect && (
          <div
            className="canvas-marquee"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height
            }}
          />
        )}
        <svg className="canvas-guides" aria-hidden>
          {guideLines.map((guide) => (
            <line
              key={guide.id}
              className={`canvas-guide-line canvas-guide-line--${guide.axis} canvas-guide-line--${guide.type}`}
              x1={guide.start.x}
              y1={guide.start.y}
              x2={guide.end.x}
              y2={guide.end.y}
            />
          ))}
        </svg>
        {portHints.map((hint) => (
          <div
            key={`port-${hint.nodeId}-${hint.port}`}
            className={`connector-port-hint${hint.active ? ' is-active' : ''}`}
            style={{ left: hint.screen.x, top: hint.screen.y }}
          />
        ))}
        {snapSettings.showDistanceLabels &&
          badgeScreens.map((badge) => (
            <div
              key={badge.id}
              className={`distance-badge distance-badge--${badge.axis} distance-badge--${badge.direction}${
                badge.equal ? ' is-equal' : ''
              }`}
              style={{ left: badge.screen.x, top: badge.screen.y }}
            >
              {badge.equal && <span className="distance-badge__equal">=</span>}
              {Math.round(badge.value)}
            </div>
          ))}
        {snapSettings.enabled &&
          snapSettings.showSpacingHandles &&
          smartSelectionState &&
          spacingHandles.map(({ handle, screen }) => (
            <div
              key={handle.id}
              className={`spacing-handle spacing-handle--${handle.axis}${
                smartSelectionState.isUniform ? ' is-uniform' : ''
              }`}
              style={{ left: screen.x, top: screen.y }}
              onPointerDown={(event) => handleSpacingHandlePointerDown(event, handle)}
              onPointerMove={handleSpacingHandlePointerMove}
              onPointerUp={handleSpacingHandlePointerUp}
              onDoubleClick={(event) => handleSpacingHandleDoubleClick(event, handle)}
            >
              <span className="spacing-handle__label">
                {smartSelectionState.isUniform && <span className="distance-badge__equal">=</span>}
                {Math.round(handle.gap)}
              </span>
            </div>
          ))}
        {showResizeFrame && selectionFrame && (
          <div
            className="selection-frame"
            style={{
              left: selectionFrame.left,
              top: selectionFrame.top,
              width: selectionFrame.width,
              height: selectionFrame.height
            }}
          >
            {RESIZE_HANDLES.map((handle) => (
              <div
                key={handle.key}
                className={`selection-frame__handle selection-frame__handle--${handle.key}`}
                style={{
                  left: `${handle.x * 100}%`,
                  top: `${handle.y * 100}%`,
                  cursor: handle.cursor
                }}
                onPointerDown={(event) => handleResizeHandlePointerDown(event, handle.key)}
              />
            ))}
          </div>
        )}
      </div>
      {selectedConnector && (
        <ConnectorToolbar
          connector={selectedConnector}
          anchor={connectorToolbarAnchor}
          viewportSize={viewport}
          isVisible={tool === 'select' && !isPanning && !editingConnectorId}
          onStyleChange={(patch) => handleConnectorStyleChange(selectedConnector, patch)}
          onEndpointStyleChange={(endpoint, patch) =>
            handleConnectorEndpointStyleChange(selectedConnector, endpoint, patch)
          }
          pointerPosition={lastPointerPosition}
        />
      )}
      {selectedConnector && editingConnectorId === selectedConnector.id && (
        <ConnectorTextToolbar
          connector={selectedConnector}
          anchor={connectorLabelToolbarAnchor}
          viewportSize={viewport}
          isVisible={tool === 'select' && !isPanning && editingConnectorId === selectedConnector.id}
          onChange={(style) => handleConnectorLabelStyleChange(selectedConnector, style)}
          pointerPosition={lastPointerPosition}
          onPointerInteractionChange={setConnectorLabelToolbarInteracting}
          onClose={handleConnectorLabelToolbarClose}
        />
      )}
      {selectedNode && (
        <SelectionToolbar
          node={selectedNode}
          nodeIds={[selectedNode.id]}
          anchor={toolbarAnchor}
          viewportSize={viewport}
          isVisible={tool === 'select' && !isPanning}
          pointerPosition={lastPointerPosition}
          isTextEditing={Boolean(editingNodeId && editingNodeId === selectedNode.id)}
          textEditorRef={inlineEditorRef}
          onPointerInteractionChange={setSelectionToolbarInteracting}
        />
      )}
      {editorNode && (
        <InlineTextEditor
          ref={inlineEditorRef}
          node={editorNode}
          bounds={editorBounds}
          isEditing={Boolean(editingNode)}
          scale={transform.scale}
          entryPoint={editingEntryPoint}
          onCommit={handleTextCommit}
          onCancel={handleTextCancel}
          shouldIgnoreBlur={isSelectionToolbarInteracting}
        />
      )}
    </div>
  );
};

const fitImageWithinBounds = (width: number, height: number) => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : IMAGE_MIN_DIMENSION;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : IMAGE_MIN_DIMENSION;
  const largestEdge = Math.max(safeWidth, safeHeight, 1);
  const smallestEdge = Math.max(Math.min(safeWidth, safeHeight), 1);

  let scale = largestEdge > IMAGE_MAX_DIMENSION ? IMAGE_MAX_DIMENSION / largestEdge : 1;
  let scaledWidth = Math.max(1, Math.round(safeWidth * scale));
  let scaledHeight = Math.max(1, Math.round(safeHeight * scale));

  const scaledLargest = Math.max(scaledWidth, scaledHeight);
  if (scaledLargest < IMAGE_MIN_DIMENSION) {
    const minScale = IMAGE_MIN_DIMENSION / Math.max(scaledLargest, 1);
    scale *= minScale;
    scaledWidth = Math.max(1, Math.round(safeWidth * scale));
    scaledHeight = Math.max(1, Math.round(safeHeight * scale));
  }

  if (smallestEdge === largestEdge && scaledWidth !== scaledHeight) {
    const size = Math.max(scaledWidth, scaledHeight);
    scaledWidth = size;
    scaledHeight = size;
  }

  return { width: scaledWidth, height: scaledHeight };
};

const createTransformToFit = (
  bounds: ReturnType<typeof getSceneBounds>,
  viewport: { width: number; height: number }
): CanvasTransform | null => {
  if (!bounds) {
    return null;
  }
  const size = boundsToSize(bounds);
  const { width, height } = viewport;
  if (!width || !height || !size.width || !size.height) {
    return null;
  }
  const scale = clamp(Math.min(width / size.width, height / size.height), MIN_SCALE, MAX_SCALE);
  const center = centerOfBounds(bounds);
  return {
    scale,
    x: width / 2 - center.x * scale,
    y: height / 2 - center.y * scale
  };
};

const getDefaultSizeForTool = (tool: Tool) => {
  if (isNodeCreationTool(tool)) {
    return getDefaultNodeSize(tool);
  }
  return { width: GRID_SIZE * 4, height: GRID_SIZE * 4 };
};

export const Canvas = forwardRef(CanvasComponent);
