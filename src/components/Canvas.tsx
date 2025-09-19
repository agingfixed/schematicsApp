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
  screenToWorld
} from '../utils/scene';
import {
  selectConnectors,
  selectGridVisible,
  selectNodes,
  selectSelection,
  selectTool,
  useSceneStore
} from '../state/sceneStore';
import { DiagramNode } from './DiagramNode';
import { DiagramConnector } from './DiagramConnector';
import '../styles/canvas.css';

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const ZOOM_FACTOR = 1.1;
const FIT_PADDING = 160;

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
  lastWorld: Vec2;
}

interface PendingConnection {
  sourceId: string;
  worldPoint: Vec2;
}

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
  const connectionPointerRef = useRef<number | null>(null);
  const initialFitDoneRef = useRef(false);

  const nodes = useSceneStore(selectNodes);
  const connectors = useSceneStore(selectConnectors);
  const selection = useSceneStore(selectSelection);
  const tool = useSceneStore(selectTool);
  const gridVisible = useSceneStore(selectGridVisible);
  const setSelection = useSceneStore((state) => state.setSelection);
  const clearSelection = useSceneStore((state) => state.clearSelection);
  const addNode = useSceneStore((state) => state.addNode);
  const removeNode = useSceneStore((state) => state.removeNode);
  const beginTransaction = useSceneStore((state) => state.beginTransaction);
  const endTransaction = useSceneStore((state) => state.endTransaction);
  const batchMove = useSceneStore((state) => state.batchMove);
  const addConnector = useSceneStore((state) => state.addConnector);
  const removeConnector = useSceneStore((state) => state.removeConnector);
  const updateNode = useSceneStore((state) => state.updateNode);
  const updateConnector = useSceneStore((state) => state.updateConnector);
  const setGlobalTransform = useSceneStore((state) => state.setTransform);

  const selectedNodeIds = selection.nodeIds;
  const selectedConnectorIds = selection.connectorIds;

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

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

  useEffect(() => {
    setGlobalTransform(transform);
    onTransformChange?.(transform);
  }, [transform, onTransformChange, setGlobalTransform]);

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

    if (tool === 'pan' || event.button === 1 || event.button === 2) {
      beginPan(event);
      return;
    }

    if (event.button !== 0) {
      return;
    }

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
      const worldPoint = getWorldPoint(event);
      const delta = {
        x: worldPoint.x - dragState.lastWorld.x,
        y: worldPoint.y - dragState.lastWorld.y
      };
      if (Math.abs(delta.x) > 0.0001 || Math.abs(delta.y) > 0.0001) {
        batchMove(dragState.nodeIds, delta);
        dragStateRef.current = { ...dragState, lastWorld: worldPoint };
      }
      return;
    }

    if (connectionPointerRef.current === event.pointerId && pendingConnection) {
      const worldPoint = getWorldPoint(event);
      setPendingConnection({ ...pendingConnection, worldPoint });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsPanning(false);
      containerRef.current?.releasePointerCapture(event.pointerId);
    }

    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      endTransaction();
      containerRef.current?.releasePointerCapture(event.pointerId);
    }

    if (connectionPointerRef.current === event.pointerId) {
      setPendingConnection(null);
      connectionPointerRef.current = null;
      containerRef.current?.releasePointerCapture(event.pointerId);
    }
  };

  const handleNodePointerDown = (event: React.PointerEvent, node: NodeModel) => {
    if (tool === 'connector') {
      const worldPoint = getWorldPoint(event);
      setPendingConnection({ sourceId: node.id, worldPoint });
      connectionPointerRef.current = event.pointerId;
      containerRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (tool !== 'select') {
      return;
    }

    const isSelected = selectedNodeIds.includes(node.id);
    let nextSelection = selectedNodeIds;
    if (event.shiftKey) {
      nextSelection = isSelected
        ? selectedNodeIds.filter((id) => id !== node.id)
        : [...selectedNodeIds, node.id];
    } else if (!isSelected) {
      nextSelection = [node.id];
    }
    setSelection({ nodeIds: nextSelection, connectorIds: [] });

    if (event.detail > 1) {
      return;
    }

    const worldPoint = getWorldPoint(event);
    const nodeIdsToDrag = nextSelection.length ? nextSelection : [node.id];
    beginTransaction();
    dragStateRef.current = {
      pointerId: event.pointerId,
      nodeIds: nodeIdsToDrag,
      lastWorld: worldPoint
    };
    containerRef.current?.setPointerCapture(event.pointerId);
  };

  const handleNodePointerUp = (event: React.PointerEvent, node: NodeModel) => {
    if (tool === 'connector' && pendingConnection && pendingConnection.sourceId !== node.id) {
      addConnector(pendingConnection.sourceId, node.id);
      setPendingConnection(null);
      connectionPointerRef.current = null;
      containerRef.current?.releasePointerCapture(event.pointerId);
    }
  };

  const handleConnectorPointerDown = (event: React.PointerEvent, connectorId: string) => {
    if (tool !== 'select') {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const alreadySelected = selectedConnectorIds.includes(connectorId);
    let nextSelection = selectedConnectorIds;
    if (event.shiftKey) {
      nextSelection = alreadySelected
        ? selectedConnectorIds.filter((id) => id !== connectorId)
        : [...selectedConnectorIds, connectorId];
    } else if (!alreadySelected) {
      nextSelection = [connectorId];
    }
    setSelection({ nodeIds: [], connectorIds: nextSelection });
  };

  const handleDeleteSelection = useCallback(() => {
    selectedNodeIds.forEach((id) => removeNode(id));
    selectedConnectorIds.forEach((id) => removeConnector(id));
  }, [selectedNodeIds, selectedConnectorIds, removeNode, removeConnector]);

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

      if ((event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        handleDeleteSelection();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const allNodeIds = nodes.map((node) => node.id);
        setSelection({ nodeIds: allNodeIds, connectorIds: [] });
      }
      if (event.key === 'Escape') {
        clearSelection();
        setPendingConnection(null);
        if (connectionPointerRef.current !== null) {
          containerRef.current?.releasePointerCapture(connectionPointerRef.current);
          connectionPointerRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, clearSelection, setSelection, handleDeleteSelection]);

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
    const sourceNode = getNodeById({ nodes, connectors }, pendingConnection.sourceId);
    if (!sourceNode) {
      return null;
    }
    const start = {
      x: sourceNode.position.x + sourceNode.size.width / 2,
      y: sourceNode.position.y + sourceNode.size.height / 2
    };
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
              onPointerDown={(event) => handleConnectorPointerDown(event, connector.id)}
              onUpdateLabel={(value) =>
                updateConnector(connector.id, {
                  label: value
                })
              }
            />
          ))}
          {nodes.map((node) => (
            <DiagramNode
              key={node.id}
              node={node}
              selected={selectedNodeIds.includes(node.id)}
              hovered={hoveredNodeId === node.id}
              tool={tool as Tool}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onPointerUp={(event) => handleNodePointerUp(event, node)}
              onPointerEnter={() => setHoveredNodeId(node.id)}
              onPointerLeave={() => setHoveredNodeId((prev) => (prev === node.id ? null : prev))}
              onLabelChange={(value) => updateNode(node.id, { label: value })}
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
