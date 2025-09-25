import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDINAL_PORTS,
  cloneConnectorEndpoint,
  buildStraightConnectorBend,
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
  cornerRadius: 12
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

test('aligned elbow connectors preserve outward stubs', () => {
  const source = createNode('source', { x: 0, y: 120 });
  const target = createNode('target', { x: 320, y: 120 });
  const connector = createConnector('elbow', 'right', 'left');

  const path = getConnectorPath(connector, source, target, [source, target]);
  assert.strictEqual(path.points.length, 4, 'expected preserved stubs around aligned nodes');
  const startStub = path.points[1];
  const endStub = path.points[path.points.length - 2];
  assert.ok(Math.abs(startStub.y - path.start.y) < 1e-3);
  assert.ok(startStub.x > path.start.x);
  assert.ok(Math.abs(endStub.y - path.end.y) < 1e-3);
  assert.ok(endStub.x < path.end.x);
});

test('manual elbow waypoints stay aligned to endpoints', () => {
  const originalSource = createNode('source', { x: 0, y: 0 });
  const originalTarget = createNode('target', { x: 320, y: 200 });
  const connector = createConnector('elbow', 'right', 'left');
  connector.points = [
    { x: 200, y: originalSource.position.y },
    { x: 200, y: originalTarget.position.y }
  ];

  const movedSource = createNode('source', { x: 80, y: 60 });
  const movedTarget = createNode('target', { x: 420, y: 280 });

  const path = getConnectorPath(connector, movedSource, movedTarget, [movedSource, movedTarget]);
  assert.ok(path.waypoints.length >= 2, 'expected preserved interior waypoints');
  const first = path.waypoints[0];
  const last = path.waypoints[path.waypoints.length - 1];
  assert.ok(Math.abs(first.y - path.start.y) < 1e-3, 'first waypoint should align with source port');
  assert.ok(first.x >= path.start.x, 'first waypoint should remain outward from the node');
  assert.ok(Math.abs(last.y - path.end.y) < 1e-3, 'last waypoint should align with target port');
  assert.ok(last.x <= path.end.x, 'last waypoint should remain outward from the node');
});

test('elbow connectors keep right angles when endpoints move', () => {
  const seedSource = createNode('source', { x: 0, y: 0 });
  const seedTarget = createNode('target', { x: 320, y: 200 });
  const connector = createConnector('elbow', 'right', 'left');

  const seededPath = getConnectorPath(connector, seedSource, seedTarget, [seedSource, seedTarget]);
  connector.points = seededPath.waypoints.map((point) => ({ ...point }));

  const movedSource = createNode('source', { x: 80, y: -60 });
  const movedTarget = createNode('target', { x: 480, y: 260 });

  const path = getConnectorPath(connector, movedSource, movedTarget, [movedSource, movedTarget]);
  assert.ok(path.points.length > 2, 'expected elbow connector to keep bends after moving nodes');

  for (let index = 0; index < path.points.length - 1; index += 1) {
    const a = path.points[index];
    const b = path.points[index + 1];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    assert.ok(
      dx < 1e-3 || dy < 1e-3,
      'segments must remain horizontal or vertical after moving attached nodes'
    );
  }
});

test('straight connectors connect ports directly', () => {
  const source = createNode('source', { x: 0, y: 0 });
  const target = createNode('target', { x: 320, y: 200 });
  const connector = createConnector('straight', 'right', 'left');

  const path = getConnectorPath(connector, source, target, [source, target]);
  const sourcePort = getConnectorPortPositions(source).right;
  const targetPort = getConnectorPortPositions(target).left;

  assert.strictEqual(path.points.length, 4);
  assert.deepStrictEqual(path.points[0], sourcePort);
  assert.deepStrictEqual(path.points[path.points.length - 1], targetPort);

  const startStub = path.points[1];
  assert.ok(Math.abs(startStub.y - sourcePort.y) < 1e-3, 'expected start stub to stay horizontal');
  assert.ok(startStub.x > sourcePort.x, 'expected start stub to extend outward from the node');

  const endStub = path.points[path.points.length - 2];
  assert.ok(Math.abs(endStub.y - targetPort.y) < 1e-3, 'expected end stub to stay horizontal');
  assert.ok(endStub.x < targetPort.x, 'expected end stub to extend outward from the node');
});

test('straight connectors keep vertical stubs aligned to node edges', () => {
  const source = createNode('source', { x: 200, y: 0 });
  const target = createNode('target', { x: 200, y: 320 });
  const connector = createConnector('straight', 'top', 'bottom');

  const path = getConnectorPath(connector, source, target, [source, target]);
  const sourcePort = getConnectorPortPositions(source).top;
  const targetPort = getConnectorPortPositions(target).bottom;

  assert.strictEqual(path.points.length, 4);
  assert.deepStrictEqual(path.points[0], sourcePort);
  assert.deepStrictEqual(path.points[path.points.length - 1], targetPort);

  const startStub = path.points[1];
  assert.ok(Math.abs(startStub.x - sourcePort.x) < 1e-3, 'expected start stub to stay vertical');
  assert.ok(startStub.y < sourcePort.y, 'expected top port stub to extend outward from the node');

  const endStub = path.points[path.points.length - 2];
  assert.ok(Math.abs(endStub.x - targetPort.x) < 1e-3, 'expected end stub to stay vertical');
  assert.ok(endStub.y > targetPort.y, 'expected bottom port stub to extend outward from the node');
});

test('tidyOrthogonalWaypoints removes redundant points', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const noisy = [
    { x: 20, y: 0 },
    { x: 20, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 60, y: 40 },
    { x: 60, y: 0 },
    { x: 60, y: 0 },
    { x: 80, y: 0 }
  ];

  const cleaned = tidyOrthogonalWaypoints(start, noisy, end);
  assert.deepStrictEqual(cleaned, [
    { x: 20, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 60, y: 40 },
    { x: 60, y: 0 },
    { x: 80, y: 0 }
  ]);
});

test('tidyOrthogonalWaypoints removes 180 degree folds', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 10, y: 120 };
  const folded = [
    { x: 60, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 60 }
  ];

  const cleaned = tidyOrthogonalWaypoints(start, folded, end);
  assert.deepStrictEqual(cleaned, [
    { x: 10, y: 0 },
    { x: 10, y: 60 }
  ]);
});

test('tidyOrthogonalWaypoints collapses tight detours', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 20, y: 160 };
  const detour = [
    { x: 60, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 8 },
    { x: 20, y: 8 },
    { x: 20, y: 80 }
  ];

  const cleaned = tidyOrthogonalWaypoints(start, detour, end);
  assert.deepStrictEqual(cleaned, [
    { x: 20, y: 0 },
    { x: 20, y: 80 }
  ]);
  for (let index = 0; index < cleaned.length - 1; index += 1) {
    const a = index === 0 ? start : cleaned[index - 1];
    const b = cleaned[index];
    const c = cleaned[index + 1];
    const firstAxis = Math.abs(a.x - b.x) < 1e-3 ? 'vertical' : 'horizontal';
    const secondAxis = Math.abs(b.x - c.x) < 1e-3 ? 'vertical' : 'horizontal';
    assert.ok(firstAxis !== secondAxis, 'turns should remain orthogonal');
  }
});

test('buildStraightConnectorBend produces three right-angle turns', () => {
  const start = { x: 100, y: 180 };
  const end = { x: 420, y: 180 };
  const waypoints = buildStraightConnectorBend(start, 'right', end, 'left', 60);

  assert.strictEqual(waypoints.length, 4);
  const [stubStart, pivotA, pivotB, stubEnd] = waypoints;
  assert.ok(Math.abs(stubStart.y - start.y) < 1e-3);
  assert.ok(stubStart.x > start.x);
  assert.ok(Math.abs(pivotA.x - stubStart.x) < 1e-3);
  assert.ok(Math.abs(pivotB.y - pivotA.y) < 1e-3);
  assert.ok(Math.abs(stubEnd.y - end.y) < 1e-3);
  assert.ok(stubEnd.x < end.x);
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
