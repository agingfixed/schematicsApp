import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDINAL_PORTS,
  cloneConnectorEndpoint,
  findClosestPointOnPolyline,
  getConnectorPath,
  getConnectorPortPositions,
  getConnectorStubLength,
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
  stopArrow: { shape: 'none', fill: 'filled' },
  arrowSize: 1,
  cornerRadius: 12
};

const createConnector = (
  sourcePort: CardinalConnectorPort,
  targetPort: CardinalConnectorPort
): ConnectorModel => ({
  id: 'connector',
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

test('connectors create orthogonal paths with outward stubs', () => {
  const source = createNode('source', { x: 0, y: 0 });
  const target = createNode('target', { x: 320, y: 120 });
  const connector = createConnector('right', 'left');

  const path = getConnectorPath(connector, source, target, [source, target]);
  assert.ok(path.points.length >= 4, 'expected elbow connectors to include intermediate waypoints');

  const firstSegment = { start: path.points[0], end: path.points[1] };
  assert.ok(Math.abs(firstSegment.start.y - firstSegment.end.y) < 1e-3, 'start stub should be horizontal');
  assert.ok(firstSegment.end.x > firstSegment.start.x, 'start stub should extend outward');

  const lastSegment = {
    start: path.points[path.points.length - 2],
    end: path.points[path.points.length - 1]
  };
  assert.ok(Math.abs(lastSegment.start.y - lastSegment.end.y) < 1e-3, 'stop stub should be horizontal');
  assert.ok(lastSegment.start.x < lastSegment.end.x, 'stop stub should extend outward');

  for (let index = 0; index < path.points.length - 1; index += 1) {
    const a = path.points[index];
    const b = path.points[index + 1];
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    assert.ok(dx < 1e-3 || dy < 1e-3, 'segments must remain orthogonal');
  }
});

test('aligned connectors preserve outward stubs', () => {
  const source = createNode('source', { x: 0, y: 120 });
  const target = createNode('target', { x: 320, y: 120 });
  const connector = createConnector('right', 'left');

  const path = getConnectorPath(connector, source, target, [source, target]);
  assert.strictEqual(path.points.length, 4, 'expected preserved stubs around aligned nodes');
  const startStub = path.points[1];
  const endStub = path.points[path.points.length - 2];
  assert.ok(Math.abs(startStub.y - path.start.y) < 1e-3);
  assert.ok(startStub.x > path.start.x);
  assert.ok(Math.abs(endStub.y - path.end.y) < 1e-3);
  assert.ok(endStub.x < path.end.x);
});

test('connector stub length is controlled by arrow size instead of stroke width', () => {
  const startSource = createNode('source', { x: 0, y: 120 });
  const startTarget = createNode('target', { x: 320, y: 120 });

  const startThin = createConnector('right', 'left');
  startThin.style.arrowSize = 1;

  const startThick = createConnector('right', 'left');
  startThick.style.strokeWidth = 8;
  startThick.style.arrowSize = 1;

  const startLarge = createConnector('right', 'left');
  startLarge.style.arrowSize = 2;

  const thinStartPath = getConnectorPath(startThin, startSource, startTarget, [startSource, startTarget]);
  const thickStartPath = getConnectorPath(startThick, startSource, startTarget, [startSource, startTarget]);
  const largeStartPath = getConnectorPath(startLarge, startSource, startTarget, [startSource, startTarget]);

  const stubLength = thinStartPath.points[1].x - thinStartPath.points[0].x;
  const thickStubLength = thickStartPath.points[1].x - thickStartPath.points[0].x;
  const largeArrowStubLength = largeStartPath.points[1].x - largeStartPath.points[0].x;

  const endSource = createNode('source', { x: 0, y: 320 });
  const endTarget = createNode('target', { x: 320, y: 0 });

  const endThin = createConnector('bottom', 'left');
  endThin.style.arrowSize = 1;

  const endThick = createConnector('bottom', 'left');
  endThick.style.strokeWidth = 8;
  endThick.style.arrowSize = 1;

  const endLarge = createConnector('bottom', 'left');
  endLarge.style.arrowSize = 2;

  const thinEndPath = getConnectorPath(endThin, endSource, endTarget, [endSource, endTarget]);
  const thickEndPath = getConnectorPath(endThick, endSource, endTarget, [endSource, endTarget]);
  const largeEndPath = getConnectorPath(endLarge, endSource, endTarget, [endSource, endTarget]);

  const thinEndStubLength = Math.abs(
    thinEndPath.points[thinEndPath.points.length - 2].x - thinEndPath.points[thinEndPath.points.length - 1].x
  );
  const thickEndStubLength = Math.abs(
    thickEndPath.points[thickEndPath.points.length - 2].x - thickEndPath.points[thickEndPath.points.length - 1].x
  );
  const largeArrowEndStubLength = Math.abs(
    largeEndPath.points[largeEndPath.points.length - 2].x - largeEndPath.points[largeEndPath.points.length - 1].x
  );


  assert.ok(Math.abs(stubLength - thickStubLength) < 1e-6, 'stroke width should not affect stub length');
  assert.ok(
    largeArrowStubLength > stubLength,
    'increasing arrow size should expand stub length to preserve spacing'
  );
  assert.ok(
    Math.abs(thinEndStubLength - thickEndStubLength) < 1e-6,
    'stroke width should not affect end stub length'
  );
  assert.ok(
    largeArrowEndStubLength > thinEndStubLength,
    'end stub length should expand with arrow size just like the start stub'
  );
});

test('stop stubs mirror the direction of the target port', () => {
  const scenarios: Array<{
    sourcePort: CardinalConnectorPort;
    targetPort: CardinalConnectorPort;
    sourcePosition: Vec2;
    targetPosition: Vec2;
    expectedDelta: { x: number; y: number };
  }> = [
    {
      sourcePort: 'right',
      targetPort: 'left',
      sourcePosition: { x: 0, y: 120 },
      targetPosition: { x: 320, y: 120 },
      expectedDelta: { x: 1, y: 0 }
    },
    {
      sourcePort: 'left',
      targetPort: 'right',
      sourcePosition: { x: 320, y: 120 },
      targetPosition: { x: 0, y: 120 },
      expectedDelta: { x: -1, y: 0 }
    },
    {
      sourcePort: 'bottom',
      targetPort: 'top',
      sourcePosition: { x: 160, y: 320 },
      targetPosition: { x: 160, y: 0 },
      expectedDelta: { x: 0, y: -1 }
    },
    {
      sourcePort: 'top',
      targetPort: 'bottom',
      sourcePosition: { x: 160, y: 0 },
      targetPosition: { x: 160, y: 320 },
      expectedDelta: { x: 0, y: 1 }
    }
  ];

  for (const scenario of scenarios) {
    const source = createNode('source', scenario.sourcePosition);
    const target = createNode('target', scenario.targetPosition);
    const connector = createConnector(scenario.sourcePort, scenario.targetPort);
    const path = getConnectorPath(connector, source, target, [source, target]);

    const penultimate = path.points[path.points.length - 2];
    const end = path.points[path.points.length - 1];
    const vector = { x: end.x - penultimate.x, y: end.y - penultimate.y };
    const stubLength = getConnectorStubLength(connector);

    assert.ok(
      Math.hypot(vector.x, vector.y) >= stubLength - 1e-6,
      'final segment should reserve enough space for the stop stub'
    );

    if (scenario.expectedDelta.x !== 0) {
      assert.strictEqual(Math.sign(vector.x), Math.sign(scenario.expectedDelta.x), 'stub should face horizontally');
      assert.ok(Math.abs(vector.y) < 1e-3, 'horizontal stubs should not drift vertically');
    }

    if (scenario.expectedDelta.y !== 0) {
      assert.strictEqual(Math.sign(vector.y), Math.sign(scenario.expectedDelta.y), 'stub should face vertically');
      assert.ok(Math.abs(vector.x) < 1e-3, 'vertical stubs should not drift horizontally');
    }

    if (scenario.expectedDelta.x === 0) {
      assert.ok(Math.abs(vector.x) < 1e-3, 'vertical stubs should not add horizontal offset');
    }

    if (scenario.expectedDelta.y === 0) {
      assert.ok(Math.abs(vector.y) < 1e-3, 'horizontal stubs should not add vertical offset');
    }
  }
});

test('manual waypoints stay aligned to endpoints', () => {
  const originalSource = createNode('source', { x: 0, y: 0 });
  const originalTarget = createNode('target', { x: 320, y: 200 });
  const connector = createConnector('right', 'left');
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

test('connectors keep right angles when endpoints move', () => {
  const seedSource = createNode('source', { x: 0, y: 0 });
  const seedTarget = createNode('target', { x: 320, y: 200 });
  const connector = createConnector('right', 'left');

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
