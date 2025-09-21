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
import {
  CanvasTransform,
  ConnectorModel,
  NodeModel,
  Tool,
  Vec2
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
  getConnectorAnchor,
  getConnectorPath,
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
import { DiagramConnector } from './DiagramConnector';
import { SelectionToolbar } from './SelectionToolbar';
import { ConnectorToolbar } from './ConnectorToolbar';
import { ConnectorTextToolbar } from './ConnectorTextToolbar';
import { InlineTextEditor, InlineTextEditorHandle } from './InlineTextEditor';
import { useCommands } from '../state/commands';
import '../styles/canvas.css';

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const ZOOM_FACTOR = 1.1;
const FIT_PADDING = 160;
const DOUBLE_CLICK_DELAY = 320;
const DEFAULT_CONNECTOR_LABEL_POSITION = 0.5;
const DEFAULT_CONNECTOR_LABEL_OFFSET = 18;
const DEFAULT_CONNECTOR_LABEL_STYLE = {
  fontSize: 14,
  fontWeight: 600 as const,
  color: '#f8fafc',
  background: 'rgba(15,23,42,0.85)'
};
const MIN_CURVE_OFFSET = 18;
const MAX_CURVE_OFFSET = 140;

const computeDefaultCurvedWaypoints = (
  start: Vec2,
  end: Vec2,
  reference?: Vec2[]
): Vec2[] => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 1) {
    return [];
  }

  let normal = { x: -dy / distance, y: dx / distance };
  let projectedMagnitude = Math.min(MAX_CURVE_OFFSET, Math.max(MIN_CURVE_OFFSET, distance / 2.4));

  if (reference && reference.length) {
    const first = reference[0];
    const toFirst = { x: first.x - start.x, y: first.y - start.y };
    const projectionFirst = toFirst.x * normal.x + toFirst.y * normal.y;
    if (projectionFirst < 0) {
      normal = { x: -normal.x, y: -normal.y };
    }

    const projections: number[] = [];
    const firstMagnitude = Math.abs(toFirst.x * normal.x + toFirst.y * normal.y);
    if (firstMagnitude > 0.5) {
      projections.push(firstMagnitude);
    }

    if (reference.length > 1) {
      const last = reference[reference.length - 1];
      const toLastFromStart = { x: last.x - start.x, y: last.y - start.y };
      const toLastFromEnd = { x: last.x - end.x, y: last.y - end.y };
      const lastMagnitudeA = Math.abs(toLastFromStart.x * normal.x + toLastFromStart.y * normal.y);
      const lastMagnitudeB = Math.abs(toLastFromEnd.x * normal.x + toLastFromEnd.y * normal.y);
      if (lastMagnitudeA > 0.5) {
        projections.push(lastMagnitudeA);
      }
      if (lastMagnitudeB > 0.5) {
        projections.push(lastMagnitudeB);
      }
    }

    if (projections.length) {
      const average = projections.reduce((sum, value) => sum + value, 0) / projections.length;
      projectedMagnitude = Math.min(MAX_CURVE_OFFSET, Math.max(MIN_CURVE_OFFSET, average));
    }
  }

  const anchorOne = {
    x: start.x + dx / 3 + normal.x * projectedMagnitude,
    y: start.y + dy / 3 + normal.y * projectedMagnitude
  };
  const anchorTwo = {
    x: start.x + (2 * dx) / 3 + normal.x * projectedMagnitude,
    y: start.y + (2 * dy) / 3 + normal.y * projectedMagnitude
  };

  return [anchorOne, anchorTwo];
};

export interface CanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomToSelection: () => void;
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

type PendingConnection =
  | { type: 'create'; sourceId: string; worldPoint: Vec2 }
  | {
      type: 'reconnect-target';
      connectorId: string;
      sourceId: string;
      initialTargetId: string;
      worldPoint: Vec2;
    }
  | {
      type: 'reconnect-source';
      connectorId: string;
      targetId: string;
      initialSourceId: string;
      worldPoint: Vec2;
    };

interface ConnectorDragState {
  pointerId: number;
  connectorId: string;
  kind: 'waypoint' | 'segment';
  waypointIndex?: number;
  segmentIndex?: number;
  axis?: 'horizontal' | 'vertical';
  mode: ConnectorModel['mode'];
  basePoints: Vec2[];
  workingPoints: Vec2[];
  originalWaypoints: Vec2[];
  currentWaypoints: Vec2[];
  initialPointer: Vec2;
  moved: boolean;
}

interface ConnectorLabelDragState {
  pointerId: number;
  connectorId: string;
  originalPosition: number;
  originalOffset: number;
  lastPosition: number;
  lastOffset: number;
  moved: boolean;
}

type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

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
  const connectorDragStateRef = useRef<ConnectorDragState | null>(null);
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
  const { applyStyles, setText } = useCommands();

  const selectedNodeIds = selection.nodeIds;
  const selectedConnectorIds = selection.connectorIds;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [linkFocusSignal, setLinkFocusSignal] = useState(0);
  const [activeGuides, setActiveGuides] = useState<SnapMatch[]>([]);
  const [distanceBadges, setDistanceBadges] = useState<SnapDistanceBadge[]>([]);
  const [smartSelectionState, setSmartSelectionState] = useState<SmartSelectionResult | null>(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [connectorCommitSignal, setConnectorCommitSignal] = useState(0);
  const [connectorCancelSignal, setConnectorCancelSignal] = useState(0);
  const inlineEditorRef = useRef<InlineTextEditorHandle | null>(null);
  const editingEntryPointRef = useRef<{ x: number; y: number } | null>(null);
  const pendingTextEditRef = useRef<{
    nodeId: string;
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null);
  const lastConnectorClickRef = useRef<{ connectorId: string; time: number } | null>(null);
  const pendingConnectorEditRef = useRef<{ connectorId: string; pointerId: number } | null>(null);
  const connectorLabelDragRef = useRef<ConnectorLabelDragState | null>(null);

  const hasConnectorBetween = useCallback(
    (sourceId: string, targetId: string, ignoreId?: string) =>
      connectors.some(
        (connector) =>
          connector.sourceId === sourceId &&
          connector.targetId === targetId &&
          connector.id !== ignoreId
      ),
    [connectors]
  );

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
    if (selectedNodeIds.length !== 1) {
      return null;
    }
    return nodes.find((node) => node.id === selectedNodeIds[0]) ?? null;
  }, [nodes, selectedNodeIds]);

  const selectedConnector = useMemo(() => {
    if (selectedConnectorIds.length !== 1) {
      return null;
    }
    return connectors.find((item) => item.id === selectedConnectorIds[0]) ?? null;
  }, [connectors, selectedConnectorIds]);

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
    const sourceNode = getNodeById({ nodes, connectors }, selectedConnector.sourceId);
    const targetNode = getNodeById({ nodes, connectors }, selectedConnector.targetId);
    if (!sourceNode || !targetNode) {
      return null;
    }
    const geometry = getConnectorPath(selectedConnector, sourceNode, targetNode);
    if (!geometry.points.length) {
      return null;
    }
    const { point } = getPointAtRatio(geometry.points, 0.5);
    const screenPoint = worldToScreen(point, transform);
    return { x: screenPoint.x, y: screenPoint.y };
  }, [selectedConnector, nodes, connectors, transform]);

  const connectorLabelToolbarAnchor = useMemo(() => {
    if (!selectedConnector) {
      return null;
    }
    const sourceNode = getNodeById({ nodes, connectors }, selectedConnector.sourceId);
    const targetNode = getNodeById({ nodes, connectors }, selectedConnector.targetId);
    if (!sourceNode || !targetNode) {
      return null;
    }
    const geometry = getConnectorPath(selectedConnector, sourceNode, targetNode);
    if (!geometry.points.length) {
      return null;
    }
    const position = selectedConnector.labelPosition ?? DEFAULT_CONNECTOR_LABEL_POSITION;
    const offset = selectedConnector.labelOffset ?? DEFAULT_CONNECTOR_LABEL_OFFSET;
    const { point, segmentIndex } = getPointAtRatio(geometry.points, position);
    const normal = getNormalAtRatio(geometry.points, segmentIndex);
    const labelCenter = {
      x: point.x + normal.x * offset,
      y: point.y + normal.y * offset
    };
    const screenPoint = worldToScreen(labelCenter, transform);
    return { x: screenPoint.x, y: screenPoint.y };
  }, [selectedConnector, nodes, connectors, transform]);

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
    const padding = 12;
    const topLeft = worldToScreen(
      {
        x: editorNode.position.x + padding,
        y: editorNode.position.y + padding
      },
      transform
    );
    const bottomRight = worldToScreen(
      {
        x: editorNode.position.x + editorNode.size.width - padding,
        y: editorNode.position.y + editorNode.size.height - padding
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

  const beginTextEditing = useCallback(
    (nodeId: string, point?: { x: number; y: number }) => {
      editingEntryPointRef.current = point ?? null;
      pendingTextEditRef.current = null;
      setEditingNode(nodeId);
    },
    [setEditingNode]
  );

  const handleTextCommit = useCallback(
    (value: string) => {
      if (editingNode) {
        setText(editingNode.id, value);
      }
      editingEntryPointRef.current = null;
      setEditingNode(null);
    },
    [editingNode, setText, setEditingNode]
  );

  const handleTextCancel = useCallback(() => {
    editingEntryPointRef.current = null;
    setEditingNode(null);
  }, [setEditingNode]);

  const handleConnectorLabelCommit = useCallback(
    (connectorId: string, value: string) => {
      updateConnector(connectorId, { label: value.trim().length ? value : undefined });
      setEditingConnectorId((current) => (current === connectorId ? null : current));
    },
    [updateConnector]
  );

  const handleConnectorLabelCancel = useCallback(() => {
    setEditingConnectorId(null);
  }, []);

  const handleConnectorRequestLabelEdit = useCallback(
    (connectorId: string) => {
      if (editingConnectorId === connectorId) {
        return;
      }
      commitEditingIfNeeded();
      setSelection({ nodeIds: [], connectorIds: [connectorId] });
      setEditingConnectorId(connectorId);
    },
    [commitEditingIfNeeded, editingConnectorId, setSelection]
  );

  const handleConnectorStyleChange = useCallback(
    (connector: ConnectorModel, patch: Partial<ConnectorModel['style']>) => {
      updateConnector(connector.id, { style: patch });
    },
    [updateConnector]
  );

  const handleConnectorModeChange = useCallback(
    (connector: ConnectorModel, mode: ConnectorModel['mode']) => {
      if (mode === connector.mode) {
        return;
      }
      if (mode === 'orthogonal' || mode === 'straight') {
        updateConnector(connector.id, { mode, points: [] });
        return;
      }

      const sourceNode = getNodeById({ nodes, connectors }, connector.sourceId);
      const targetNode = getNodeById({ nodes, connectors }, connector.targetId);
      if (!sourceNode || !targetNode) {
        updateConnector(connector.id, { mode, points: [] });
        return;
      }

      const geometry = getConnectorPath(connector, sourceNode, targetNode);
      const fallback = connector.points?.map((point) => ({ ...point })) ?? [];
      const reference = geometry.waypoints.length
        ? geometry.waypoints.map((point) => ({ ...point }))
        : fallback;
      const nextPoints = computeDefaultCurvedWaypoints(geometry.start, geometry.end, reference);

      updateConnector(connector.id, { mode, points: nextPoints });
    },
    [nodes, connectors, updateConnector]
  );

  const handleConnectorLabelStyleChange = useCallback(
    (connector: ConnectorModel, style: ConnectorModel['labelStyle']) => {
      const merged = { ...DEFAULT_CONNECTOR_LABEL_STYLE, ...(style ?? {}) };
      updateConnector(connector.id, { labelStyle: merged });
    },
    [updateConnector]
  );

  const handleConnectorTidy = useCallback(
    (connector: ConnectorModel) => {
      const sourceNode = getNodeById({ nodes, connectors }, connector.sourceId);
      const targetNode = getNodeById({ nodes, connectors }, connector.targetId);
      if (!sourceNode || !targetNode) {
        return;
      }
      const geometry = getConnectorPath(connector, sourceNode, targetNode);
      if (connector.mode === 'orthogonal') {
        const waypoints = tidyOrthogonalWaypoints(geometry.start, geometry.waypoints, geometry.end);
        updateConnector(connector.id, { points: waypoints });
      } else {
        updateConnector(connector.id, { points: [] });
      }
    },
    [nodes, connectors, updateConnector]
  );

  const handleConnectorFlip = useCallback(
    (connector: ConnectorModel) => {
      const reversedPoints = connector.points
        ? [...connector.points].reverse().map((point) => ({ ...point }))
        : [];
      updateConnector(connector.id, {
        sourceId: connector.targetId,
        targetId: connector.sourceId,
        points: reversedPoints,
        labelPosition:
          connector.labelPosition !== undefined ? 1 - connector.labelPosition : connector.labelPosition
      });
    },
    [updateConnector]
  );

  useEffect(() => {
    setGlobalTransform(transform);
    onTransformChange?.(transform);
  }, [transform, onTransformChange, setGlobalTransform]);

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

  const zoomToSelection = () => {
    if (!viewport.width || !viewport.height) {
      return;
    }
    if (!selectedNodeIds.length) {
      zoomToFit();
      return;
    }
    const bounds = getSceneBounds({ nodes, connectors }, selectedNodeIds);
    if (!bounds) {
      return;
    }
    const expanded = expandBounds(bounds, FIT_PADDING / 2);
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
      zoomToSelection,
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
      if (!event.shiftKey) {
        clearSelection();
      }
      return;
    }

    if (tool === 'connector') {
      return;
    }

    const worldPoint = getWorldPoint(event);
    const { width, height } = getDefaultSizeForTool(tool);
    const position = {
      x: worldPoint.x - width / 2,
      y: worldPoint.y - height / 2
    };
    addNode(tool as Extract<Tool, 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'diamond'>, position);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (resizeState && resizeState.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      updateResizeDrag(event, resizeState);
      return;
    }

    if (panStateRef.current && panStateRef.current.pointerId === event.pointerId) {
      const { last } = panStateRef.current;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      if (dx !== 0 || dy !== 0) {
        setTransformState((prev) => ({ x: prev.x + dx, y: prev.y + dy, scale: prev.scale }));
      }
      panStateRef.current = { pointerId: event.pointerId, last: { x: event.clientX, y: event.clientY } };
      return;
    }

    const dragState = dragStateRef.current;
    if (dragState && dragState.pointerId === event.pointerId) {
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
        if (axis === 'x') {
          translation = { ...translation, y: 0 };
        } else {
          translation = { ...translation, x: 0 };
        }
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
      }

      dragState.translation = appliedTranslation;
      dragState.activeSnap = nextActiveSnap;
      return;
    }

    if (pendingConnectorEditRef.current?.pointerId === event.pointerId) {
      pendingConnectorEditRef.current = null;
    }

    const labelDrag = connectorLabelDragRef.current;
    if (labelDrag && labelDrag.pointerId === event.pointerId) {
      const connector = connectors.find((item) => item.id === labelDrag.connectorId);
      if (!connector) {
        return;
      }
      const sourceNode = getNodeById({ nodes, connectors }, connector.sourceId);
      const targetNode = getNodeById({ nodes, connectors }, connector.targetId);
      if (!sourceNode || !targetNode) {
        return;
      }
      const geometry = getConnectorPath(connector, sourceNode, targetNode);
      if (geometry.points.length < 2) {
        return;
      }
      const worldPoint = getWorldPoint(event);
      const closest = findClosestPointOnPolyline(worldPoint, geometry.points);
      const measure = measurePolyline(geometry.points);
      if (measure.totalLength <= 0) {
        return;
      }
      const start = geometry.points[closest.index];
      const end = geometry.points[closest.index + 1] ?? start;
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      const localLength = Math.hypot(closest.point.x - start.x, closest.point.y - start.y);
      const segmentOffset = measure.segments[closest.index] ?? 0;
      let position = (segmentOffset + Math.min(localLength, segmentLength)) / measure.totalLength;
      position = Math.max(0, Math.min(1, position));
      const normal = getNormalAtRatio(geometry.points, closest.index);
      const offsetRaw =
        (worldPoint.x - closest.point.x) * normal.x + (worldPoint.y - closest.point.y) * normal.y;
      const offset = Math.max(-280, Math.min(280, offsetRaw));
      labelDrag.lastPosition = position;
      labelDrag.lastOffset = offset;
      labelDrag.moved = true;
      updateConnector(connector.id, { labelPosition: position, labelOffset: offset });
      return;
    }

    const connectorDragState = connectorDragStateRef.current;
    if (connectorDragState && connectorDragState.pointerId === event.pointerId) {
      const worldPoint = getWorldPoint(event);
      connectorDragState.moved = true;

      const nextPoints = connectorDragState.basePoints.map((point) => ({ ...point }));

      if (connectorDragState.kind === 'waypoint' && connectorDragState.waypointIndex !== undefined) {
        const index = connectorDragState.waypointIndex + 1;
        if (nextPoints[index]) {
          nextPoints[index] = { x: worldPoint.x, y: worldPoint.y };
        }
      } else if (
        connectorDragState.kind === 'segment' &&
        connectorDragState.segmentIndex !== undefined &&
        connectorDragState.axis
      ) {
        const offset =
          connectorDragState.axis === 'horizontal'
            ? worldPoint.y - connectorDragState.initialPointer.y
            : worldPoint.x - connectorDragState.initialPointer.x;
        const startIndex = connectorDragState.segmentIndex;
        const endIndex = Math.min(connectorDragState.segmentIndex + 1, nextPoints.length - 1);
        const applyOffset = (point: Vec2) =>
          connectorDragState.axis === 'horizontal'
            ? { ...point, y: point.y + offset }
            : { ...point, x: point.x + offset };

        if (startIndex === 0) {
          if (endIndex < nextPoints.length) {
            nextPoints[endIndex] = applyOffset(nextPoints[endIndex]);
          }
        } else if (endIndex === nextPoints.length - 1) {
          nextPoints[startIndex] = applyOffset(nextPoints[startIndex]);
        } else {
          nextPoints[startIndex] = applyOffset(nextPoints[startIndex]);
          nextPoints[endIndex] = applyOffset(nextPoints[endIndex]);
        }
      }

      const startPoint = nextPoints[0];
      const endPoint = nextPoints[nextPoints.length - 1];
      let interior = nextPoints.slice(1, nextPoints.length - 1);
      if (connectorDragState.mode === 'orthogonal') {
        interior = tidyOrthogonalWaypoints(startPoint, interior, endPoint);
      }

      connectorDragState.basePoints = [
        startPoint,
        ...interior.map((point) => ({ ...point })),
        endPoint
      ];
      connectorDragState.workingPoints = connectorDragState.basePoints.map((point) => ({ ...point }));
      connectorDragState.currentWaypoints = interior.map((point) => ({ ...point }));
      connectorDragState.initialPointer = worldPoint;

      updateConnector(connectorDragState.connectorId, {
        points: connectorDragState.currentWaypoints
      });
      return;
    }

    if (connectionPointerRef.current === event.pointerId) {
      const worldPoint = getWorldPoint(event);
      setPendingConnection((current) => (current ? { ...current, worldPoint } : current));
    }
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

    let connectorEditRequest: string | null = null;
    const pendingConnector = pendingConnectorEditRef.current;
    if (pendingConnector && pendingConnector.pointerId === event.pointerId) {
      const drag = connectorDragStateRef.current;
      const moved = drag && drag.pointerId === event.pointerId ? drag.moved : false;
      if (!moved && tool === 'select') {
        connectorEditRequest = pendingConnector.connectorId;
      }
      pendingConnectorEditRef.current = null;
    }

    let handled = false;

    if (!handled && resizeStateRef.current?.pointerId === event.pointerId) {
      resizeStateRef.current = null;
      endTransaction();
      releasePointerCapture(event.pointerId);
      handled = true;
    }

    if (!handled && panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsPanning(false);
      releasePointerCapture(event.pointerId);
    }

    if (!handled && dragStateRef.current?.pointerId === event.pointerId) {
      setActiveGuides([]);
      setDistanceBadges([]);
      dragStateRef.current = null;
      endTransaction();
      releasePointerCapture(event.pointerId);
    }

    if (!handled && spacingDragStateRef.current?.pointerId === event.pointerId) {
      spacingDragStateRef.current = null;
      endTransaction();
      setActiveGuides([]);
      setDistanceBadges([]);
      releasePointerCapture(event.pointerId);
    }

    if (!handled && connectorDragStateRef.current?.pointerId === event.pointerId) {
      const drag = connectorDragStateRef.current;
      connectorDragStateRef.current = null;
      const nextPoints = drag.moved ? drag.currentWaypoints : drag.originalWaypoints;
      updateConnector(drag.connectorId, { points: nextPoints });
      endTransaction();
      releasePointerCapture(event.pointerId);
      handled = drag.moved;
    }

    if (!handled && connectorLabelDragRef.current?.pointerId === event.pointerId) {
      const drag = connectorLabelDragRef.current;
      connectorLabelDragRef.current = null;
      updateConnector(drag.connectorId, {
        labelPosition: drag.moved ? drag.lastPosition : drag.originalPosition,
        labelOffset: drag.moved ? drag.lastOffset : drag.originalOffset
      });
      endTransaction();
      releasePointerCapture(event.pointerId);
      handled = true;
    }

    if (!handled && connectionPointerRef.current === event.pointerId) {
      setPendingConnection(null);
      connectionPointerRef.current = null;
      releasePointerCapture(event.pointerId);
      handled = true;
    }

    if (!handled && connectorEditRequest) {
      setSelection({ nodeIds: [], connectorIds: [connectorEditRequest] });
      setEditingConnectorId(connectorEditRequest);
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
      }
    }
  };

  const handleNodePointerDown = (event: React.PointerEvent, node: NodeModel) => {
    if (tool === 'connector') {
      pendingTextEditRef.current = null;
      const worldPoint = getWorldPoint(event);
      setPendingConnection({ type: 'create', sourceId: node.id, worldPoint });
      connectionPointerRef.current = event.pointerId;
      return;
    }

    if (tool !== 'select') {
      pendingTextEditRef.current = null;
      lastClickRef.current = null;
      return;
    }

    if ((event.metaKey || event.ctrlKey) && node.link?.url) {
      event.preventDefault();
      pendingTextEditRef.current = null;
      lastClickRef.current = null;
      window.open(node.link.url, '_blank', 'noopener');
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
    event.stopPropagation();
    event.preventDefault();
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
    if (!pendingConnection) {
      return;
    }

    if (connectionPointerRef.current !== event.pointerId) {
      return;
    }

    if (pendingConnection.type === 'create') {
      if (pendingConnection.sourceId !== node.id) {
        addConnector(pendingConnection.sourceId, node.id);
      }
    } else if (pendingConnection.type === 'reconnect-target') {
      const isSameAsBefore = node.id === pendingConnection.initialTargetId;
      const isSelfLoop = node.id === pendingConnection.sourceId;
      if (!isSameAsBefore && !isSelfLoop) {
        const exists = hasConnectorBetween(
          pendingConnection.sourceId,
          node.id,
          pendingConnection.connectorId
        );
        if (!exists) {
          updateConnector(pendingConnection.connectorId, { targetId: node.id, points: [] });
          setSelection({ nodeIds: [], connectorIds: [pendingConnection.connectorId] });
        }
      }
    } else if (pendingConnection.type === 'reconnect-source') {
      const isSameAsBefore = node.id === pendingConnection.initialSourceId;
      const isSelfLoop = node.id === pendingConnection.targetId;
      if (!isSameAsBefore && !isSelfLoop) {
        const exists = hasConnectorBetween(
          node.id,
          pendingConnection.targetId,
          pendingConnection.connectorId
        );
        if (!exists) {
          updateConnector(pendingConnection.connectorId, { sourceId: node.id, points: [] });
          setSelection({ nodeIds: [], connectorIds: [pendingConnection.connectorId] });
        }
      }
    }

    setPendingConnection(null);
    connectionPointerRef.current = null;
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
    event: React.PointerEvent<SVGPathElement>,
    connector: ConnectorModel
  ) => {
    if (tool !== 'select') {
      return;
    }
    if (event.button !== 0) {
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
    const allowEdit =
      willBeSingleSelected &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey;

    if (
      allowEdit &&
      lastClick &&
      lastClick.connectorId === connector.id &&
      now - lastClick.time < DOUBLE_CLICK_DELAY
    ) {
      pendingConnectorEditRef.current = { connectorId: connector.id, pointerId: event.pointerId };
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
    if (connector.mode !== 'orthogonal') {
      return;
    }

    const sourceNode = getNodeById({ nodes, connectors }, connector.sourceId);
    const targetNode = getNodeById({ nodes, connectors }, connector.targetId);
    if (!sourceNode || !targetNode) {
      return;
    }

    const geometry = getConnectorPath(connector, sourceNode, targetNode);
    if (geometry.points.length < 2) {
      return;
    }

    const worldPoint = getWorldPoint(event);
    const { index } = findClosestPointOnPolyline(worldPoint, geometry.points);
    const start = geometry.points[index];
    const end = geometry.points[index + 1] ?? start;
    const axis = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'horizontal' : 'vertical';

    beginTransaction();
    const basePoints = geometry.points.map((point) => ({ ...point }));
    connectorDragStateRef.current = {
      pointerId: event.pointerId,
      connectorId: connector.id,
      kind: 'segment',
      segmentIndex: index,
      axis,
      mode: connector.mode,
      basePoints,
      workingPoints: basePoints.map((point) => ({ ...point })),
      originalWaypoints: connector.points?.map((point) => ({ ...point })) ?? [],
      currentWaypoints: connector.points?.map((point) => ({ ...point })) ?? [],
      initialPointer: worldPoint,
      moved: false
    };
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const handleConnectorHandlePointerDown = (
    event: React.PointerEvent<SVGPathElement>,
    connector: ConnectorModel,
    pointIndex: number
  ) => {
    if (tool !== 'select') {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    pendingTextEditRef.current = null;
    commitEditingIfNeeded();
    event.stopPropagation();

    const alreadySelected = selectedConnectorIds.includes(connector.id);
    if (!alreadySelected) {
      setSelection({ nodeIds: [], connectorIds: [connector.id] });
    }

    const sourceNode = getNodeById({ nodes, connectors }, connector.sourceId);
    const targetNode = getNodeById({ nodes, connectors }, connector.targetId);
    if (!sourceNode || !targetNode) {
      return;
    }
    if (connector.mode !== 'orthogonal') {
      return;
    }

    const geometry = getConnectorPath(connector, sourceNode, targetNode);
    if (!geometry.points[pointIndex + 1]) {
      return;
    }

    beginTransaction();
    const basePoints = geometry.points.map((point) => ({ ...point }));
    connectorDragStateRef.current = {
      pointerId: event.pointerId,
      connectorId: connector.id,
      kind: 'waypoint',
      waypointIndex: pointIndex,
      mode: connector.mode,
      basePoints,
      workingPoints: basePoints.map((point) => ({ ...point })),
      originalWaypoints: connector.points?.map((point) => ({ ...point })) ?? [],
      currentWaypoints: connector.points?.map((point) => ({ ...point })) ?? [],
      initialPointer: getWorldPoint(event),
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

    if (!selectedConnectorIds.includes(connector.id)) {
      setSelection({ nodeIds: [], connectorIds: [connector.id] });
    }

    if (endpoint === 'end') {
      setPendingConnection({
        type: 'reconnect-target',
        connectorId: connector.id,
        sourceId: connector.sourceId,
        initialTargetId: connector.targetId,
        worldPoint
      });
    } else {
      setPendingConnection({
        type: 'reconnect-source',
        connectorId: connector.id,
        targetId: connector.targetId,
        initialSourceId: connector.sourceId,
        worldPoint
      });
    }
  };

  const handleConnectorLabelPointerDown = (
    event: React.PointerEvent<SVGCircleElement>,
    connector: ConnectorModel
  ) => {
    if (event.button !== 0) {
      return;
    }

    pendingTextEditRef.current = null;
    commitEditingIfNeeded();
    event.stopPropagation();

    if (!selectedConnectorIds.includes(connector.id)) {
      setSelection({ nodeIds: [], connectorIds: [connector.id] });
    }

    const sourceNode = getNodeById({ nodes, connectors }, connector.sourceId);
    const targetNode = getNodeById({ nodes, connectors }, connector.targetId);
    if (!sourceNode || !targetNode) {
      return;
    }

    beginTransaction();
    connectorLabelDragRef.current = {
      pointerId: event.pointerId,
      connectorId: connector.id,
      originalPosition: connector.labelPosition ?? DEFAULT_CONNECTOR_LABEL_POSITION,
      originalOffset: connector.labelOffset ?? DEFAULT_CONNECTOR_LABEL_OFFSET,
      lastPosition: connector.labelPosition ?? DEFAULT_CONNECTOR_LABEL_POSITION,
      lastOffset: connector.labelOffset ?? DEFAULT_CONNECTOR_LABEL_OFFSET,
      moved: false
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

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        if (singleNodeSelected && !editingNodeId) {
          event.preventDefault();
          const nextWeight = singleNodeSelected.fontWeight >= 700 ? 600 : 700;
          applyStyles([singleNodeSelected.id], { fontWeight: nextWeight });
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey) {
        const key = event.key.toLowerCase();
        if (singleNodeSelected && !editingNodeId) {
          if (key === 'l' || key === 'c' || key === 'r') {
            event.preventDefault();
            const align = key === 'l' ? 'left' : key === 'c' ? 'center' : 'right';
            applyStyles([singleNodeSelected.id], { textAlign: align });
            return;
          }
        }
      }

      if (event.metaKey || event.ctrlKey) {
        if (!event.shiftKey && singleNodeSelected && !editingNodeId) {
          if (event.key === '=' || event.key === '+') {
            event.preventDefault();
            const next = Math.min(200, singleNodeSelected.fontSize + 1);
            applyStyles([singleNodeSelected.id], { fontSize: next });
            return;
          }
          if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            const next = Math.max(8, singleNodeSelected.fontSize - 1);
            applyStyles([singleNodeSelected.id], { fontSize: next });
            return;
          }
          if (event.key.toLowerCase() === 'k') {
            event.preventDefault();
            setLinkFocusSignal((value) => value + 1);
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
        if (connectorDragStateRef.current) {
          const drag = connectorDragStateRef.current;
          connectorDragStateRef.current = null;
          updateConnector(drag.connectorId, { points: drag.originalPoints });
          endTransaction();
          if (containerRef.current && drag.pointerId !== undefined) {
            releasePointerCapture(drag.pointerId);
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
    clearSelection,
    setSelection,
    handleDeleteSelection,
    selectedNodeIds,
    selectedNode,
    tool,
    applyStyles,
    editingNodeId,
    beginTextEditing,
    setLinkFocusSignal,
    commitEditingIfNeeded
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

  const pendingLine = useMemo(() => {
    if (!pendingConnection) {
      return null;
    }

    if (pendingConnection.type === 'reconnect-source') {
      const targetNode = getNodeById({ nodes, connectors }, pendingConnection.targetId);
      if (!targetNode) {
        return null;
      }
      const end = getConnectorAnchor(targetNode, pendingConnection.worldPoint);
      return { start: pendingConnection.worldPoint, end };
    }

    const sourceNode = getNodeById({ nodes, connectors }, pendingConnection.sourceId);
    if (!sourceNode) {
      return null;
    }
    const start = getConnectorAnchor(sourceNode, pendingConnection.worldPoint);
    return { start, end: pendingConnection.worldPoint };
  }, [pendingConnection, nodes, connectors]);

  return (
    <div
      ref={containerRef}
      className={`canvas-container ${isPanning ? 'is-panning' : ''}`}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
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
            id="arrow-start"
            markerWidth="16"
            markerHeight="16"
            refX="4"
            refY="6"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M12 2 L2 6 L12 10 Z" fill="#e5e7eb" />
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
          <marker
            id="dot-start"
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
              source={getNodeById({ nodes, connectors }, connector.sourceId)}
              target={getNodeById({ nodes, connectors }, connector.targetId)}
              selected={selectedConnectorIds.includes(connector.id)}
              labelEditing={editingConnectorId === connector.id}
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
              onRequestLabelEdit={() => handleConnectorRequestLabelEdit(connector.id)}
              onLabelPointerDown={(event) => handleConnectorLabelPointerDown(event, connector)}
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
        </g>
      {pendingLine && (
        <line
          className="connector-pending"
          x1={pendingLine.start.x * transform.scale + transform.x}
          y1={pendingLine.start.y * transform.scale + transform.y}
          x2={pendingLine.end.x * transform.scale + transform.x}
          y2={pendingLine.end.y * transform.scale + transform.y}
        />
      )}
      </svg>
      <div className="canvas-overlays" aria-hidden>
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
        {badgeScreens.map((badge) => (
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
          onModeChange={(mode) => handleConnectorModeChange(selectedConnector, mode)}
          onFlipDirection={() => handleConnectorFlip(selectedConnector)}
          onTidyPath={() => handleConnectorTidy(selectedConnector)}
        />
      )}
      {selectedConnector && editingConnectorId === selectedConnector.id && (
        <ConnectorTextToolbar
          connector={selectedConnector}
          anchor={connectorLabelToolbarAnchor}
          viewportSize={viewport}
          isVisible={tool === 'select' && !isPanning && editingConnectorId === selectedConnector.id}
          onChange={(style) => handleConnectorLabelStyleChange(selectedConnector, style)}
        />
      )}
      {selectedNode && (
        <SelectionToolbar
          node={selectedNode}
          nodeIds={[selectedNode.id]}
          anchor={toolbarAnchor}
          viewportSize={viewport}
          isVisible={tool === 'select' && !isPanning}
          focusLinkSignal={linkFocusSignal}
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
        />
      )}
    </div>
  );
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
  switch (tool) {
    case 'rectangle':
    case 'rounded-rectangle':
    case 'ellipse':
    case 'diamond':
      return getDefaultNodeSize(tool);
    default:
      return { width: GRID_SIZE * 4, height: GRID_SIZE * 4 };
  }
};

export const Canvas = forwardRef(CanvasComponent);
