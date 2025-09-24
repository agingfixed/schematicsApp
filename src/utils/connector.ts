import {
  CardinalConnectorPort,
  ConnectorEndpoint,
  ConnectorModel,
  NodeModel,
  Vec2,
  isAttachedConnectorEndpoint,
  isFloatingConnectorEndpoint
} from '../types/scene';

const EPSILON = 1e-6;
const resolveIsDev = () => {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.DEV !== undefined) {
    return Boolean(import.meta.env?.DEV);
  }
  const maybeProcess =
    typeof globalThis !== 'undefined'
      ? (globalThis as { process?: { env?: Record<string, unknown> } }).process
      : undefined;
  const nodeEnv = maybeProcess?.env?.NODE_ENV;
  if (typeof nodeEnv === 'string') {
    return nodeEnv !== 'production';
  }
  return true;
};

const IS_DEV = resolveIsDev();

const assertInvariant = (condition: unknown, message: string) => {
  if (IS_DEV && !condition) {
    throw new Error(message);
  }
};
const AUTO_COLLAPSE_DISTANCE = 10;
const AUTO_COLLAPSE_ANGLE = (9 * Math.PI) / 180;
const MIN_SEGMENT_LENGTH = 8;
const ALIGNMENT_SNAP_DISTANCE = 6;
const ROUNDING_STEP = 0.5;
/**
 * Default clearance (in pixels) between connector segments and nearby nodes.
 * Adjust this export to tighten or loosen the avoidance cushion globally.
 */
export const CONNECTOR_NODE_AVOIDANCE_CLEARANCE = 24;
const NODE_AVOIDANCE_PADDING = CONNECTOR_NODE_AVOIDANCE_CLEARANCE;
const NODE_AVOIDANCE_DETOUR = 8;
const MAX_AVOIDANCE_PASSES = 4;
const ARROW_BASE_LENGTH = 12;
const MIN_PORT_STUB_LENGTH = 24;
const PORT_STUB_EXTRA_MARGIN = 6;
const PORT_STUB_LENGTH_TOLERANCE = 0.25;
export const CARDINAL_PORTS: CardinalConnectorPort[] = ['top', 'right', 'bottom', 'left'];
const CARDINAL_PORT_LOOKUP = new Set<string>(CARDINAL_PORTS);

export const isCardinalConnectorPortValue = (value: unknown): value is CardinalConnectorPort =>
  typeof value === 'string' && CARDINAL_PORT_LOOKUP.has(value);

const assertCardinalPort = (value: unknown, context: string) => {
  assertInvariant(
    isCardinalConnectorPortValue(value),
    `${context} must use a cardinal port. Received "${String(value)}".`
  );
};

type SegmentAxis = 'horizontal' | 'vertical';

export const getNodeCenter = (node: NodeModel): Vec2 => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2
});

const getRectangleAnchor = (center: Vec2, halfWidth: number, halfHeight: number, toward: Vec2): Vec2 => {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return { ...center };
  }

  const scaleX = Math.abs(dx) < EPSILON ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const scaleY = Math.abs(dy) < EPSILON ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale
  };
};

const getEllipseAnchor = (center: Vec2, radiusX: number, radiusY: number, toward: Vec2): Vec2 => {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return { ...center };
  }

  const denom = Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));

  if (denom < EPSILON) {
    return { ...center };
  }

  const scale = 1 / denom;

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale
  };
};

const getDiamondAnchor = (center: Vec2, halfWidth: number, halfHeight: number, toward: Vec2): Vec2 => {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return { ...center };
  }

  const denom = Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight;

  if (denom < EPSILON) {
    return { ...center };
  }

  const scale = 1 / denom;

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale
  };
};

const getTriangleAnchor = (center: Vec2, halfWidth: number, halfHeight: number, toward: Vec2): Vec2 => {
  const to = { x: toward.x - center.x, y: toward.y - center.y };

  if (Math.abs(to.x) < EPSILON && Math.abs(to.y) < EPSILON) {
    return { ...center };
  }

  const vertices: Vec2[] = [
    { x: 0, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight }
  ];

  const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPoint: Vec2 | null = null;

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const edge = { x: next.x - current.x, y: next.y - current.y };
    const denom = cross(to, edge);

    if (Math.abs(denom) < EPSILON) {
      continue;
    }

    const distanceAlongRay = cross(current, edge) / denom;
    const edgePosition = cross(current, to) / denom;

    if (distanceAlongRay < 0 || edgePosition < 0 || edgePosition > 1) {
      continue;
    }

    if (distanceAlongRay < bestDistance) {
      bestDistance = distanceAlongRay;
      bestPoint = {
        x: center.x + to.x * distanceAlongRay,
        y: center.y + to.y * distanceAlongRay
      };
    }
  }

  return bestPoint ?? { ...center };
};

export const getConnectorAnchor = (node: NodeModel, toward: Vec2): Vec2 => {
  const center = getNodeCenter(node);
  const halfWidth = node.size.width / 2;
  const halfHeight = node.size.height / 2;

  switch (node.shape) {
    case 'circle':
    case 'ellipse':
      return getEllipseAnchor(center, halfWidth, halfHeight, toward);
    case 'diamond':
      return getDiamondAnchor(center, halfWidth, halfHeight, toward);
    case 'triangle':
      return getTriangleAnchor(center, halfWidth, halfHeight, toward);
    default:
      return getRectangleAnchor(center, halfWidth, halfHeight, toward);
  }
};

export const getConnectorPortPositions = (
  node: NodeModel
): Record<CardinalConnectorPort, Vec2> => {
  const center = getNodeCenter(node);
  return {
    top: { x: center.x, y: node.position.y },
    right: { x: node.position.x + node.size.width, y: center.y },
    bottom: { x: center.x, y: node.position.y + node.size.height },
    left: { x: node.position.x, y: center.y }
  };
};

export const getConnectorPortAnchor = (node: NodeModel, port: CardinalConnectorPort): Vec2 => {
  assertCardinalPort(port, 'Connector endpoint');
  const positions = getConnectorPortPositions(node);
  return positions[port];
};

export const getNearestConnectorPort = (node: NodeModel, point: Vec2): CardinalConnectorPort => {
  const positions = getConnectorPortPositions(node);
  let best: CardinalConnectorPort = 'top';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const key of CARDINAL_PORTS) {
    const current = positions[key];
    const distance = Math.hypot(current.x - point.x, current.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }

  return best;
};

const PORT_AXIS: Record<CardinalConnectorPort, SegmentAxis> = {
  top: 'vertical',
  bottom: 'vertical',
  left: 'horizontal',
  right: 'horizontal'
};

const PORT_DIRECTION: Record<CardinalConnectorPort, -1 | 1> = {
  top: -1,
  bottom: 1,
  left: -1,
  right: 1
};

const createPortStubPoint = (anchor: Vec2, port: CardinalConnectorPort, clearance: number): Vec2 => {
  const direction = PORT_DIRECTION[port];
  const axis = PORT_AXIS[port];

  if (axis === 'vertical') {
    return { x: anchor.x, y: anchor.y + direction * clearance };
  }

  return { x: anchor.x + direction * clearance, y: anchor.y };
};

const STUB_AXIS_TOLERANCE = ROUNDING_STEP + 0.01;
const STUB_LENGTH_TOLERANCE = PORT_STUB_LENGTH_TOLERANCE + ROUNDING_STEP + EPSILON;

const matchesStubSegment = (
  from: Vec2,
  to: Vec2,
  axis: SegmentAxis,
  direction: -1 | 1,
  desiredLength: number
): boolean => {
  if (desiredLength <= EPSILON) {
    return false;
  }

  if (axis === 'horizontal') {
    const dy = Math.abs(to.y - from.y);
    if (dy > STUB_AXIS_TOLERANCE) {
      return false;
    }
    const dx = to.x - from.x;
    const sign = Math.sign(dx || direction);
    if (sign !== direction) {
      return false;
    }
    const length = Math.abs(dx);
    return Math.abs(length - desiredLength) <= STUB_LENGTH_TOLERANCE;
  }

  const dx = Math.abs(to.x - from.x);
  if (dx > STUB_AXIS_TOLERANCE) {
    return false;
  }
  const dy = to.y - from.y;
  const sign = Math.sign(dy || direction);
  if (sign !== direction) {
    return false;
  }
  const length = Math.abs(dy);
  return Math.abs(length - desiredLength) <= STUB_LENGTH_TOLERANCE;
};

export const stripConnectorStubs = (
  connector: ConnectorModel,
  start: Vec2,
  waypoints: Vec2[],
  end: Vec2
): Vec2[] => {
  if (!waypoints.length) {
    return [];
  }

  const strokeWidth = connector.style.strokeWidth ?? 2;
  const preferAvoidance = connector.mode !== 'straight' && connector.style.avoidNodes !== false;
  const baseClearance = Math.max(strokeWidth + 4, 12);
  const clearance = preferAvoidance
    ? Math.max(baseClearance, CONNECTOR_NODE_AVOIDANCE_CLEARANCE)
    : baseClearance;
  const cornerRadius =
    connector.mode === 'elbow' ? Math.max(0, connector.style.cornerRadius ?? 12) : 0;
  const arrowScale = Math.max(0, connector.style.arrowSize ?? 1);
  const startArrowShape = connector.style.startArrow?.shape ?? 'none';
  const endArrowShape = connector.style.endArrow?.shape ?? 'none';
  const startArrowLength = startArrowShape !== 'none' ? arrowScale * ARROW_BASE_LENGTH : 0;
  const endArrowLength = endArrowShape !== 'none' ? arrowScale * ARROW_BASE_LENGTH : 0;
  const stubMargin = Math.max(PORT_STUB_EXTRA_MARGIN, strokeWidth + 2);
  const baseStubLength = Math.max(clearance, MIN_PORT_STUB_LENGTH);

  const sourceAttachment = isAttachedConnectorEndpoint(connector.source) ? connector.source : null;
  const targetAttachment = isAttachedConnectorEndpoint(connector.target) ? connector.target : null;

  const desiredStartStubLength = sourceAttachment
    ? Math.max(baseStubLength, startArrowLength + cornerRadius + stubMargin)
    : baseStubLength;
  const desiredEndStubLength = targetAttachment
    ? Math.max(baseStubLength, endArrowLength + cornerRadius + stubMargin)
    : baseStubLength;

  const trimmed = waypoints.map((point) => clonePoint(point));

  if (sourceAttachment && trimmed.length) {
    const first = trimmed[0];
    const axis = PORT_AXIS[sourceAttachment.port];
    const direction = PORT_DIRECTION[sourceAttachment.port];
    if (matchesStubSegment(start, first, axis, direction, desiredStartStubLength)) {
      trimmed.shift();
    }
  }

  if (targetAttachment && trimmed.length) {
    const lastIndex = trimmed.length - 1;
    const last = trimmed[lastIndex];
    const axis = PORT_AXIS[targetAttachment.port];
    const direction = (-PORT_DIRECTION[targetAttachment.port]) as -1 | 1;
    if (matchesStubSegment(last, end, axis, direction, desiredEndStubLength)) {
      trimmed.pop();
    }
  }

  return trimmed;
};

export interface ConnectorPath {
  start: Vec2;
  end: Vec2;
  waypoints: Vec2[];
  points: Vec2[];
}

const clonePoint = (point: Vec2): Vec2 => ({ x: point.x, y: point.y });

const roundToStep = (value: number, step: number) => Math.round(value / step) * step;

const roundPoint = (point: Vec2): Vec2 => ({
  x: roundToStep(point.x, ROUNDING_STEP),
  y: roundToStep(point.y, ROUNDING_STEP)
});

const snapValue = (value: number, target: number, threshold: number) =>
  Math.abs(value - target) <= threshold ? target : value;

const snapPointsToNeighbors = (points: Vec2[]): void => {
  if (points.length < 3) {
    return;
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];

    current.x = snapValue(current.x, prev.x, ALIGNMENT_SNAP_DISTANCE);
    current.x = snapValue(current.x, next.x, ALIGNMENT_SNAP_DISTANCE);
    current.y = snapValue(current.y, prev.y, ALIGNMENT_SNAP_DISTANCE);
    current.y = snapValue(current.y, next.y, ALIGNMENT_SNAP_DISTANCE);
  }
};

export const cloneConnectorEndpoint = (endpoint: ConnectorEndpoint): ConnectorEndpoint => {
  if (isAttachedConnectorEndpoint(endpoint)) {
    assertCardinalPort(endpoint.port, 'Connector endpoint');
    return { nodeId: endpoint.nodeId, port: endpoint.port };
  }

  return { position: { ...endpoint.position } };
};

export const buildRoundedConnectorPath = (points: Vec2[], radius: number): string => {
  if (!points.length) {
    return '';
  }
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  const clampRadius = Math.max(0, radius || 0);
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];

    if (index < points.length - 1 && clampRadius > 0.01) {
      const next = points[index + 1];
      const incoming = { x: current.x - previous.x, y: current.y - previous.y };
      const outgoing = { x: next.x - current.x, y: next.y - current.y };
      const incomingLength = Math.hypot(incoming.x, incoming.y);
      const outgoingLength = Math.hypot(outgoing.x, outgoing.y);

      if (incomingLength > 0.01 && outgoingLength > 0.01) {
        const inUnit = { x: incoming.x / incomingLength, y: incoming.y / incomingLength };
        const outUnit = { x: outgoing.x / outgoingLength, y: outgoing.y / outgoingLength };
        const safeRadius = Math.min(clampRadius, incomingLength / 2, outgoingLength / 2);
        const before = {
          x: current.x - inUnit.x * safeRadius,
          y: current.y - inUnit.y * safeRadius
        };
        const after = {
          x: current.x + outUnit.x * safeRadius,
          y: current.y + outUnit.y * safeRadius
        };
        path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
        continue;
      }
    }

    path += ` L ${current.x} ${current.y}`;
  }

  return path;
};

const nearlyEqual = (a: number, b: number, tolerance = EPSILON) => Math.abs(a - b) <= tolerance;

interface ObstacleRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const expandNodeObstacle = (node: NodeModel, padding: number): ObstacleRect => ({
  left: node.position.x - padding,
  right: node.position.x + node.size.width + padding,
  top: node.position.y - padding,
  bottom: node.position.y + node.size.height + padding
});

const expandObstacleRect = (rect: ObstacleRect, padding: number): ObstacleRect => ({
  left: rect.left - padding,
  right: rect.right + padding,
  top: rect.top - padding,
  bottom: rect.bottom + padding
});

const pushPointIfNeeded = (list: Vec2[], point: Vec2) => {
  const rounded = roundPoint(point);
  const last = list[list.length - 1];
  if (!last || !nearlyEqual(last.x, rounded.x) || !nearlyEqual(last.y, rounded.y)) {
    list.push(rounded);
  }
};

const rectContainsPoint = (rect: ObstacleRect, point: Vec2, tolerance = EPSILON) =>
  point.x > rect.left + tolerance &&
  point.x < rect.right - tolerance &&
  point.y > rect.top + tolerance &&
  point.y < rect.bottom - tolerance;

const segmentIntersectsRect = (a: Vec2, b: Vec2, rect: ObstacleRect): boolean => {
  if (nearlyEqual(a.y, b.y)) {
    const y = a.y;
    if (y < rect.top - EPSILON || y > rect.bottom + EPSILON) {
      return false;
    }
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const overlapStart = Math.max(minX, rect.left);
    const overlapEnd = Math.min(maxX, rect.right);
    return overlapEnd - overlapStart > EPSILON;
  }

  if (nearlyEqual(a.x, b.x)) {
    const x = a.x;
    if (x < rect.left - EPSILON || x > rect.right + EPSILON) {
      return false;
    }
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const overlapStart = Math.max(minY, rect.top);
    const overlapEnd = Math.min(maxY, rect.bottom);
    return overlapEnd - overlapStart > EPSILON;
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number) => {
    if (Math.abs(p) < EPSILON) {
      return q > 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) {
        return false;
      }
      if (r > t0) {
        t0 = r;
      }
    } else {
      if (r < t0) {
        return false;
      }
      if (r < t1) {
        t1 = r;
      }
    }
    return true;
  };

  if (
    clip(-dx, a.x - rect.left) &&
    clip(dx, rect.right - a.x) &&
    clip(-dy, a.y - rect.top) &&
    clip(dy, rect.bottom - a.y)
  ) {
    return t0 < t1 - EPSILON && t0 <= 1 + EPSILON && t1 >= -EPSILON;
  }

  return false;
};

const axisSegmentCrossesRect = (a: Vec2, b: Vec2, rect: ObstacleRect): boolean => {
  if (nearlyEqual(a.x, b.x)) {
    const x = a.x;
    if (x < rect.left - EPSILON || x > rect.right + EPSILON) {
      return false;
    }
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const overlapStart = Math.max(minY, rect.top);
    const overlapEnd = Math.min(maxY, rect.bottom);
    return overlapEnd - overlapStart > EPSILON;
  }

  if (nearlyEqual(a.y, b.y)) {
    const y = a.y;
    if (y < rect.top - EPSILON || y > rect.bottom + EPSILON) {
      return false;
    }
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const overlapStart = Math.max(minX, rect.left);
    const overlapEnd = Math.min(maxX, rect.right);
    return overlapEnd - overlapStart > EPSILON;
  }

  return segmentIntersectsRect(a, b, rect);
};

const segmentIntersectsAnyRect = (a: Vec2, b: Vec2, obstacles: ObstacleRect[]) =>
  obstacles.some((rect) => segmentIntersectsRect(a, b, rect));

const polylineIntersectsAnyRect = (points: Vec2[], obstacles: ObstacleRect[]) => {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsAnyRect(points[index], points[index + 1], obstacles)) {
      return true;
    }
  }
  return false;
};

const createDefaultOrthogonalWaypoints = (start: Vec2, end: Vec2): Vec2[] => {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);

  if (dx < EPSILON || dy < EPSILON) {
    return [];
  }

  if (dx > dy) {
    const midX = start.x + (end.x - start.x) / 2;
    return [
      { x: midX, y: start.y },
      { x: midX, y: end.y }
    ];
  }

  const midY = start.y + (end.y - start.y) / 2;
  return [
    { x: start.x, y: midY },
    { x: end.x, y: midY }
  ];
};

const ensureOrthogonalSegments = (points: Vec2[]): Vec2[] => {
  if (points.length < 2) {
    return points.map((point) => clonePoint(point));
  }

  const corrected: Vec2[] = [clonePoint(points[0])];

  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const dx = Math.abs(current.x - prev.x);
    const dy = Math.abs(current.y - prev.y);

    if (dx > EPSILON && dy > EPSILON) {
      const bridge = createDefaultOrthogonalWaypoints(prev, current);
      for (const intermediate of bridge) {
        const last = corrected[corrected.length - 1];
        if (!nearlyEqual(last.x, intermediate.x) || !nearlyEqual(last.y, intermediate.y)) {
          corrected.push(clonePoint(intermediate));
        }
      }
    }

    corrected.push(clonePoint(current));
  }

  return corrected;
};

const ensureOrthogonalSegmentsPreview = (points: Vec2[], axes: SegmentAxis[]): Vec2[] => {
  if (points.length < 2) {
    return points.map((point) => clonePoint(point));
  }

  const corrected: Vec2[] = [clonePoint(points[0])];

  for (let index = 1; index < points.length; index += 1) {
    const previous = corrected[corrected.length - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;

    if (Math.abs(dx) > EPSILON && Math.abs(dy) > EPSILON) {
      const axis =
        axes[index - 1] ??
        axes[index] ??
        (Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical');
      const intermediate =
        axis === 'horizontal'
          ? { x: current.x, y: previous.y }
          : { x: previous.x, y: current.y };

      if (!nearlyEqual(intermediate.x, previous.x) || !nearlyEqual(intermediate.y, previous.y)) {
        corrected.push(clonePoint(intermediate));
      }
    }

    corrected.push(clonePoint(current));
  }

  return corrected;
};

const computeSegmentAxes = (points: Vec2[]): SegmentAxis[] => {
  const axes: SegmentAxis[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    if (dx < EPSILON && dy < EPSILON) {
      axes.push(axes[index - 1] ?? 'horizontal');
    } else {
      axes.push(dx >= dy ? 'horizontal' : 'vertical');
    }
  }

  return axes;
};

const shouldCollapsePoint = (prev: Vec2, current: Vec2, next: Vec2): boolean => {
  if (!nearlyEqual(prev.x, next.x) && !nearlyEqual(prev.y, next.y)) {
    return false;
  }

  const ab = { x: current.x - prev.x, y: current.y - prev.y };
  const bc = { x: next.x - current.x, y: next.y - current.y };
  const abLength = Math.hypot(ab.x, ab.y);
  const bcLength = Math.hypot(bc.x, bc.y);

  if (abLength < MIN_SEGMENT_LENGTH || bcLength < MIN_SEGMENT_LENGTH) {
    return true;
  }

  const cross = Math.abs(ab.x * bc.y - ab.y * bc.x);
  const dot = ab.x * bc.x + ab.y * bc.y;
  const lengths = abLength * bcLength;

  if (lengths < EPSILON) {
    return true;
  }

  const sinTheta = cross / lengths;
  const cosTheta = dot / lengths;

  if (sinTheta <= Math.sin(AUTO_COLLAPSE_ANGLE)) {
    const lateral = cross / (abLength || 1);
    if (lateral <= AUTO_COLLAPSE_DISTANCE || cosTheta > 0) {
      return true;
    }
  }

  return false;
};

const simplifyPolyline = (points: Vec2[]): Vec2[] => {
  if (points.length <= 2) {
    return points.map((point) => clonePoint(point));
  }

  const simplified: Vec2[] = [clonePoint(points[0])];

  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];

    if (shouldCollapsePoint(prev, current, next)) {
      continue;
    }

    if (!nearlyEqual(prev.x, current.x) || !nearlyEqual(prev.y, current.y)) {
      simplified.push(clonePoint(current));
    }
  }

  const last = points[points.length - 1];
  if (!nearlyEqual(simplified[simplified.length - 1].x, last.x) || !nearlyEqual(simplified[simplified.length - 1].y, last.y)) {
    simplified.push(clonePoint(last));
  }

  return simplified;
};

export const tidyOrthogonalWaypointsPreview = (
  start: Vec2,
  waypoints: Vec2[],
  end: Vec2
): Vec2[] => {
  if (!waypoints.length) {
    return [];
  }

  const points = [start, ...waypoints.map((point) => clonePoint(point)), end];
  const axes = computeSegmentAxes(points);

  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const next = points[index + 1];
    const current = points[index];
    const prevAxis = axes[index - 1] ?? axes[index] ?? 'horizontal';
    const nextAxis = axes[index] ?? axes[index - 1] ?? 'horizontal';

    if (prevAxis === 'horizontal') {
      current.y = prev.y;
    } else {
      current.x = prev.x;
    }

    if (nextAxis === 'horizontal') {
      current.y = next.y;
    } else {
      current.x = next.x;
    }
  }

  const enforced = ensureOrthogonalSegmentsPreview(points, axes);
  return enforced.slice(1, enforced.length - 1).map((point) => clonePoint(point));
};

export const tidyOrthogonalWaypoints = (start: Vec2, waypoints: Vec2[], end: Vec2): Vec2[] => {
  if (!waypoints.length) {
    return [];
  }

  const points = [start, ...waypoints.map((point) => clonePoint(point)), end];
  snapPointsToNeighbors(points);
  const axes = computeSegmentAxes(points);

  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const next = points[index + 1];
    const current = points[index];
    const prevAxis = axes[index - 1] ?? axes[index] ?? 'horizontal';
    const nextAxis = axes[index] ?? axes[index - 1] ?? 'horizontal';

    if (prevAxis === 'horizontal' && nextAxis === 'horizontal') {
      const target = Math.abs(current.y - prev.y) <= Math.abs(current.y - next.y) ? prev.y : next.y;
      current.y = target;
    } else if (prevAxis === 'vertical' && nextAxis === 'vertical') {
      const target = Math.abs(current.x - prev.x) <= Math.abs(current.x - next.x) ? prev.x : next.x;
      current.x = target;
    } else {
      if (prevAxis === 'horizontal') {
        current.y = prev.y;
      } else {
        current.x = prev.x;
      }

      if (nextAxis === 'horizontal') {
        current.y = next.y;
      } else {
        current.x = next.x;
      }
    }
  }

  snapPointsToNeighbors(points);
  const enforced = ensureOrthogonalSegments(points);
  const rounded = enforced.map((point) => roundPoint(point));
  const simplified = simplifyPolyline(rounded);
  if (simplified.length <= 2) {
    return [];
  }

  return simplified.slice(1, simplified.length - 1).map((point) => clonePoint(point));
};

const sanitizePoints = (points: Vec2[]): Vec2[] =>
  points.filter((point, index, array) => {
    if (index === 0) {
      return true;
    }
    const prev = array[index - 1];
    return !nearlyEqual(prev.x, point.x) || !nearlyEqual(prev.y, point.y);
  });

const cleanPolyline = (points: Vec2[]): Vec2[] => simplifyPolyline(sanitizePoints(points));

const pointsEqual = (a: Vec2, b: Vec2) => nearlyEqual(a.x, b.x) && nearlyEqual(a.y, b.y);

const pointKey = (point: Vec2) => `${point.x.toFixed(3)}:${point.y.toFixed(3)}`;

const axisSegmentCrossesAnyRect = (a: Vec2, b: Vec2, obstacles: ObstacleRect[]) =>
  obstacles.some((rect) => axisSegmentCrossesRect(a, b, rect));

interface RoutingNode {
  point: Vec2;
  edges: Array<{ key: string; cost: number }>;
}

const findOrthogonalRoute = (start: Vec2, end: Vec2, obstacles: ObstacleRect[]): Vec2[] | null => {
  const pad = NODE_AVOIDANCE_PADDING;
  const offset = NODE_AVOIDANCE_DETOUR;

  const xCoords = new Set<number>();
  const yCoords = new Set<number>();

  const addX = (value: number) => {
    if (Number.isFinite(value)) {
      xCoords.add(roundToStep(value, ROUNDING_STEP));
    }
  };

  const addY = (value: number) => {
    if (Number.isFinite(value)) {
      yCoords.add(roundToStep(value, ROUNDING_STEP));
    }
  };

  const addPointOffsets = (point: Vec2) => {
    addX(point.x);
    addX(point.x + pad);
    addX(point.x - pad);
    addX(point.x + pad + offset);
    addX(point.x - pad - offset);
    addY(point.y);
    addY(point.y + pad);
    addY(point.y - pad);
    addY(point.y + pad + offset);
    addY(point.y - pad - offset);
  };

  addPointOffsets(start);
  addPointOffsets(end);

  for (const rect of obstacles) {
    addX(rect.left);
    addX(rect.right);
    addY(rect.top);
    addY(rect.bottom);

    addX(rect.left - pad);
    addX(rect.left - pad - offset);
    addX(rect.right + pad);
    addX(rect.right + pad + offset);

    addY(rect.top - pad);
    addY(rect.top - pad - offset);
    addY(rect.bottom + pad);
    addY(rect.bottom + pad + offset);
  }

  const xs = Array.from(xCoords).sort((a, b) => a - b);
  const ys = Array.from(yCoords).sort((a, b) => a - b);

  const nodes = new Map<string, RoutingNode>();
  const expandedObstacles = obstacles.map((rect) => ({
    left: rect.left - pad,
    right: rect.right + pad,
    top: rect.top - pad,
    bottom: rect.bottom + pad
  }));

  const startPoint = roundPoint(start);
  const endPoint = roundPoint(end);
  const startKey = pointKey(startPoint);
  const endKey = pointKey(endPoint);

  const ensureNode = (point: Vec2) => {
    const rounded = roundPoint(point);
    const key = pointKey(rounded);
    if (!nodes.has(key)) {
      nodes.set(key, { point: rounded, edges: [] });
    }
    return key;
  };

  const isBlockedPoint = (point: Vec2) =>
    obstacles.some((rect) => rectContainsPoint(rect, point));

  for (const x of xs) {
    for (const y of ys) {
      const candidate = roundPoint({ x, y });
      if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
        continue;
      }
      if (isBlockedPoint(candidate) && !pointsEqual(candidate, startPoint) && !pointsEqual(candidate, endPoint)) {
        continue;
      }
      ensureNode(candidate);
    }
  }

  ensureNode(startPoint);
  ensureNode(endPoint);

  const connect = (aKey: string, bKey: string) => {
    if (aKey === bKey) {
      return;
    }
    const aNode = nodes.get(aKey);
    const bNode = nodes.get(bKey);
    if (!aNode || !bNode) {
      return;
    }
    const cost = Math.abs(aNode.point.x - bNode.point.x) + Math.abs(aNode.point.y - bNode.point.y);
    if (cost < EPSILON) {
      return;
    }
    if (!aNode.edges.some((edge) => edge.key === bKey)) {
      aNode.edges.push({ key: bKey, cost });
    }
    if (!bNode.edges.some((edge) => edge.key === aKey)) {
      bNode.edges.push({ key: aKey, cost });
    }
  };

  for (const x of xs) {
    let previousKey: string | null = null;
    for (const y of ys) {
      const candidate = roundPoint({ x, y });
      const key = pointKey(candidate);
      if (!nodes.has(key)) {
        continue;
      }
      if (previousKey) {
        const previousNode = nodes.get(previousKey);
        const currentNode = nodes.get(key);
        if (previousNode && currentNode && !axisSegmentCrossesAnyRect(previousNode.point, currentNode.point, expandedObstacles)) {
          connect(previousKey, key);
        }
      }
      previousKey = key;
    }
  }

  for (const y of ys) {
    let previousKey: string | null = null;
    for (const x of xs) {
      const candidate = roundPoint({ x, y });
      const key = pointKey(candidate);
      if (!nodes.has(key)) {
        continue;
      }
      if (previousKey) {
        const previousNode = nodes.get(previousKey);
        const currentNode = nodes.get(key);
        if (previousNode && currentNode && !axisSegmentCrossesAnyRect(previousNode.point, currentNode.point, expandedObstacles)) {
          connect(previousKey, key);
        }
      }
      previousKey = key;
    }
  }

  if (!nodes.has(startKey) || !nodes.has(endKey)) {
    return null;
  }

  const releaseDistance = pad + offset;
  const releaseOffsets: Array<{ x: number; y: number }> = [
    { x: 0, y: releaseDistance },
    { x: 0, y: -releaseDistance },
    { x: releaseDistance, y: 0 },
    { x: -releaseDistance, y: 0 }
  ];

  const isInsideExpanded = (point: Vec2) =>
    expandedObstacles.some((rect) => rectContainsPoint(rect, point));

  const connectRelease = (originPoint: Vec2, originKey: string) => {
    for (const offsetVector of releaseOffsets) {
      const candidate = roundPoint({
        x: originPoint.x + offsetVector.x,
        y: originPoint.y + offsetVector.y
      });
      if (pointsEqual(candidate, originPoint)) {
        continue;
      }
      if (isBlockedPoint(candidate)) {
        continue;
      }
      if (isInsideExpanded(candidate)) {
        continue;
      }
      if (segmentIntersectsAnyRect(originPoint, candidate, obstacles)) {
        continue;
      }
      const candidateKey = ensureNode(candidate);
      const originNode = nodes.get(originKey);
      const candidateNode = nodes.get(candidateKey);
      if (!originNode || !candidateNode) {
        continue;
      }
      const cost =
        Math.abs(originNode.point.x - candidateNode.point.x) +
        Math.abs(originNode.point.y - candidateNode.point.y);
      if (cost < EPSILON) {
        continue;
      }
      if (!originNode.edges.some((edge) => edge.key === candidateKey)) {
        originNode.edges.push({ key: candidateKey, cost });
      }
      if (!candidateNode.edges.some((edge) => edge.key === originKey)) {
        candidateNode.edges.push({ key: originKey, cost });
      }
    }
  };

  connectRelease(startPoint, startKey);
  connectRelease(endPoint, endKey);

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const visited = new Set<string>();
  const queue: Array<{ key: string; cost: number }> = [];

  distances.set(startKey, 0);
  queue.push({ key: startKey, cost: 0 });

  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) {
      break;
    }
    if (visited.has(current.key)) {
      continue;
    }
    visited.add(current.key);

    if (current.key === endKey) {
      break;
    }

    const node = nodes.get(current.key);
    if (!node) {
      continue;
    }

    for (const edge of node.edges) {
      if (visited.has(edge.key)) {
        continue;
      }
      const nextCost = (distances.get(current.key) ?? 0) + edge.cost;
      if (nextCost + EPSILON < (distances.get(edge.key) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.key, nextCost);
        previous.set(edge.key, current.key);
        queue.push({ key: edge.key, cost: nextCost });
      }
    }
  }

  if (!distances.has(endKey)) {
    return null;
  }

  const result: Vec2[] = [];
  let currentKey: string | null = endKey;
  while (currentKey) {
    const node = nodes.get(currentKey);
    if (!node) {
      break;
    }
    result.push(roundPoint(node.point));
    if (currentKey === startKey) {
      break;
    }
    currentKey = previous.get(currentKey) ?? null;
  }

  if (!result.length || !pointsEqual(result[result.length - 1], startPoint)) {
    return null;
  }

  result.reverse();
  return result;
};

interface AvoidanceAdjustments {
  startAdjusted: boolean;
  endAdjusted: boolean;
}

const adjustPolylineForObstacles = (
  points: Vec2[],
  obstacles: ObstacleRect[],
  adjustments?: AvoidanceAdjustments
): Vec2[] => {
  if (points.length < 2 || !obstacles.length) {
    return points.map((point) => clonePoint(point));
  }

  const detectionObstacles =
    CONNECTOR_NODE_AVOIDANCE_CLEARANCE > 0
      ? obstacles.map((rect) => expandObstacleRect(rect, CONNECTOR_NODE_AVOIDANCE_CLEARANCE))
      : obstacles;
  // The padded obstacles let us detect potential collisions before the polyline
  // would actually clip a node, which keeps the visible path clear of nearby
  // node bodies by the configured clearance distance.

  const adjustOnce = (input: Vec2[]): { result: Vec2[]; changed: boolean } => {
    const adjusted: Vec2[] = [roundPoint(input[0])];
    let changed = false;

    for (let index = 0; index < input.length - 1; index += 1) {
      const start = roundPoint(input[index]);
      const end = roundPoint(input[index + 1]);

      if (!segmentIntersectsAnyRect(start, end, detectionObstacles)) {
        pushPointIfNeeded(adjusted, end);
        continue;
      }

      if (adjustments) {
        if (index === 0) {
          adjustments.startAdjusted = true;
        }
        if (index === input.length - 2) {
          adjustments.endAdjusted = true;
        }
      }

      const route = findOrthogonalRoute(start, end, obstacles);
      if (!route) {
        pushPointIfNeeded(adjusted, end);
        continue;
      }

      if (route.length > 2) {
        changed = true;
      }

      for (let routeIndex = 1; routeIndex < route.length; routeIndex += 1) {
        pushPointIfNeeded(adjusted, route[routeIndex]);
      }
    }

    const cleaned = cleanPolyline(adjusted);
    return { result: cleaned, changed: changed || cleaned.length !== adjusted.length };
  };

  let current = points.map((point) => clonePoint(point));

  for (let pass = 0; pass < MAX_AVOIDANCE_PASSES; pass += 1) {
    const { result, changed } = adjustOnce(current);
    current = result;

    if (!changed) {
      break;
    }

    if (!polylineIntersectsAnyRect(current, detectionObstacles)) {
      break;
    }
  }

  return current;
};

const cloneEndpointPosition = (
  endpoint: ConnectorModel['source'],
  node: NodeModel | undefined
): Vec2 => {
  if (isFloatingConnectorEndpoint(endpoint)) {
    return { ...endpoint.position };
  }

  if (isAttachedConnectorEndpoint(endpoint) && node) {
    return getConnectorPortAnchor(node, endpoint.port);
  }

  return { x: 0, y: 0 };
};

export const getConnectorPath = (
  connector: ConnectorModel,
  sourceNode?: NodeModel,
  targetNode?: NodeModel,
  nodes?: NodeModel[]
): ConnectorPath => {
  let baseWaypoints = connector.points?.map((point) => clonePoint(point)) ?? [];
  const start = cloneEndpointPosition(connector.source, sourceNode);
  const end = cloneEndpointPosition(connector.target, targetNode);
  baseWaypoints = stripConnectorStubs(connector, start, baseWaypoints, end);

  const strokeWidth = connector.style.strokeWidth ?? 2;
  const preferAvoidance = connector.mode !== 'straight' && connector.style.avoidNodes !== false;
  const baseClearance = Math.max(strokeWidth + 4, 12);
  const clearance = preferAvoidance
    ? Math.max(baseClearance, CONNECTOR_NODE_AVOIDANCE_CLEARANCE)
    : baseClearance;
  const cornerRadius =
    connector.mode === 'elbow' ? Math.max(0, connector.style.cornerRadius ?? 12) : 0;
  const arrowScale = Math.max(0, connector.style.arrowSize ?? 1);
  const startArrowShape = connector.style.startArrow?.shape ?? 'none';
  const endArrowShape = connector.style.endArrow?.shape ?? 'none';
  const startArrowLength = startArrowShape !== 'none' ? arrowScale * ARROW_BASE_LENGTH : 0;
  const endArrowLength = endArrowShape !== 'none' ? arrowScale * ARROW_BASE_LENGTH : 0;
  const stubMargin = Math.max(PORT_STUB_EXTRA_MARGIN, strokeWidth + 2);
  const baseStubLength = Math.max(clearance, MIN_PORT_STUB_LENGTH);
  const sourceAttachment = isAttachedConnectorEndpoint(connector.source) ? connector.source : null;
  const targetAttachment = isAttachedConnectorEndpoint(connector.target) ? connector.target : null;
  const sourceAttached = Boolean(sourceAttachment && sourceNode);
  const targetAttached = Boolean(targetAttachment && targetNode);
  const desiredStartStubLength = sourceAttached
    ? Math.max(baseStubLength, startArrowLength + cornerRadius + stubMargin)
    : baseStubLength;
  const desiredEndStubLength = targetAttached
    ? Math.max(baseStubLength, endArrowLength + cornerRadius + stubMargin)
    : baseStubLength;
  const startStub =
    sourceAttached && sourceAttachment
      ? createPortStubPoint(start, sourceAttachment.port, desiredStartStubLength)
      : null;
  const endStub =
    targetAttached && targetAttachment
      ? createPortStubPoint(end, targetAttachment.port, desiredEndStubLength)
      : null;

  const routeStart = startStub ?? start;
  const routeEnd = endStub ?? end;

  const avoidNodesEnabled = preferAvoidance;
  const avoidanceAdjustments: AvoidanceAdjustments = {
    startAdjusted: false,
    endAdjusted: false
  };

  let waypoints: Vec2[] = [];
  let points: Vec2[] = [];

  const enforcePortOrientation = () => {
    if (sourceAttached && sourceAttachment && points.length > 1) {
      const first = points[0];
      const second = points[1];
      const port = sourceAttachment.port;
      const axis = PORT_AXIS[port];
      const direction = PORT_DIRECTION[port];
      const desiredLength = desiredStartStubLength;
      const enforceOrientation = !avoidNodesEnabled || !avoidanceAdjustments.startAdjusted;
      if (axis === 'horizontal') {
        const dx = second.x - first.x;
        const sign = Math.sign(dx || direction);
        const axisAligned = nearlyEqual(first.y, second.y);
        const length = Math.abs(dx);
        if (!enforceOrientation) {
          const actual = Math.hypot(second.x - first.x, second.y - first.y);
          assertInvariant(actual > EPSILON, 'Connector segment must extend away from the port.');
        } else {
          const needsRealignment = !axisAligned || sign !== direction;
          const needsExtension = length + PORT_STUB_LENGTH_TOLERANCE < desiredLength;
          if (needsRealignment || needsExtension) {
            const inserted = roundPoint({ x: first.x + direction * desiredLength, y: first.y });
            if (needsRealignment) {
              points = [first, inserted, ...points.slice(1)];
            } else {
              points[1] = inserted;
            }
            if (points.length > 2) {
              const adjustIndex = 2;
              const current = points[adjustIndex];
              points[adjustIndex] = roundPoint({ x: inserted.x, y: current.y });
            }
          }
        }
      } else {
        const dy = second.y - first.y;
        const sign = Math.sign(dy || direction);
        const axisAligned = nearlyEqual(first.x, second.x);
        const length = Math.abs(dy);
        if (!enforceOrientation) {
          const actual = Math.hypot(second.x - first.x, second.y - first.y);
          assertInvariant(actual > EPSILON, 'Connector segment must extend away from the port.');
        } else {
          const needsRealignment = !axisAligned || sign !== direction;
          const needsExtension = length + PORT_STUB_LENGTH_TOLERANCE < desiredLength;
          if (needsRealignment || needsExtension) {
            const inserted = roundPoint({ x: first.x, y: first.y + direction * desiredLength });
            if (needsRealignment) {
              points = [first, inserted, ...points.slice(1)];
            } else {
              points[1] = inserted;
            }
            if (points.length > 2) {
              const adjustIndex = 2;
              const current = points[adjustIndex];
              points[adjustIndex] = roundPoint({ x: current.x, y: inserted.y });
            }
          }
        }
      }
    }

    if (targetAttached && targetAttachment && points.length > 1) {
      const lastIndex = points.length - 1;
      const last = points[lastIndex];
      const prev = points[lastIndex - 1];
      const port = targetAttachment.port;
      const axis = PORT_AXIS[port];
      const direction = -PORT_DIRECTION[port];
      const desiredLength = desiredEndStubLength;
      const enforceOrientation = !avoidNodesEnabled || !avoidanceAdjustments.endAdjusted;
      if (axis === 'horizontal') {
        const dx = last.x - prev.x;
        const sign = Math.sign(dx || direction);
        const axisAligned = nearlyEqual(last.y, prev.y);
        const length = Math.abs(dx);
        if (!enforceOrientation) {
          const actual = Math.hypot(last.x - prev.x, last.y - prev.y);
          assertInvariant(actual > EPSILON, 'Connector segment must approach the port.');
        } else {
          const needsRealignment = !axisAligned || sign !== direction;
          const needsExtension = length + PORT_STUB_LENGTH_TOLERANCE < desiredLength;
          if (needsRealignment || needsExtension) {
            const inserted = roundPoint({ x: last.x - direction * desiredLength, y: last.y });
            if (needsRealignment) {
              points = [...points.slice(0, lastIndex), inserted, last];
              if (lastIndex - 1 >= 0) {
                const adjustIndex = lastIndex - 1;
                const current = points[adjustIndex];
                points[adjustIndex] = roundPoint({ x: current.x, y: inserted.y });
              }
            } else {
              points[lastIndex - 1] = inserted;
              if (lastIndex - 2 >= 0) {
                const adjustIndex = lastIndex - 2;
                const current = points[adjustIndex];
                points[adjustIndex] = roundPoint({ x: current.x, y: inserted.y });
              }
            }
          }
        }
      } else {
        const dy = last.y - prev.y;
        const sign = Math.sign(dy || direction);
        const axisAligned = nearlyEqual(last.x, prev.x);
        const length = Math.abs(dy);
        if (!enforceOrientation) {
          const actual = Math.hypot(last.x - prev.x, last.y - prev.y);
          assertInvariant(actual > EPSILON, 'Connector segment must approach the port.');
        } else {
          const needsRealignment = !axisAligned || sign !== direction;
          const needsExtension = length + PORT_STUB_LENGTH_TOLERANCE < desiredLength;
          if (needsRealignment || needsExtension) {
            const inserted = roundPoint({ x: last.x, y: last.y - direction * desiredLength });
            if (needsRealignment) {
              points = [...points.slice(0, lastIndex), inserted, last];
              if (lastIndex - 1 >= 0) {
                const adjustIndex = lastIndex - 1;
                const current = points[adjustIndex];
                points[adjustIndex] = roundPoint({ x: inserted.x, y: current.y });
              }
            } else {
              points[lastIndex - 1] = inserted;
              if (lastIndex - 2 >= 0) {
                const adjustIndex = lastIndex - 2;
                const current = points[adjustIndex];
                points[adjustIndex] = roundPoint({ x: inserted.x, y: current.y });
              }
            }
          }
        }
      }
    }
  };

  if (connector.mode === 'elbow') {
    const base = baseWaypoints.length
      ? baseWaypoints
      : createDefaultOrthogonalWaypoints(routeStart, routeEnd);
    const initialWaypoints = tidyOrthogonalWaypoints(routeStart, base, routeEnd);

    const rawPoints = [
      start,
      ...(startStub ? [startStub] : []),
      ...initialWaypoints,
      ...(endStub ? [endStub] : []),
      end
    ];
    const orthogonal = ensureOrthogonalSegments(rawPoints);
    const roundedPoints = orthogonal.map((point) => roundPoint(point));
    points = sanitizePoints(roundedPoints);
  } else if (connector.mode === 'straight') {
    const straightPoints = [start, end].map((point) => roundPoint(point));
    points = sanitizePoints(straightPoints);
  }

  if (avoidNodesEnabled && nodes && nodes.length) {
    const exclude = new Set<string>();
    if (sourceNode) {
      exclude.add(sourceNode.id);
    }
    if (targetNode) {
      exclude.add(targetNode.id);
    }
    const obstacles = nodes
      .filter((node) => !exclude.has(node.id))
      .map((node) => expandNodeObstacle(node, 0));
    if (obstacles.length) {
      const detectionObstacles =
        CONNECTOR_NODE_AVOIDANCE_CLEARANCE > 0
          ? obstacles.map((rect) => expandObstacleRect(rect, CONNECTOR_NODE_AVOIDANCE_CLEARANCE))
          : obstacles;
      const avoided = adjustPolylineForObstacles(points, obstacles, avoidanceAdjustments);
      if (avoided.length >= 2) {
        points = cleanPolyline(avoided);
        enforcePortOrientation();

        if (connector.mode === 'elbow' && polylineIntersectsAnyRect(points, detectionObstacles)) {
          const originalPoints = points.map((point) => ({ ...point }));
          const fallbackRoute = findOrthogonalRoute(routeStart, routeEnd, obstacles);
          if (fallbackRoute && fallbackRoute.length >= 2) {
            const fallbackPoints = [
              start,
              ...(startStub ? [startStub] : []),
              ...fallbackRoute.slice(1, fallbackRoute.length - 1),
              ...(endStub ? [endStub] : []),
              end
            ];
            const fallbackOrthogonal = ensureOrthogonalSegments(fallbackPoints);
            const fallbackRounded = fallbackOrthogonal.map((point) => roundPoint(point));
            points = cleanPolyline(fallbackRounded);
            enforcePortOrientation();
            if (polylineIntersectsAnyRect(points, detectionObstacles)) {
              points = originalPoints;
            }
          }
        }
      }
    }
  }

  if (connector.mode === 'elbow') {
    enforcePortOrientation();
    const reorthogonalized = ensureOrthogonalSegments(points);
    points = sanitizePoints(reorthogonalized.map((point) => roundPoint(point)));
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const nextPoint = points[index + 1];
      const dx = nextPoint.x - current.x;
      const dy = nextPoint.y - current.y;
      assertInvariant(
        Math.abs(dx) < EPSILON || Math.abs(dy) < EPSILON,
        'Orthogonal connector segments must be horizontal or vertical.'
      );
    }

    if (isAttachedConnectorEndpoint(connector.source) && sourceNode && points.length > 1) {
      const first = points[0];
      const second = points[1];
      const axis = PORT_AXIS[connector.source.port];
      const enforceOrientation = !avoidNodesEnabled || !avoidanceAdjustments.startAdjusted;
      if (axis === 'vertical') {
        if (enforceOrientation) {
          assertInvariant(
            Math.abs(second.x - first.x) < EPSILON,
            'Connector must leave vertical ports vertically.'
          );
          const delta = second.y - first.y;
          assertInvariant(Math.abs(delta) > EPSILON, 'Connector segment must extend away from the port.');
          const direction = Math.sign(delta);
          assertInvariant(
            direction === PORT_DIRECTION[connector.source.port],
            'Connector segment direction must respect source port orientation.'
          );
        } else {
          const length = Math.hypot(second.x - first.x, second.y - first.y);
          assertInvariant(length > EPSILON, 'Connector segment must extend away from the port.');
        }
      } else {
        if (enforceOrientation) {
          assertInvariant(
            Math.abs(second.y - first.y) < EPSILON,
            'Connector must leave horizontal ports horizontally.'
          );
          const delta = second.x - first.x;
          assertInvariant(Math.abs(delta) > EPSILON, 'Connector segment must extend away from the port.');
          const direction = Math.sign(delta);
          assertInvariant(
            direction === PORT_DIRECTION[connector.source.port],
            'Connector segment direction must respect source port orientation.'
          );
        } else {
          const length = Math.hypot(second.x - first.x, second.y - first.y);
          assertInvariant(length > EPSILON, 'Connector segment must extend away from the port.');
        }
      }
    }

    if (isAttachedConnectorEndpoint(connector.target) && targetNode && points.length > 1) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      const axis = PORT_AXIS[connector.target.port];
      const enforceOrientation = !avoidNodesEnabled || !avoidanceAdjustments.endAdjusted;
      if (axis === 'vertical') {
        if (enforceOrientation) {
          assertInvariant(
            Math.abs(last.x - prev.x) < EPSILON,
            'Connector must enter vertical ports vertically.'
          );
          const delta = last.y - prev.y;
          assertInvariant(Math.abs(delta) > EPSILON, 'Connector segment must approach the port.');
          const direction = Math.sign(delta);
          assertInvariant(
            direction === -PORT_DIRECTION[connector.target.port],
            'Connector segment direction must respect target port orientation.'
          );
        } else {
          const length = Math.hypot(last.x - prev.x, last.y - prev.y);
          assertInvariant(length > EPSILON, 'Connector segment must approach the port.');
        }
      } else {
        if (enforceOrientation) {
          assertInvariant(
            Math.abs(last.y - prev.y) < EPSILON,
            'Connector must enter horizontal ports horizontally.'
          );
          const delta = last.x - prev.x;
          assertInvariant(Math.abs(delta) > EPSILON, 'Connector segment must approach the port.');
          const direction = Math.sign(delta);
          assertInvariant(
            direction === -PORT_DIRECTION[connector.target.port],
            'Connector segment direction must respect target port orientation.'
          );
        } else {
          const length = Math.hypot(last.x - prev.x, last.y - prev.y);
          assertInvariant(length > EPSILON, 'Connector segment must approach the port.');
        }
      }
    }
  } else {
    if (avoidNodesEnabled && points.length > 2) {
      for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const nextPoint = points[index + 1];
        assertInvariant(
          nearlyEqual(current.x, nextPoint.x) || nearlyEqual(current.y, nextPoint.y),
          'Adjusted straight connector segments must remain orthogonal.'
        );
      }
    } else {
      assertInvariant(points.length <= 2, 'Straight connectors must not include extra waypoints.');
    }
  }

  waypoints = stripConnectorStubs(connector, start, points.slice(1, points.length - 1), end);

  return {
    start,
    end,
    waypoints,
    points
  };
};

const segmentLength = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

export const getPolylineMidpoint = (points: Vec2[]): Vec2 => {
  if (!points.length) {
    return { x: 0, y: 0 };
  }
  if (points.length === 1) {
    return { ...points[0] };
  }

  const totalLength = points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    return sum + segmentLength(previous, point);
  }, 0);

  if (totalLength < EPSILON) {
    return { ...points[0] };
  }

  const halfLength = totalLength / 2;
  let accumulated = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const length = segmentLength(start, end);

    if (accumulated + length >= halfLength) {
      const t = (halfLength - accumulated) / (length || 1);
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      };
    }

    accumulated += length;
  }

  return { ...points[points.length - 1] };
};

export interface PolylineMeasure {
  segments: number[];
  totalLength: number;
}

export const measurePolyline = (points: Vec2[]): PolylineMeasure => {
  if (points.length < 2) {
    return { segments: [], totalLength: 0 };
  }

  const segments: number[] = [];
  let total = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const length = segmentLength(points[index], points[index + 1]);
    segments.push(total);
    total += length;
  }

  segments.push(total);

  return { segments, totalLength: total };
};

export const getPointAtRatio = (
  points: Vec2[],
  ratio: number
): { point: Vec2; segmentIndex: number; segmentT: number } => {
  if (!points.length) {
    return { point: { x: 0, y: 0 }, segmentIndex: 0, segmentT: 0 };
  }
  if (points.length === 1 || ratio <= 0) {
    return { point: clonePoint(points[0]), segmentIndex: 0, segmentT: 0 };
  }

  const clamped = Math.min(1, Math.max(0, ratio));
  const measure = measurePolyline(points);
  if (measure.totalLength < EPSILON) {
    return { point: clonePoint(points[0]), segmentIndex: 0, segmentT: 0 };
  }

  const target = measure.totalLength * clamped;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = segmentLength(start, end);
    const accumulated = measure.segments[index];

    if (accumulated + length >= target - EPSILON) {
      const t = length < EPSILON ? 0 : (target - accumulated) / length;
      return {
        point: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t
        },
        segmentIndex: index,
        segmentT: t
      };
    }
  }

  const lastPoint = points[points.length - 1];
  return { point: clonePoint(lastPoint), segmentIndex: points.length - 2, segmentT: 1 };
};

export const getNormalAtRatio = (
  points: Vec2[],
  segmentIndex: number
): Vec2 => {
  if (points.length < 2) {
    return { x: 0, y: -1 };
  }

  const clampedIndex = Math.max(0, Math.min(points.length - 2, segmentIndex));
  const start = points[clampedIndex];
  const end = points[clampedIndex + 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return { x: nx, y: ny };
};

interface ClosestPointResult {
  index: number;
  point: Vec2;
}

export const findClosestPointOnPolyline = (point: Vec2, polyline: Vec2[]): ClosestPointResult => {
  if (polyline.length < 2) {
    return { index: 0, point: polyline[0] ? { ...polyline[0] } : { ...point } };
  }

  let closestIndex = 0;
  let closestPoint = polyline[0];
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < polyline.length - 1; i += 1) {
    const start = polyline[i];
    const end = polyline[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    let t = 0;
    if (lengthSquared > EPSILON) {
      t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
    }

    const projected = {
      x: start.x + dx * t,
      y: start.y + dy * t
    };

    const distanceSquared = (projected.x - point.x) ** 2 + (projected.y - point.y) ** 2;

    if (distanceSquared < closestDistance) {
      closestDistance = distanceSquared;
      closestIndex = i;
      closestPoint = projected;
    }
  }

  return { index: closestIndex, point: closestPoint };
};
