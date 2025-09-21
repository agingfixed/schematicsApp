import { ConnectorModel, ConnectorPort, NodeModel, Vec2 } from '../types/scene';

const EPSILON = 1e-6;
const AUTO_COLLAPSE_DISTANCE = 2.5;
const AUTO_COLLAPSE_ANGLE = (3 * Math.PI) / 180;
const MIN_SEGMENT_LENGTH = 6;
const SNAP_PORT_KEYS: ConnectorPort[] = ['top', 'right', 'bottom', 'left', 'center'];

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

export const getConnectorAnchor = (node: NodeModel, toward: Vec2): Vec2 => {
  const center = getNodeCenter(node);
  const halfWidth = node.size.width / 2;
  const halfHeight = node.size.height / 2;

  switch (node.shape) {
    case 'ellipse':
      return getEllipseAnchor(center, halfWidth, halfHeight, toward);
    case 'diamond':
      return getDiamondAnchor(center, halfWidth, halfHeight, toward);
    default:
      return getRectangleAnchor(center, halfWidth, halfHeight, toward);
  }
};

export const getConnectorPortPositions = (
  node: NodeModel
): Record<ConnectorPort, Vec2> => {
  const center = getNodeCenter(node);
  return {
    top: { x: center.x, y: node.position.y },
    right: { x: node.position.x + node.size.width, y: center.y },
    bottom: { x: center.x, y: node.position.y + node.size.height },
    left: { x: node.position.x, y: center.y },
    center
  };
};

export const getConnectorPortAnchor = (node: NodeModel, port: ConnectorPort): Vec2 => {
  const positions = getConnectorPortPositions(node);
  return positions[port] ?? positions.center;
};

export const getNearestConnectorPort = (node: NodeModel, point: Vec2): ConnectorPort => {
  const positions = getConnectorPortPositions(node);
  let best: ConnectorPort = 'center';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const key of SNAP_PORT_KEYS) {
    const current = positions[key];
    const distance = Math.hypot(current.x - point.x, current.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }

  return best;
};

export interface ConnectorPath {
  start: Vec2;
  end: Vec2;
  waypoints: Vec2[];
  points: Vec2[];
}

const clonePoint = (point: Vec2): Vec2 => ({ x: point.x, y: point.y });

const nearlyEqual = (a: number, b: number, tolerance = EPSILON) => Math.abs(a - b) <= tolerance;

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

type SegmentAxis = 'horizontal' | 'vertical';

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

export const tidyOrthogonalWaypoints = (start: Vec2, waypoints: Vec2[], end: Vec2): Vec2[] => {
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

  const simplified = simplifyPolyline(points);
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

export const getConnectorPath = (
  connector: ConnectorModel,
  source: NodeModel,
  target: NodeModel
): ConnectorPath => {
  const baseWaypoints = connector.points?.map((point) => clonePoint(point)) ?? [];
  const targetReference = baseWaypoints.length ? baseWaypoints[0] : getNodeCenter(target);
  const sourceReference = baseWaypoints.length
    ? baseWaypoints[baseWaypoints.length - 1]
    : getNodeCenter(source);

  const start = connector.sourcePort
    ? getConnectorPortAnchor(source, connector.sourcePort)
    : getConnectorAnchor(source, targetReference);
  const end = connector.targetPort
    ? getConnectorPortAnchor(target, connector.targetPort)
    : getConnectorAnchor(target, sourceReference);

  let waypoints: Vec2[] = [];
  let points: Vec2[] = [];

  if (connector.mode === 'orthogonal') {
    const base = baseWaypoints.length ? baseWaypoints : createDefaultOrthogonalWaypoints(start, end);
    waypoints = tidyOrthogonalWaypoints(start, base, end);
    points = sanitizePoints([start, ...waypoints, end]);
  } else if (connector.mode === 'straight') {
    waypoints = [];
    points = sanitizePoints([start, end]);
  }

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
