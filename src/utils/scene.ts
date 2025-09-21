import { nanoid } from 'nanoid';
import {
  CanvasTransform,
  NodeKind,
  NodeModel,
  SceneContent,
  Vec2
} from '../types/scene';
import { cloneConnectorEndpoint } from './connector';

export const GRID_SIZE = 32;

const defaultNodeAppearance: Record<
  NodeKind,
  { fill: string; stroke: string; strokeWidth: number; cornerRadius?: number }
> = {
  rectangle: {
    fill: '#1f2937',
    stroke: '#3b82f6',
    strokeWidth: 2
  },
  'rounded-rectangle': {
    fill: '#1f2937',
    stroke: '#22d3ee',
    strokeWidth: 2,
    cornerRadius: 16
  },
  ellipse: {
    fill: '#1f2937',
    stroke: '#f472b6',
    strokeWidth: 2
  },
  diamond: {
    fill: '#1f2937',
    stroke: '#f59e0b',
    strokeWidth: 2
  }
};

const defaultNodeSizes: Record<NodeKind, { width: number; height: number }> = {
  rectangle: { width: 220, height: 120 },
  'rounded-rectangle': { width: 220, height: 120 },
  ellipse: { width: 200, height: 200 },
  diamond: { width: 220, height: 160 }
};

export const createNodeModel = (shape: NodeKind, position: Vec2, text?: string): NodeModel => {
  const size = defaultNodeSizes[shape];
  const appearance = defaultNodeAppearance[shape];

  return {
    id: nanoid(),
    shape,
    position: { ...position },
    size: { ...size },
    text: text ?? defaultLabel(shape),
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 600,
    fill: appearance.fill,
    fillOpacity: 1,
    stroke: { color: appearance.stroke, width: appearance.strokeWidth },
    cornerRadius: appearance.cornerRadius
  };
};

export const getDefaultNodeSize = (shape: NodeKind) => ({ ...defaultNodeSizes[shape] });

const defaultLabel = (type: NodeKind) => {
  switch (type) {
    case 'rectangle':
      return 'Process';
    case 'rounded-rectangle':
      return 'Terminator';
    case 'ellipse':
      return 'Start';
    case 'diamond':
      return 'Decision';
    default:
      return 'Step';
  }
};

export const cloneScene = (scene: SceneContent): SceneContent => ({
  nodes: scene.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    stroke: { ...node.stroke },
    link: node.link ? { ...node.link } : undefined
  })),
  connectors: scene.connectors.map((connector) => ({
    ...connector,
    source: cloneConnectorEndpoint(connector.source),
    target: cloneConnectorEndpoint(connector.target),
    points: connector.points?.map((point) => ({ ...point }))
  }))
});

export const snapToGrid = (value: number, gridSize = GRID_SIZE): number =>
  Math.round(value / gridSize) * gridSize;

export const screenToWorld = (
  x: number,
  y: number,
  transform: CanvasTransform
): Vec2 => ({
  x: (x - transform.x) / transform.scale,
  y: (y - transform.y) / transform.scale
});

export const worldToScreen = (
  point: Vec2,
  transform: CanvasTransform
): Vec2 => ({
  x: point.x * transform.scale + transform.x,
  y: point.y * transform.scale + transform.y
});

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const emptyBounds = (): Bounds => ({
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0
});

export const expandBounds = (bounds: Bounds, padding: number): Bounds => ({
  minX: bounds.minX - padding,
  minY: bounds.minY - padding,
  maxX: bounds.maxX + padding,
  maxY: bounds.maxY + padding
});

export const getSceneBounds = (scene: SceneContent, nodeIds?: string[]): Bounds | null => {
  const nodes = nodeIds?.length
    ? scene.nodes.filter((node) => nodeIds.includes(node.id))
    : scene.nodes;

  if (!nodes.length) {
    return null;
  }

  const initial = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };

  const bounds = nodes.reduce((acc, node) => {
    acc.minX = Math.min(acc.minX, node.position.x);
    acc.minY = Math.min(acc.minY, node.position.y);
    acc.maxX = Math.max(acc.maxX, node.position.x + node.size.width);
    acc.maxY = Math.max(acc.maxY, node.position.y + node.size.height);
    return acc;
  }, initial);

  return bounds;
};

export const boundsToSize = (bounds: Bounds) => ({
  width: bounds.maxX - bounds.minX,
  height: bounds.maxY - bounds.minY
});

export const centerOfBounds = (bounds: Bounds): Vec2 => ({
  x: bounds.minX + (bounds.maxX - bounds.minX) / 2,
  y: bounds.minY + (bounds.maxY - bounds.minY) / 2
});

export const getNodeById = (scene: SceneContent, id: string): NodeModel | undefined =>
  scene.nodes.find((node) => node.id === id);

export const connectorArrowId = (type: 'arrow' | 'dot', suffix: 'start' | 'end') =>
  `${type}-${suffix}`;
