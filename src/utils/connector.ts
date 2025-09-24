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
const DEFAULT_STUB_LENGTH = 48;
const MAX_PREVIEW_SNAP = 1e-3;

export type ConnectorAxis = 'horizontal' | 'vertical' | 'diagonal';

type ConnectorDirection = 'up' | 'down' | 'left' | 'right' | 'none';

type ResolvedEndpoint = {
  point: Vec2;
  direction: ConnectorDirection;
};

const directionForPort: Record<CardinalConnectorPort, ConnectorDirection> = {
  top: 'up',
  right: 'right',
  bottom: 'down',
  left: 'left'
};

const clonePoint = (point: Vec2): Vec2 => ({ x: point.x, y: point.y });

const nearlyEqual = (a: number, b: number, tolerance = 0.001) => Math.abs(a - b) <= tolerance;

const offsetPoint = (point: Vec2, direction: ConnectorDirection, distance: number): Vec2 => {
  switch (direction) {
    case 'up':
      return { x: point.x, y: point.y - distance };
    case 'down':
      return { x: point.x, y: point.y + distance };
    case 'left':
      return { x: point.x - distance, y: point.y };
    case 'right':
      return { x: point.x + distance, y: point.y };
    default:
      return clonePoint(point);
  }
};

const getNodeCenter = (node: NodeModel): Vec2 => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2
});

export const CARDINAL_PORTS: CardinalConnectorPort[] = ['top', 'right', 'bottom', 'left'];

const CARDINAL_PORT_LOOKUP = new Set<string>(CARDINAL_PORTS);

export const isCardinalConnectorPortValue = (value: unknown): value is CardinalConnectorPort =>
  typeof value === 'string' && CARDINAL_PORT_LOOKUP.has(value);

export const cloneConnectorEndpoint = (endpoint: ConnectorEndpoint): ConnectorEndpoint => {
  if (isAttachedConnectorEndpoint(endpoint)) {
    if (!isCardinalConnectorPortValue(endpoint.port)) {
      throw new Error(`Connector endpoints must use a cardinal port. Received "${endpoint.port}".`);
    }
    return { nodeId: endpoint.nodeId, port: endpoint.port };
  }
  if (isFloatingConnectorEndpoint(endpoint)) {
    return { position: clonePoint(endpoint.position) };
  }
  throw new Error('Unsupported connector endpoint.');
};

export const getConnectorPortPositions = (
  node: NodeModel
): Record<CardinalConnectorPort, Vec2> => {
  const { position, size } = node;
  const center = getNodeCenter(node);
  return {
    top: { x: center.x, y: position.y },
    right: { x: position.x + size.width, y: center.y },
    bottom: { x: center.x, y: position.y + size.height },
    left: { x: position.x, y: center.y }
  };
};

export const getConnectorPortAnchor = (node: NodeModel, port: CardinalConnectorPort): Vec2 =>
  clonePoint(getConnectorPortPositions(node)[port]);

export const getNearestConnectorPort = (node: NodeModel, point: Vec2): CardinalConnectorPort => {
  const ports = getConnectorPortPositions(node);
  let closest: CardinalConnectorPort = 'top';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const port of CARDINAL_PORTS) {
    const candidate = ports[port];
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = port;
    }
  }
  return closest;
};

const resolveAttachedEndpoint = (
  endpoint: ConnectorEndpoint,
  providedNode: NodeModel | undefined,
  nodes: NodeModel[]
): ResolvedEndpoint | null => {
  if (!isAttachedConnectorEndpoint(endpoint)) {
    return null;
  }

  const node =
    providedNode && providedNode.id === endpoint.nodeId
      ? providedNode
      : nodes.find((item) => item.id === endpoint.nodeId);

  if (!node) {
    return {
      point: { x: 0, y: 0 },
      direction: 'none'
    };
  }

  const anchor = getConnectorPortAnchor(node, endpoint.port);
  return {
    point: anchor,
    direction: directionForPort[endpoint.port]
  };
};

const resolveEndpoint = (
  endpoint: ConnectorEndpoint,
  providedNode: NodeModel | undefined,
  nodes: NodeModel[]
): ResolvedEndpoint => {
  if (isFloatingConnectorEndpoint(endpoint)) {
    return { point: clonePoint(endpoint.position), direction: 'none' };
  }
  return resolveAttachedEndpoint(endpoint, providedNode, nodes) ?? {
    point: { x: 0, y: 0 },
    direction: 'none'
  };
};

const shouldAddStub = (direction: ConnectorDirection) => direction !== 'none';

const buildDefaultWaypoints = (
  connector: ConnectorModel,
  start: ResolvedEndpoint,
  end: ResolvedEndpoint
): Vec2[] => {
  if (connector.mode === 'straight') {
    return [];
  }

  const stubLength = connector.style.strokeWidth ? Math.max(36, connector.style.strokeWidth * 12) : DEFAULT_STUB_LENGTH;
  const startStub = shouldAddStub(start.direction)
    ? offsetPoint(start.point, start.direction, stubLength)
    : clonePoint(start.point);
  const endStub = shouldAddStub(end.direction)
    ? offsetPoint(end.point, end.direction, stubLength)
    : clonePoint(end.point);

  const waypoints: Vec2[] = [];

  if (shouldAddStub(start.direction)) {
    waypoints.push(startStub);
  }

  const bridgeNeeded =
    !nearlyEqual(startStub.x, endStub.x) && !nearlyEqual(startStub.y, endStub.y);

  if (bridgeNeeded) {
    const horizontalFirst = Math.abs(endStub.x - startStub.x) >= Math.abs(endStub.y - startStub.y);
    if (horizontalFirst) {
      waypoints.push({ x: endStub.x, y: startStub.y });
    } else {
      waypoints.push({ x: startStub.x, y: endStub.y });
    }
  }

  if (shouldAddStub(end.direction)) {
    waypoints.push(endStub);
  }

  return waypoints.map(clonePoint);
};

const stripDuplicateWaypoints = (waypoints: Vec2[]): Vec2[] => {
  if (waypoints.length < 2) {
    return waypoints.map(clonePoint);
  }
  const cleaned: Vec2[] = [];
  for (const point of waypoints) {
    if (!cleaned.length) {
      cleaned.push(clonePoint(point));
      continue;
    }
    const previous = cleaned[cleaned.length - 1];
    if (nearlyEqual(previous.x, point.x) && nearlyEqual(previous.y, point.y)) {
      continue;
    }
    cleaned.push(clonePoint(point));
  }
  return cleaned;
};

const mergeColinear = (points: Vec2[]): Vec2[] => {
  if (points.length < 3) {
    return points.map(clonePoint);
  }

  const merged: Vec2[] = [clonePoint(points[0])];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = merged[merged.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const horizontal = nearlyEqual(previous.y, current.y) && nearlyEqual(current.y, next.y);
    const vertical = nearlyEqual(previous.x, current.x) && nearlyEqual(current.x, next.x);
    if (horizontal || vertical) {
      continue;
    }
    merged.push(clonePoint(current));
  }
  merged.push(clonePoint(points[points.length - 1]));
  return merged;
};

export const tidyOrthogonalWaypoints = (start: Vec2, waypoints: Vec2[], end: Vec2): Vec2[] =>
  mergeColinear([start, ...stripDuplicateWaypoints(waypoints), end]).slice(1, -1);

export interface ConnectorSegment {
  start: Vec2;
  end: Vec2;
  axis: ConnectorAxis;
  length: number;
}

export interface ConnectorPath {
  start: Vec2;
  end: Vec2;
  waypoints: Vec2[];
  points: Vec2[];
  segments: ConnectorSegment[];
  totalLength: number;
}

const resolveAxis = (start: Vec2, end: Vec2): ConnectorAxis => {
  if (nearlyEqual(start.x, end.x)) {
    return 'vertical';
  }
  if (nearlyEqual(start.y, end.y)) {
    return 'horizontal';
  }
  return 'diagonal';
};

export const getConnectorPath = (
  connector: ConnectorModel,
  sourceNode?: NodeModel,
  targetNode?: NodeModel,
  nodes: NodeModel[] = []
): ConnectorPath => {
  const resolvedSource = resolveEndpoint(connector.source, sourceNode, nodes);
  const resolvedTarget = resolveEndpoint(connector.target, targetNode, nodes);

  const baseWaypoints = connector.points?.map(clonePoint) ?? [];
  const waypoints = baseWaypoints.length
    ? stripDuplicateWaypoints(baseWaypoints)
    : buildDefaultWaypoints(connector, resolvedSource, resolvedTarget);

  const points = [resolvedSource.point, ...waypoints.map(clonePoint), resolvedTarget.point];
  const merged = mergeColinear(points);

  const segments: ConnectorSegment[] = [];
  let totalLength = 0;
  for (let index = 0; index < merged.length - 1; index += 1) {
    const start = merged[index];
    const end = merged[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    totalLength += length;
    segments.push({ start: clonePoint(start), end: clonePoint(end), axis: resolveAxis(start, end), length });
  }

  const finalPoints = merged.map(clonePoint);
  const finalWaypoints = finalPoints.slice(1, finalPoints.length - 1);

  return {
    start: clonePoint(resolvedSource.point),
    end: clonePoint(resolvedTarget.point),
    waypoints: finalWaypoints,
    points: finalPoints,
    segments,
    totalLength
  };
};

export const buildRoundedConnectorPath = (points: Vec2[], cornerRadius: number): string => {
  if (points.length === 0) {
    return '';
  }

  const radius = Math.max(0, cornerRadius);
  let command = `M ${points[0].x} ${points[0].y}`;
  if (points.length === 1) {
    return command;
  }

  if (radius <= EPSILON) {
    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      command += ` L ${point.x} ${point.y}`;
    }
    return command;
  }

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];

    if (index === points.length - 1) {
      command += ` L ${current.x} ${current.y}`;
      continue;
    }

    const next = points[index + 1];
    const inVector = { x: current.x - previous.x, y: current.y - previous.y };
    const outVector = { x: next.x - current.x, y: next.y - current.y };
    const inLength = Math.hypot(inVector.x, inVector.y);
    const outLength = Math.hypot(outVector.x, outVector.y);

    if (inLength <= EPSILON || outLength <= EPSILON) {
      command += ` L ${current.x} ${current.y}`;
      continue;
    }

    const trimmed = Math.min(radius, inLength / 2, outLength / 2);
    const entry = {
      x: current.x - (inVector.x / inLength) * trimmed,
      y: current.y - (inVector.y / inLength) * trimmed
    };
    const exit = {
      x: current.x + (outVector.x / outLength) * trimmed,
      y: current.y + (outVector.y / outLength) * trimmed
    };

    command += ` L ${entry.x} ${entry.y}`;
    command += ` Q ${current.x} ${current.y} ${exit.x} ${exit.y}`;
  }

  const last = points[points.length - 1];
  command += ` L ${last.x} ${last.y}`;
  return command;
};

export const measurePolyline = (points: Vec2[]): { totalLength: number; segments: number[] } => {
  const segments: number[] = [];
  let total = 0;
  if (points.length < 2) {
    return { totalLength: 0, segments };
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push(total);
    const start = points[index];
    const end = points[index + 1];
    total += Math.hypot(end.x - start.x, end.y - start.y);
  }
  return { totalLength: total, segments };
};

export const getPointAtRatio = (
  points: Vec2[],
  ratio: number
): { point: Vec2; segmentIndex: number } => {
  if (points.length < 2) {
    return { point: clonePoint(points[0] ?? { x: 0, y: 0 }), segmentIndex: 0 };
  }
  const { totalLength, segments } = measurePolyline(points);
  if (totalLength <= EPSILON) {
    return { point: clonePoint(points[0]), segmentIndex: 0 };
  }
  const target = Math.max(0, Math.min(1, ratio)) * totalLength;
  let segmentIndex = segments.length - 1;
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] <= target) {
      segmentIndex = index;
    }
  }
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1] ?? start;
  const segmentLength = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const distanceIntoSegment = target - segments[segmentIndex];
  const ratioAlongSegment = Math.max(0, Math.min(1, distanceIntoSegment / segmentLength));
  return {
    point: {
      x: start.x + (end.x - start.x) * ratioAlongSegment,
      y: start.y + (end.y - start.y) * ratioAlongSegment
    },
    segmentIndex
  };
};

export const getNormalAtRatio = (points: Vec2[], segmentIndex: number): Vec2 => {
  if (points.length < 2) {
    return { x: 0, y: -1 };
  }
  const index = Math.max(0, Math.min(points.length - 2, segmentIndex));
  const start = points[index];
  const end = points[index + 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) {
    return { x: 0, y: -1 };
  }
  const ux = dx / length;
  const uy = dy / length;
  return { x: -uy, y: ux };
};

export const findClosestPointOnPolyline = (
  point: Vec2,
  polyline: Vec2[]
): { point: Vec2; index: number; distance: number } => {
  if (!polyline.length) {
    return { point: { x: 0, y: 0 }, index: 0, distance: 0 };
  }
  if (polyline.length === 1) {
    const only = polyline[0];
    return {
      point: clonePoint(only),
      index: 0,
      distance: Math.hypot(only.x - point.x, only.y - point.y)
    };
  }

  let bestPoint = clonePoint(polyline[0]);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIndex = 0;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;

    let projection = 0;
    if (lengthSquared > EPSILON) {
      projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
      projection = Math.max(0, Math.min(1, projection));
    }

    const candidate = {
      x: start.x + dx * projection,
      y: start.y + dy * projection
    };
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);

    if (distance < bestDistance - MAX_PREVIEW_SNAP) {
      bestDistance = distance;
      bestPoint = candidate;
      bestIndex = index;
    }
  }

  return { point: bestPoint, index: bestIndex, distance: bestDistance };
};

export const tidyOrthogonalWaypointsPreview = tidyOrthogonalWaypoints;
