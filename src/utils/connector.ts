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
const MIN_AVOIDANCE_PADDING = 24;
const COORDINATE_PRECISION = 1e3;
const TURN_PENALTY_FACTOR = 2;

type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

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

const roundCoordinate = (value: number) => Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;

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

const expandNodeBounds = (node: NodeModel, padding: number): Rect => ({
  left: node.position.x - padding,
  top: node.position.y - padding,
  right: node.position.x + node.size.width + padding,
  bottom: node.position.y + node.size.height + padding
});

const pointKey = (point: Vec2) => `${roundCoordinate(point.x)}:${roundCoordinate(point.y)}`;

const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
  Math.max(startA, startB) < Math.min(endA, endB) - EPSILON;

const isPointInsideRect = (point: Vec2, rect: Rect) =>
  point.x > rect.left + EPSILON &&
  point.x < rect.right - EPSILON &&
  point.y > rect.top + EPSILON &&
  point.y < rect.bottom - EPSILON;

const segmentIntersectsRect = (start: Vec2, end: Vec2, rect: Rect) => {
  if (nearlyEqual(start.x, end.x)) {
    const x = start.x;
    if (x > rect.left + EPSILON && x < rect.right - EPSILON) {
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      return rangesOverlap(minY, maxY, rect.top, rect.bottom);
    }
    return false;
  }

  if (nearlyEqual(start.y, end.y)) {
    const y = start.y;
    if (y > rect.top + EPSILON && y < rect.bottom - EPSILON) {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      return rangesOverlap(minX, maxX, rect.left, rect.right);
    }
    return false;
  }

  return false;
};

const segmentBlockedByAny = (start: Vec2, end: Vec2, obstacles: Rect[]) =>
  obstacles.some((rect) => segmentIntersectsRect(start, end, rect));

const isPointInsideAny = (point: Vec2, obstacles: Rect[]) =>
  obstacles.some((rect) => isPointInsideRect(point, rect));

type ConnectorTravelDirection = 'horizontal' | 'vertical';

interface ConnectorGraphEdge {
  key: string;
  cost: number;
  direction: ConnectorTravelDirection;
}

const manhattanDistance = (a: Vec2, b: Vec2) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const addCoordinate = (set: Set<number>, value: number) => {
  if (!Number.isFinite(value)) {
    return;
  }
  set.add(roundCoordinate(value));
};

const expandSearchBounds = (start: Vec2, end: Vec2, clearance: number): Rect => ({
  left: Math.min(start.x, end.x) - clearance * 4,
  right: Math.max(start.x, end.x) + clearance * 4,
  top: Math.min(start.y, end.y) - clearance * 4,
  bottom: Math.max(start.y, end.y) + clearance * 4
});

const rectsIntersect = (a: Rect, b: Rect) =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

const oppositeDirection: Record<ConnectorDirection, ConnectorDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
  none: 'none'
};

const movePointOutsideObstacles = (
  point: Vec2,
  direction: ConnectorDirection,
  clearance: number,
  obstacles: Rect[],
  maxIterations = 8
): Vec2 => {
  if (direction === 'none') {
    return { x: point.x, y: point.y };
  }
  let adjusted = { x: point.x, y: point.y };
  let iterations = 0;
  while (isPointInsideAny(adjusted, obstacles) && iterations < maxIterations) {
    adjusted = offsetPoint(adjusted, direction, clearance);
    iterations += 1;
  }
  return adjusted;
};

const computeSafeStubPoint = (
  anchor: Vec2,
  direction: ConnectorDirection,
  desiredLength: number,
  obstacles: Rect[]
): Vec2 => {
  if (direction === 'none' || desiredLength <= EPSILON) {
    return clonePoint(anchor);
  }

  let maxDistance = desiredLength;
  for (const rect of obstacles) {
    if (direction === 'right') {
      const overlaps = anchor.y >= rect.top - EPSILON && anchor.y <= rect.bottom + EPSILON;
      if (!overlaps) {
        continue;
      }
      const distance = rect.left - anchor.x - EPSILON * 2;
      maxDistance = Math.min(maxDistance, Math.max(0, distance));
    } else if (direction === 'left') {
      const overlaps = anchor.y >= rect.top - EPSILON && anchor.y <= rect.bottom + EPSILON;
      if (!overlaps) {
        continue;
      }
      const distance = anchor.x - rect.right - EPSILON * 2;
      maxDistance = Math.min(maxDistance, Math.max(0, distance));
    } else if (direction === 'down') {
      const overlaps = anchor.x >= rect.left - EPSILON && anchor.x <= rect.right + EPSILON;
      if (!overlaps) {
        continue;
      }
      const distance = rect.top - anchor.y - EPSILON * 2;
      maxDistance = Math.min(maxDistance, Math.max(0, distance));
    } else if (direction === 'up') {
      const overlaps = anchor.x >= rect.left - EPSILON && anchor.x <= rect.right + EPSILON;
      if (!overlaps) {
        continue;
      }
      const distance = anchor.y - rect.bottom - EPSILON * 2;
      maxDistance = Math.min(maxDistance, Math.max(0, distance));
    }
  }

  const stub = offsetPoint(anchor, direction, maxDistance);
  if (isPointInsideAny(stub, obstacles)) {
    return offsetPoint(stub, oppositeDirection[direction], EPSILON * 2);
  }
  return stub;
};

const buildAvoidancePolyline = (
  start: Vec2,
  end: Vec2,
  obstacles: Rect[],
  clearance: number
): Vec2[] | null => {
  if (!obstacles.length) {
    return null;
  }

  const startPoint = { x: roundCoordinate(start.x), y: roundCoordinate(start.y) };
  const endPoint = { x: roundCoordinate(end.x), y: roundCoordinate(end.y) };

  const bounds = expandSearchBounds(startPoint, endPoint, clearance);
  const relevantObstacles = obstacles.filter((rect) => rectsIntersect(rect, bounds));

  if (!relevantObstacles.length) {
    return null;
  }

  const xs = new Set<number>();
  const ys = new Set<number>();
  addCoordinate(xs, startPoint.x);
  addCoordinate(xs, endPoint.x);
  addCoordinate(ys, startPoint.y);
  addCoordinate(ys, endPoint.y);

  for (const rect of relevantObstacles) {
    addCoordinate(xs, rect.left);
    addCoordinate(xs, rect.right);
    addCoordinate(xs, rect.left - clearance);
    addCoordinate(xs, rect.right + clearance);
    addCoordinate(ys, rect.top);
    addCoordinate(ys, rect.bottom);
    addCoordinate(ys, rect.top - clearance);
    addCoordinate(ys, rect.bottom + clearance);
  }

  const sortedXs = Array.from(xs).sort((a, b) => a - b);
  const sortedYs = Array.from(ys).sort((a, b) => a - b);

  const pointMap = new Map<string, Vec2>();
  for (const x of sortedXs) {
    for (const y of sortedYs) {
      const point = { x: roundCoordinate(x), y: roundCoordinate(y) };
      if (isPointInsideAny(point, relevantObstacles)) {
        continue;
      }
      pointMap.set(pointKey(point), point);
    }
  }

  const startKey = pointKey(startPoint);
  const endKey = pointKey(endPoint);
  if (!pointMap.has(startKey)) {
    pointMap.set(startKey, { ...startPoint });
  }
  if (!pointMap.has(endKey)) {
    pointMap.set(endKey, { ...endPoint });
  }

  const adjacency = new Map<string, ConnectorGraphEdge[]>();
  const ensureAdjacency = (key: string) => {
    if (!adjacency.has(key)) {
      adjacency.set(key, []);
    }
    return adjacency.get(key)!;
  };

  for (const y of sortedYs) {
    const row: Array<{ key: string; point: Vec2 }> = [];
    for (const x of sortedXs) {
      const key = pointKey({ x: roundCoordinate(x), y: roundCoordinate(y) });
      const point = pointMap.get(key);
      if (point) {
        row.push({ key, point });
      }
    }
    for (let index = 0; index < row.length - 1; index += 1) {
      const current = row[index];
      const next = row[index + 1];
      if (segmentBlockedByAny(current.point, next.point, relevantObstacles)) {
        continue;
      }
      const distance = Math.abs(next.point.x - current.point.x);
      if (distance <= EPSILON) {
        continue;
      }
      ensureAdjacency(current.key).push({ key: next.key, cost: distance, direction: 'horizontal' });
      ensureAdjacency(next.key).push({ key: current.key, cost: distance, direction: 'horizontal' });
    }
  }

  for (const x of sortedXs) {
    const column: Array<{ key: string; point: Vec2 }> = [];
    for (const y of sortedYs) {
      const key = pointKey({ x: roundCoordinate(x), y: roundCoordinate(y) });
      const point = pointMap.get(key);
      if (point) {
        column.push({ key, point });
      }
    }
    for (let index = 0; index < column.length - 1; index += 1) {
      const current = column[index];
      const next = column[index + 1];
      if (segmentBlockedByAny(current.point, next.point, relevantObstacles)) {
        continue;
      }
      const distance = Math.abs(next.point.y - current.point.y);
      if (distance <= EPSILON) {
        continue;
      }
      ensureAdjacency(current.key).push({ key: next.key, cost: distance, direction: 'vertical' });
      ensureAdjacency(next.key).push({ key: current.key, cost: distance, direction: 'vertical' });
    }
  }

  const startPointEntry = pointMap.get(startKey);
  const endPointEntry = pointMap.get(endKey);
  if (!startPointEntry || !endPointEntry) {
    return null;
  }

  const startStateKey = `${startKey}|none`;
  type StateMeta = { pointKey: string; direction: ConnectorTravelDirection | 'none' };
  const stateMeta = new Map<string, StateMeta>();
  stateMeta.set(startStateKey, { pointKey: startKey, direction: 'none' });

  const gScore = new Map<string, number>();
  gScore.set(startStateKey, 0);

  const fScore = new Map<string, number>();
  fScore.set(startStateKey, manhattanDistance(startPointEntry, endPointEntry));

  const cameFrom = new Map<string, string | null>();
  cameFrom.set(startStateKey, null);

  const open: string[] = [startStateKey];
  const turnPenalty = clearance * TURN_PENALTY_FACTOR;

  while (open.length) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < open.length; index += 1) {
      const candidate = open[index];
      const score = fScore.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const currentState = open.splice(bestIndex, 1)[0];
    const currentMeta = stateMeta.get(currentState);
    if (!currentMeta) {
      continue;
    }

    if (currentMeta.pointKey === endKey) {
      const path: Vec2[] = [];
      let cursor: string | null = currentState;
      const visited = new Set<string>();
      while (cursor) {
        const meta = stateMeta.get(cursor);
        if (!meta) {
          break;
        }
        const point = pointMap.get(meta.pointKey);
        if (!point) {
          break;
        }
        path.push({ x: point.x, y: point.y });
        const previous: string | null = cameFrom.get(cursor) ?? null;
        if (!previous || visited.has(previous)) {
          cursor = previous;
        } else {
          visited.add(previous);
          cursor = previous;
        }
      }
      return path.reverse();
    }

    const currentPoint = pointMap.get(currentMeta.pointKey);
    if (!currentPoint) {
      continue;
    }

    const neighbours = adjacency.get(currentMeta.pointKey);
    if (!neighbours || !neighbours.length) {
      continue;
    }

    const currentG = gScore.get(currentState) ?? Number.POSITIVE_INFINITY;

    for (const edge of neighbours) {
      const neighbourPoint = pointMap.get(edge.key);
      if (!neighbourPoint) {
        continue;
      }

      const neighbourState = `${edge.key}|${edge.direction}`;
      const moveCost = edge.cost;
      const turnCost =
        currentMeta.direction === 'none' || currentMeta.direction === edge.direction ? 0 : turnPenalty;
      const tentativeG = currentG + moveCost + turnCost;

      if (tentativeG + EPSILON >= (gScore.get(neighbourState) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      cameFrom.set(neighbourState, currentState);
      stateMeta.set(neighbourState, { pointKey: edge.key, direction: edge.direction });
      gScore.set(neighbourState, tentativeG);
      const heuristic = manhattanDistance(neighbourPoint, endPointEntry);
      fScore.set(neighbourState, tentativeG + heuristic);
      if (!open.includes(neighbourState)) {
        open.push(neighbourState);
      }
    }
  }

  return null;
};

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
  end: ResolvedEndpoint,
  nodes: NodeModel[],
  sourceNode?: NodeModel,
  targetNode?: NodeModel
): Vec2[] => {
  if (connector.mode === 'straight') {
    return [];
  }

  const stubLength = connector.style.strokeWidth ? Math.max(36, connector.style.strokeWidth * 12) : DEFAULT_STUB_LENGTH;
  const startHasStub = shouldAddStub(start.direction);
  const endHasStub = shouldAddStub(end.direction);
  let startStub = startHasStub ? offsetPoint(start.point, start.direction, stubLength) : clonePoint(start.point);
  let endStub = endHasStub ? offsetPoint(end.point, end.direction, stubLength) : clonePoint(end.point);

  const waypoints: Vec2[] = [];

  const avoidNodesEnabled = connector.style.avoidNodes !== false;
  let clearance = 0;
  let avoidanceHandled = false;

  if (avoidNodesEnabled) {
    const candidateNodes = nodes.length
      ? nodes
      : [sourceNode, targetNode].filter((node): node is NodeModel => Boolean(node));
    if (candidateNodes.length) {
      clearance = Math.max(MIN_AVOIDANCE_PADDING, stubLength / 2);
      const startNodeId = isAttachedConnectorEndpoint(connector.source) ? connector.source.nodeId : null;
      const endNodeId = isAttachedConnectorEndpoint(connector.target) ? connector.target.nodeId : null;
      const nodeRectPairs = candidateNodes.map((node) => ({
        node,
        rect: expandNodeBounds(node, clearance)
      }));

      if (startHasStub && start.direction !== 'none') {
        const startBlockingRects = nodeRectPairs
          .filter(({ node }) => startNodeId === null || node.id !== startNodeId)
          .map(({ rect }) => rect);
        startStub = computeSafeStubPoint(start.point, start.direction, stubLength, startBlockingRects);
        startStub = movePointOutsideObstacles(startStub, start.direction, clearance, startBlockingRects);
      }

      if (endHasStub && end.direction !== 'none') {
        const endBlockingRects = nodeRectPairs
          .filter(({ node }) => endNodeId === null || node.id !== endNodeId)
          .map(({ rect }) => rect);
        endStub = computeSafeStubPoint(end.point, end.direction, stubLength, endBlockingRects);
        endStub = movePointOutsideObstacles(endStub, end.direction, clearance, endBlockingRects);
      }

      const obstaclesForRouting = nodeRectPairs
        .filter(({ node, rect }) => {
          const matchesStart = startNodeId !== null && node.id === startNodeId;
          if (matchesStart && isPointInsideRect(start.point, rect)) {
            return false;
          }
          const matchesEnd = endNodeId !== null && node.id === endNodeId;
          if (matchesEnd && isPointInsideRect(end.point, rect)) {
            return false;
          }
          return true;
        })
        .map(({ rect }) => rect);

      if (obstaclesForRouting.length) {
        const avoidancePath = buildAvoidancePolyline(startStub, endStub, obstaclesForRouting, clearance);
        if (avoidancePath && avoidancePath.length >= 2) {
          if (startHasStub) {
            waypoints.push(startStub);
          }
          for (let index = 1; index < avoidancePath.length - 1; index += 1) {
            waypoints.push(avoidancePath[index]);
          }
          if (endHasStub) {
            waypoints.push(endStub);
          }
          avoidanceHandled = true;
        }
      }
    }
  }

  if (!avoidanceHandled) {
    if (startHasStub) {
      waypoints.push(startStub);
    }

    const routeStart = startHasStub ? startStub : start.point;
    const routeEnd = endHasStub ? endStub : end.point;

    const bridgeNeeded = !nearlyEqual(routeStart.x, routeEnd.x) && !nearlyEqual(routeStart.y, routeEnd.y);

    if (bridgeNeeded) {
      const horizontalFirst = Math.abs(routeEnd.x - routeStart.x) >= Math.abs(routeEnd.y - routeStart.y);
      if (horizontalFirst) {
        waypoints.push({ x: routeEnd.x, y: routeStart.y });
      } else {
        waypoints.push({ x: routeStart.x, y: routeEnd.y });
      }
    }

    if (endHasStub) {
      waypoints.push(endStub);
    }
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
    : buildDefaultWaypoints(connector, resolvedSource, resolvedTarget, nodes, sourceNode, targetNode);

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
