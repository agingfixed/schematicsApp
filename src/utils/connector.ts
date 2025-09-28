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
const MIN_STUB_LENGTH = 36;
const BASE_ARROW_STUB_LENGTH = 24;
const MAX_PREVIEW_SNAP = 1e-3;
export type ConnectorAxis = 'horizontal' | 'vertical' | 'diagonal';

export type ConnectorDirection = 'up' | 'down' | 'left' | 'right' | 'none';

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

export const getConnectorPortDirection = (port: CardinalConnectorPort): ConnectorDirection =>
  directionForPort[port];

export const getConnectorStubLength = (connector: ConnectorModel): number => {
  const arrowSize = connector.style.arrowSize ?? 1;
  return Math.max(MIN_STUB_LENGTH, arrowSize * BASE_ARROW_STUB_LENGTH);
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

const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const getConnectorPortPositions = (
  node: NodeModel
): Record<CardinalConnectorPort, Vec2> => {
  const { position, size } = node;
  const center = getNodeCenter(node);

  if (node.shape === 'triangle') {
    const top: Vec2 = { x: position.x + size.width / 2, y: position.y };
    const bottomLeft: Vec2 = { x: position.x, y: position.y + size.height };
    const bottomRight: Vec2 = { x: position.x + size.width, y: position.y + size.height };

    return {
      top,
      right: midpoint(top, bottomRight),
      bottom: midpoint(bottomLeft, bottomRight),
      left: midpoint(top, bottomLeft)
    };
  }

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
  const stubLength = getConnectorStubLength(connector);
  const startHasStub = shouldAddStub(start.direction);
  const endHasStub = shouldAddStub(end.direction);
  const startStub = startHasStub ? offsetPoint(start.point, start.direction, stubLength) : clonePoint(start.point);
  const endStub = endHasStub ? offsetPoint(end.point, end.direction, stubLength) : clonePoint(end.point);

  const waypoints: Vec2[] = [];

  if (startHasStub) {
    waypoints.push(startStub);
  }

  const routeStart = startHasStub ? startStub : start.point;
  const routeEnd = endHasStub ? endStub : end.point;

  const bridgeNeeded = !nearlyEqual(routeStart.x, routeEnd.x) && !nearlyEqual(routeStart.y, routeEnd.y);

  if (bridgeNeeded) {
    const horizontalFirst =
      start.direction === 'left' || start.direction === 'right'
        ? true
        : start.direction === 'up' || start.direction === 'down'
        ? false
        : end.direction === 'up' || end.direction === 'down'
        ? true
        : end.direction === 'left' || end.direction === 'right'
        ? false
        : Math.abs(routeEnd.x - routeStart.x) >= Math.abs(routeEnd.y - routeStart.y);

    if (horizontalFirst) {
      waypoints.push({ x: routeEnd.x, y: routeStart.y });
    } else {
      waypoints.push({ x: routeStart.x, y: routeEnd.y });
    }
  }

  if (endHasStub) {
    waypoints.push(endStub);
  }

  return waypoints.map(clonePoint);
};

const alignWaypointsToEndpoints = (
  start: ResolvedEndpoint,
  end: ResolvedEndpoint,
  waypoints: Vec2[]
): Vec2[] => {
  if (!waypoints.length) {
    return [];
  }

  const aligned = waypoints.map(clonePoint);

  if (shouldAddStub(start.direction) && aligned[0]) {
    const first = aligned[0];
    if (start.direction === 'left' || start.direction === 'right') {
      first.y = start.point.y;
      if (start.direction === 'right' && first.x < start.point.x) {
        first.x = start.point.x;
      } else if (start.direction === 'left' && first.x > start.point.x) {
        first.x = start.point.x;
      }
    } else {
      first.x = start.point.x;
      if (start.direction === 'down' && first.y < start.point.y) {
        first.y = start.point.y;
      } else if (start.direction === 'up' && first.y > start.point.y) {
        first.y = start.point.y;
      }
    }
  }

  if (shouldAddStub(end.direction)) {
    const lastIndex = aligned.length - 1;
    if (lastIndex >= 0) {
      const last = aligned[lastIndex];
      if (end.direction === 'left' || end.direction === 'right') {
        last.y = end.point.y;
        if (end.direction === 'right' && last.x < end.point.x) {
          last.x = end.point.x;
        } else if (end.direction === 'left' && last.x > end.point.x) {
          last.x = end.point.x;
        }
      } else {
        last.x = end.point.x;
        if (end.direction === 'down' && last.y < end.point.y) {
          last.y = end.point.y;
        } else if (end.direction === 'up' && last.y > end.point.y) {
          last.y = end.point.y;
        }
      }
    }
  }

  return aligned;
};

const getPerpendicularSign = (
  orientation: 'horizontal' | 'vertical',
  startDirection: ConnectorDirection,
  endDirection: ConnectorDirection
): number => {
  const pick = (direction: ConnectorDirection) => {
    if (orientation === 'horizontal') {
      if (direction === 'up') {
        return -1;
      }
      if (direction === 'down') {
        return 1;
      }
    } else {
      if (direction === 'left') {
        return -1;
      }
      if (direction === 'right') {
        return 1;
      }
    }
    return 0;
  };

  return pick(startDirection) || pick(endDirection) || 1;
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
    const isEndpointAdjacent = merged.length === 1 || index === points.length - 2;
    if ((horizontal || vertical) && !isEndpointAdjacent) {
      continue;
    }
    merged.push(clonePoint(current));
  }
  merged.push(clonePoint(points[points.length - 1]));
  return merged;
};

const dedupePoints = (points: Vec2[]): Vec2[] => {
  if (!points.length) {
    return [];
  }
  const deduped: Vec2[] = [clonePoint(points[0])];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = deduped[deduped.length - 1];
    if (nearlyEqual(previous.x, current.x) && nearlyEqual(previous.y, current.y)) {
      continue;
    }
    deduped.push(clonePoint(current));
  }
  return deduped;
};

type OrthogonalAxis = 'horizontal' | 'vertical';

const axisBetween = (start: Vec2, end: Vec2): OrthogonalAxis | null => {
  if (nearlyEqual(start.x, end.x)) {
    return 'vertical';
  }
  if (nearlyEqual(start.y, end.y)) {
    return 'horizontal';
  }
  return null;
};

const removeAxisBacktracks = (points: Vec2[]): Vec2[] => {
  if (points.length <= 2) {
    return points.map(clonePoint);
  }

  const cleaned: Vec2[] = [clonePoint(points[0])];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = cleaned[cleaned.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const prevAxis = axisBetween(prev, current);
    const nextAxis = axisBetween(current, next);
    const isFirstInterior = cleaned.length === 1;
    const isLastInterior = index === points.length - 2;

    if (prevAxis && nextAxis && prevAxis === nextAxis) {
      const prevDelta = prevAxis === 'horizontal' ? current.x - prev.x : current.y - prev.y;
      const nextDelta = nextAxis === 'horizontal' ? next.x - current.x : next.y - current.y;
      const isFold =
        prevDelta !== 0 && nextDelta !== 0 && Math.sign(prevDelta) !== Math.sign(nextDelta);
      if (isFold || (!isFirstInterior && !isLastInterior)) {
        continue;
      }
    }

    cleaned.push(clonePoint(current));
  }

  cleaned.push(clonePoint(points[points.length - 1]));
  return cleaned;
};

const MIN_DETOUR_SPAN = 12;

const removeTightDetours = (points: Vec2[]): Vec2[] => {
  if (points.length <= 3) {
    return points.map(clonePoint);
  }

  const result = points.map(clonePoint);
  let index = 1;
  while (index < result.length - 2) {
    const a = result[index - 1];
    const b = result[index];
    const c = result[index + 1];
    const d = result[index + 2];
    const axisAB = axisBetween(a, b);
    const axisBC = axisBetween(b, c);
    const axisCD = axisBetween(c, d);

    if (axisAB && axisBC && axisCD && axisAB === axisCD && axisBC !== axisAB) {
      const abDelta = axisAB === 'horizontal' ? b.x - a.x : b.y - a.y;
      const cdDelta = axisCD === 'horizontal' ? d.x - c.x : d.y - c.y;
      if (abDelta !== 0 && cdDelta !== 0 && Math.sign(abDelta) !== Math.sign(cdDelta)) {
        const separation =
          axisBC === 'horizontal' ? Math.abs(c.x - b.x) : Math.abs(c.y - b.y);
        if (separation > 0 && separation <= MIN_DETOUR_SPAN) {
          const pivot: Vec2 =
            axisBC === 'vertical'
              ? { x: d.x, y: b.y }
              : { x: b.x, y: d.y };
          const pivotDelta = axisAB === 'horizontal' ? pivot.x - a.x : pivot.y - a.y;
          const pivotSign = Math.sign(pivotDelta);
          const abSign = Math.sign(abDelta);
          const nearStart = index === 1;
          if (!nearStart || pivotSign === 0 || abSign === 0 || pivotSign === abSign) {
            result.splice(index, 2, pivot);
            if (index > 1) {
              index -= 1;
            }
            continue;
          }
        }
      }
    }

    index += 1;
  }

  return result;
};

export const tidyOrthogonalWaypoints = (start: Vec2, waypoints: Vec2[], end: Vec2): Vec2[] => {
  const combined = [start, ...stripDuplicateWaypoints(waypoints), end];
  let cleaned = dedupePoints(combined);
  cleaned = removeAxisBacktracks(cleaned);
  cleaned = dedupePoints(cleaned);
  cleaned = removeTightDetours(cleaned);
  cleaned = dedupePoints(cleaned);
  cleaned = removeAxisBacktracks(cleaned);
  cleaned = dedupePoints(cleaned);
  cleaned = mergeColinear(cleaned);
  cleaned = dedupePoints(cleaned);
  return cleaned.slice(1, -1);
};

const directionToAxis = (direction: ConnectorDirection): OrthogonalAxis | null => {
  if (direction === 'left' || direction === 'right') {
    return 'horizontal';
  }
  if (direction === 'up' || direction === 'down') {
    return 'vertical';
  }
  return null;
};

const MIN_FORCED_STUB = 12;
const MAX_FORCED_STUB = 96;

const getEnforcedStubLength = (connector: ConnectorModel): number => {
  const length = getConnectorStubLength(connector);
  if (!Number.isFinite(length) || length <= 0) {
    return MIN_FORCED_STUB;
  }
  return Math.max(MIN_FORCED_STUB, Math.min(length, MAX_FORCED_STUB));
};

const enforceEndpointStubBounds = (
  connector: ConnectorModel,
  start: ResolvedEndpoint,
  end: ResolvedEndpoint,
  waypoints: Vec2[]
): Vec2[] => {
  if (!waypoints.length) {
    return [];
  }

  const adjusted = waypoints.map(clonePoint);
  const stubLength = getEnforcedStubLength(connector);

  if (shouldAddStub(start.direction)) {
    const first = adjusted[0];
    if (start.direction === 'right') {
      if (first.x <= start.point.x) {
        first.x = start.point.x + stubLength;
      }
    } else if (start.direction === 'left') {
      if (first.x >= start.point.x) {
        first.x = start.point.x - stubLength;
      }
    } else if (start.direction === 'down') {
      if (first.y <= start.point.y) {
        first.y = start.point.y + stubLength;
      }
    } else if (start.direction === 'up') {
      if (first.y >= start.point.y) {
        first.y = start.point.y - stubLength;
      }
    }
    adjusted[0] = first;
  }

  if (shouldAddStub(end.direction)) {
    const lastIndex = adjusted.length - 1;
    const last = adjusted[lastIndex];
    if (end.direction === 'left') {
      if (last.x >= end.point.x) {
        last.x = end.point.x - stubLength;
      }
    } else if (end.direction === 'right') {
      if (last.x <= end.point.x) {
        last.x = end.point.x + stubLength;
      }
    } else if (end.direction === 'up') {
      if (last.y >= end.point.y) {
        last.y = end.point.y - stubLength;
      }
    } else if (end.direction === 'down') {
      if (last.y <= end.point.y) {
        last.y = end.point.y + stubLength;
      }
    }
    adjusted[lastIndex] = last;
  }

  return adjusted;
};

const enforceOrientationWithParity = (
  start: ResolvedEndpoint,
  waypoints: Vec2[],
  end: ResolvedEndpoint
): Vec2[] => {
  if (!waypoints.length) {
    return [];
  }

  const oriented: Vec2[] = [];
  let previous = clonePoint(start.point);
  let orientation = directionToAxis(start.direction);
  if (!orientation) {
    const probe = waypoints[0] ?? end.point;
    orientation =
      Math.abs(probe.x - previous.x) >= Math.abs(probe.y - previous.y)
        ? 'horizontal'
        : 'vertical';
  }

  for (let index = 0; index < waypoints.length; index += 1) {
    const original = waypoints[index];
    const current = { x: original.x, y: original.y };
    if (orientation === 'horizontal') {
      current.y = previous.y;
    } else {
      current.x = previous.x;
    }
    oriented.push(current);
    previous = current;
    orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  }

  const desiredFinalAxis =
    directionToAxis(end.direction) ??
    (Math.abs(previous.x - end.point.x) >= Math.abs(previous.y - end.point.y)
      ? 'horizontal'
      : 'vertical');

  if (orientation !== desiredFinalAxis) {
    const pivot =
      orientation === 'horizontal'
        ? { x: end.point.x, y: previous.y }
        : { x: previous.x, y: end.point.y };
    oriented.push(pivot);
    previous = pivot;
    orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  }

  if (oriented.length) {
    const lastIndex = oriented.length - 1;
    const last = { ...oriented[lastIndex] };
    if (orientation === 'horizontal') {
      last.y = end.point.y;
    } else {
      last.x = end.point.x;
    }
    oriented[lastIndex] = last;
  }

  return oriented.map(clonePoint);
};

const normalizeElbowWaypoints = (
  connector: ConnectorModel,
  start: ResolvedEndpoint,
  alignedWaypoints: Vec2[],
  end: ResolvedEndpoint
): Vec2[] => {
  if (!alignedWaypoints.length) {
    return [];
  }

  const stubAdjusted = enforceEndpointStubBounds(connector, start, end, alignedWaypoints);
  const tidied = tidyOrthogonalWaypoints(start.point, stubAdjusted, end.point);
  const base = tidied.length
    ? tidied
    : buildDefaultWaypoints(connector, start, end);
  if (!base.length) {
    return base;
  }

  return enforceOrientationWithParity(start, base, end);
};

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
  const alignedWaypoints = baseWaypoints.length
    ? alignWaypointsToEndpoints(
        resolvedSource,
        resolvedTarget,
        stripDuplicateWaypoints(baseWaypoints)
      )
    : buildDefaultWaypoints(connector, resolvedSource, resolvedTarget);

  const normalizedWaypoints = normalizeElbowWaypoints(
    connector,
    resolvedSource,
    alignedWaypoints,
    resolvedTarget
  );

  const points = [
    resolvedSource.point,
    ...normalizedWaypoints.map(clonePoint),
    resolvedTarget.point
  ];
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
