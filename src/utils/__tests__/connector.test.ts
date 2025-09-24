import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDINAL_PORTS,
  cloneConnectorEndpoint,
  findClosestPointOnPolyline,
  getConnectorPath,
  getConnectorPortPositions,
  isCardinalConnectorPortValue,
  tidyOrthogonalWaypoints
} from '../connector';
import type { CardinalConnectorPort, ConnectorModel, NodeModel, Vec2 } from '../../types/scene';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

const createNode = (
  id: string,
  position: Vec2,
  size: { width: number; height: number } = { width: 160, height: 120 }
): NodeModel => ({
  id,
  shape: 'rectangle',
  position: { ...position },
  size: { ...size },
  text: '',
  textAlign: 'center',
  fontSize: 16,
  fontWeight: 600,
  textColor: '#ffffff',
  fill: '#ffffff',
  fillOpacity: 1,
  stroke: { color: '#0f172a', width: 1 },
  shadow: false
});

const defaultConnectorStyle: Mutable<ConnectorModel['style']> = {
  stroke: '#111827',
  strokeWidth: 2,
  dashed: false,
  startArrow: { shape: 'none', fill: 'filled' },
  endArrow: { shape: 'arrow', fill: 'filled' },
  arrowSize: 1,
  cornerRadius: 12,
  avoidNodes: false
};

const createConnector = (
  mode: ConnectorModel['mode'],
  sourcePort: CardinalConnectorPort,
  targetPort: CardinalConnectorPort
): ConnectorModel => ({
  id: 'connector',
  mode,
  source: { nodeId: 'source', port: sourcePort },
  target: { nodeId: 'target', port: targetPort },
  style: { ...defaultConnectorStyle },
  labelPosition: 0.5,
  labelOffset: 18
});

const expandRect = (node: NodeModel, clearance: number) => ({
  left: node.position.x - clearance,
  right: node.position.x + node.size.width + clearance,
  top: node.position.y - clearance,
  bottom: node.position.y + node.size.height + clearance
});

const segmentCrossesRect = (
  segment: { start: Vec2; end: Vec2; axis: 'horizontal' | 'vertical' | 'diagonal'; },
  rect: ReturnType<typeof expandRect>,
  epsilon = 1e-3
) => {
  if (segment.axis === 'horizontal') {
    const y = segment.start.y;
    if (y > rect.top + epsilon && y < rect.bottom - epsilon) {
      const minX = Math.min(segment.start.x, segment.end.x);
      const maxX = Math.max(segment.start.x, segment.end.x);
      return maxX > rect.left + epsilon && minX < rect.right - epsilon;
    }
    return false;
  }
  if (segment.axis === 'vertical') {
    const x = segment.start.x;
    if (x > rect.left + epsilon && x < rect.right - epsilon) {
      const minY = Math.min(segment.start.y, segment.end.y);
      const maxY = Math.max(segment.start.y, segment.end.y);
      return maxY > rect.top + epsilon && minY < rect.bottom - epsilon;
    }
    return false;
  }
  return false;
};

test('cardinal connector ports recognise supported values', () => {
  for (const port of CARDINAL_PORTS) {
    assert.ok(isCardinalConnectorPortValue(port), `Expected ${port} to be recognised.`);
  }
  assert.ok(!isCardinalConnectorPortValue('center'));
  assert.ok(!isCardinalConnectorPortValue('auto'));
});

test('connector port positions align to bounding box midpoints', () => {
  const node = createNode('node', { x: 40, y: 100 }, { width: 120, height: 80 });
  const ports = getConnectorPortPositions(node);
  assert.deepStrictEqual(ports.top, { x: 100, y: 100 });
  assert.deepStrictEqual(ports.right, { x: 160, y: 140 });
  assert.deepStrictEqual(ports.bottom, { x: 100, y: 180 });
  assert.deepStrictEqual(ports.left, { x: 40, y: 140 });
});

test('cloneConnectorEndpoint returns independent copies', () => {
  const attached = cloneConnectorEndpoint({ nodeId: 'node', port: 'right' });
  assert.deepStrictEqual(attached, { nodeId: 'node', port: 'right' });

  const originalFloating = { position: { x: 10, y: 20 } };
  const floating = cloneConnectorEndpoint(originalFloating);
  assert.ok('position' in floating, 'expected floating endpoint to include a position');
  if ('position' in floating) {
    assert.deepStrictEqual(floating.position, { x: 10, y: 20 });
    originalFloating.position.x = 99;
    assert.strictEqual(floating.position.x, 10);
  }
});

test('elbow connectors create orthogonal paths with outward stubs', () => {
  const source = createNode('source', { x: 0, y: 0 });
  const target = createNode('target', { x: 320, y: 120 });
  const connector = createConnector('elbow', 'right', 'left');

  const path = getConnectorPath(connector, source, target, [source, target]);
  assert.ok(path.points.length >= 4, 'expected elbow connectors to include intermediate waypoints');

  const firstSegment = { start: path.points[0], end: path.points[1] };
  assert.ok(Math.abs(firstSegment.start.y - firstSegment.end.y) < 1e-3, 'start stub should be horizontal');
  assert.ok(firstSegment.end.x > firstSegment.start.x, 'start stub should extend outward');

  for (let index = 0; index < path.points.length - 1; index += 1) {
    const a = path.points[index];
    const b = path.points[index + 1];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    assert.ok(dx < 1e-3 || dy < 1e-3, 'segments must remain orthogonal');
  }
});

test('straight connectors connect ports directly', () => {
  const source = createNode('source', { x: 0, y: 0 });
  const target = createNode('target', { x: 320, y: 200 });
  const connector = createConnector('straight', 'right', 'left');

  const path = getConnectorPath(connector, source, target, [source, target]);
  assert.strictEqual(path.points.length, 2);
  assert.deepStrictEqual(path.points[0], getConnectorPortPositions(source).right);
  assert.deepStrictEqual(path.points[1], getConnectorPortPositions(target).left);
});

test('tidyOrthogonalWaypoints removes redundant points', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const noisy = [
    { x: 20, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 60, y: 40 },
    { x: 60, y: 0 },
    { x: 80, y: 0 }
  ];

  const cleaned = tidyOrthogonalWaypoints(start, noisy, end);
  assert.deepStrictEqual(cleaned, [
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 60, y: 40 },
    { x: 60, y: 0 }
  ]);
});

test('avoidance-aware connectors route around nearby nodes', () => {
  const source = createNode('source', { x: 0, y: 100 });
  const target = createNode('target', { x: 420, y: 100 });
  const blocker = createNode('blocker', { x: 200, y: 70 }, { width: 140, height: 140 });

  const connector = createConnector('elbow', 'right', 'left');
  connector.style.avoidNodes = true;

  const path = getConnectorPath(connector, source, target, [source, target, blocker]);

  const stubLength = Math.max(36, connector.style.strokeWidth * 12);
  const clearance = Math.max(24, stubLength / 2);
  const padded = expandRect(blocker, clearance);

  assert.ok(
    path.segments.length >= 4,
    'expected avoidance to introduce intermediate waypoints'
  );

  for (const segment of path.segments) {
    assert.ok(!segmentCrossesRect(segment, padded), 'segment should not overlap blocked area');
  }
});

test('closest point on polyline identifies the nearest segment', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 }
  ];
  const probe = { x: 80, y: 40 };
  const result = findClosestPointOnPolyline(probe, line);
  assert.strictEqual(result.index, 1);
  assert.ok(Math.abs(result.point.x - 100) < 1e-3);
  assert.ok(Math.abs(result.point.y - 40) < 1e-3);
});
