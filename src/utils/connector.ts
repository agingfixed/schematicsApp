import { ConnectorModel, NodeModel, Vec2 } from '../types/scene';

const EPSILON = 1e-6;

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

export interface ConnectorPath {
  start: Vec2;
  end: Vec2;
  waypoints: Vec2[];
  points: Vec2[];
}

export const getConnectorPath = (
  connector: ConnectorModel,
  source: NodeModel,
  target: NodeModel
): ConnectorPath => {
  const waypoints = connector.points?.map((point) => ({ ...point })) ?? [];
  const targetReference = waypoints.length ? waypoints[0] : getNodeCenter(target);
  const sourceReference = waypoints.length
    ? waypoints[waypoints.length - 1]
    : getNodeCenter(source);

  const start = getConnectorAnchor(source, targetReference);
  const end = getConnectorAnchor(target, sourceReference);

  return {
    start,
    end,
    waypoints,
    points: [start, ...waypoints, end]
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
