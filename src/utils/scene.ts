import { nanoid } from 'nanoid';
import {
  CanvasTransform,
  DrawStroke,
  NodeImageData,
  NodeKind,
  NodeModel,
  NodeShape,
  SceneContent,
  Vec2,
  cloneConnectorEndpointStyles
} from '../types/scene';
import { cloneConnectorEndpoint } from './connector';
import { ensureHtmlContent } from './text';

export const GRID_SIZE = 32;

const defaultNodeAppearance: Record<
  NodeShape,
  { fill: string; stroke: string; strokeWidth: number; cornerRadius?: number }
> = {
  rectangle: {
    fill: '#1f2937',
    stroke: '#3b82f6',
    strokeWidth: 2
  },
  circle: {
    fill: '#1f2937',
    stroke: '#22d3ee',
    strokeWidth: 2
  },
  ellipse: {
    fill: '#1f2937',
    stroke: '#a855f7',
    strokeWidth: 2
  },
  triangle: {
    fill: '#1f2937',
    stroke: '#f97316',
    strokeWidth: 2
  },
  diamond: {
    fill: '#1f2937',
    stroke: '#f59e0b',
    strokeWidth: 2
  }
};

const defaultNodeSizes: Record<NodeShape, { width: number; height: number }> = {
  rectangle: { width: 220, height: 120 },
  circle: { width: 200, height: 200 },
  ellipse: { width: 240, height: 160 },
  triangle: { width: 220, height: 200 },
  diamond: { width: 220, height: 160 }
};

const textNodeDefaults = {
  size: { width: 320, height: 200 },
  text: 'Text',
  fontSize: 20,
  fontWeight: 400 as const,
  textAlign: 'left' as const,
  textColor: '#e2e8f0',
  fill: 'transparent',
  fillOpacity: 0,
  stroke: { color: 'transparent', width: 1 }
};

const imageNodeDefaults = {
  size: { width: 320, height: 220 },
  stroke: { color: 'rgba(15, 23, 42, 0.65)', width: 1 }
};

export interface CreateNodeOptions {
  text?: string;
  image?: NodeImageData;
  size?: { width: number; height: number };
}

export const createNodeModel = (
  shape: NodeKind,
  position: Vec2,
  options: CreateNodeOptions = {}
): NodeModel => {
  if (shape === 'text' || shape === 'link') {
    const defaultText = shape === 'link' ? 'Link' : textNodeDefaults.text;
    const size = options.size ?? textNodeDefaults.size;
    return {
      id: nanoid(),
      shape,
      position: { ...position },
      size: { ...size },
      text: ensureHtmlContent(options.text ?? defaultText),
      textAlign: textNodeDefaults.textAlign,
      fontSize: textNodeDefaults.fontSize,
      fontWeight: textNodeDefaults.fontWeight,
      textColor: textNodeDefaults.textColor,
      fill: textNodeDefaults.fill,
      fillOpacity: textNodeDefaults.fillOpacity,
      stroke: { ...textNodeDefaults.stroke }
    };
  }

  if (shape === 'image') {
    const size = options.size ?? { ...imageNodeDefaults.size };
    return {
      id: nanoid(),
      shape,
      position: { ...position },
      size: { ...size },
      text: '',
      textAlign: 'center',
      fontSize: 18,
      fontWeight: 600,
      textColor: '#e2e8f0',
      fill: '#0f172a',
      fillOpacity: 1,
      stroke: { ...imageNodeDefaults.stroke },
      image: options.image ? { ...options.image } : undefined
    };
  }

  const hasDefaults = Object.prototype.hasOwnProperty.call(defaultNodeSizes, shape);
  const kind: NodeShape = hasDefaults ? (shape as NodeShape) : 'rectangle';
  const size = defaultNodeSizes[kind];
  const appearance = defaultNodeAppearance[kind];

  const node: NodeModel = {
    id: nanoid(),
    shape: kind,
    position: { ...position },
    size: { ...size },
    text: ensureHtmlContent(options.text ?? defaultLabel(kind)),
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 600,
    textColor: '#e2e8f0',
    fill: appearance.fill,
    fillOpacity: 1,
    stroke: { color: appearance.stroke, width: appearance.strokeWidth }
  };

  if (appearance.cornerRadius !== undefined) {
    node.cornerRadius = appearance.cornerRadius;
  }

  return node;
};

export const getDefaultNodeSize = (shape: NodeKind) => {
  if (shape === 'text' || shape === 'link') {
    return { ...textNodeDefaults.size };
  }
  if (shape === 'image') {
    return { ...imageNodeDefaults.size };
  }
  const key = Object.prototype.hasOwnProperty.call(defaultNodeSizes, shape)
    ? (shape as NodeShape)
    : 'rectangle';
  return { ...defaultNodeSizes[key] };
};

const defaultLabel = (type: NodeKind) => {
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const cloneDrawStroke = (stroke: DrawStroke): DrawStroke => ({
  ...stroke,
  points: stroke.points.map((point) => ({ ...point }))
});

export const cloneScene = (scene: SceneContent): SceneContent => ({
  nodes: scene.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    stroke: { ...node.stroke },
    textColor: node.textColor,
    link: node.link ? { ...node.link } : undefined,
    image: node.image ? { ...node.image } : undefined
  })),
  connectors: scene.connectors.map((connector) => ({
    ...connector,
    source: cloneConnectorEndpoint(connector.source),
    target: cloneConnectorEndpoint(connector.target),
    style: { ...connector.style },
    labelStyle: connector.labelStyle ? { ...connector.labelStyle } : undefined,
    endpointStyles: cloneConnectorEndpointStyles(connector.endpointStyles),
    points: connector.points?.map((point) => ({ ...point }))
  })),
  drawings: (scene.drawings ?? []).map((stroke) => cloneDrawStroke(stroke))
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

  const drawings = scene.drawings ?? [];

  const initial = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };

  const boundsFromNodes = nodes.reduce((acc, node) => {
    acc.minX = Math.min(acc.minX, node.position.x);
    acc.minY = Math.min(acc.minY, node.position.y);
    acc.maxX = Math.max(acc.maxX, node.position.x + node.size.width);
    acc.maxY = Math.max(acc.maxY, node.position.y + node.size.height);
    return acc;
  }, initial);

  const bounds = drawings.reduce((acc, stroke) => {
    stroke.points.forEach((point) => {
      acc.minX = Math.min(acc.minX, point.x);
      acc.minY = Math.min(acc.minY, point.y);
      acc.maxX = Math.max(acc.maxX, point.x);
      acc.maxY = Math.max(acc.maxY, point.y);
    });
    return acc;
  }, boundsFromNodes);

  const hasContent =
    nodes.length > 0 || drawings.some((stroke) => stroke.points && stroke.points.length > 0);

  if (!hasContent) {
    return null;
  }

  if (
    bounds.minX === Number.POSITIVE_INFINITY ||
    bounds.minY === Number.POSITIVE_INFINITY ||
    bounds.maxX === Number.NEGATIVE_INFINITY ||
    bounds.maxY === Number.NEGATIVE_INFINITY
  ) {
    return null;
  }

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
