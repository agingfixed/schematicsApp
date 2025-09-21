import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDINAL_PORTS,
  cloneConnectorEndpoint,
  getConnectorPath,
  getConnectorPortPositions,
  isCardinalConnectorPortValue,
  tidyOrthogonalWaypoints
} from '../connector';
import type {
  CardinalConnectorPort,
  ConnectorModel,
  NodeModel,
  Vec2
} from '../../types/scene';

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

const createRng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

test('cardinal connector ports recognise the supported values', () => {
  for (const port of CARDINAL_PORTS) {
    assert.ok(isCardinalConnectorPortValue(port), `Expected ${port} to be recognised.`);
  }
  assert.ok(!isCardinalConnectorPortValue('center'));
  assert.ok(!isCardinalConnectorPortValue('auto'));
});

test('connector port positions align to side midpoints', () => {
  const node = createNode('node', { x: 40, y: 100 }, { width: 120, height: 80 });
  const ports = getConnectorPortPositions(node);
  assert.deepStrictEqual(ports.top, { x: 100, y: 100 });
  assert.deepStrictEqual(ports.right, { x: 160, y: 140 });
  assert.deepStrictEqual(ports.bottom, { x: 100, y: 180 });
  assert.deepStrictEqual(ports.left, { x: 40, y: 140 });
});

test('cloneConnectorEndpoint rejects non-cardinal attachments', () => {
  const attached = { nodeId: 'node', port: 'center' as unknown as CardinalConnectorPort };
  assert.throws(() => cloneConnectorEndpoint(attached), /cardinal/i);
});

test('elbow connectors remain orthogonal and perpendicular at ports', () => {
  const rng = createRng(1337);

  for (let iteration = 0; iteration < 16; iteration += 1) {
    const source = createNode(
      'source',
      {
        x: Math.round((rng() - 0.5) * 800),
        y: Math.round((rng() - 0.5) * 600)
      },
      {
        width: 120 + Math.round(rng() * 120),
        height: 90 + Math.round(rng() * 90)
      }
    );
    const target = createNode(
      'target',
      {
        x: Math.round((rng() - 0.5) * 800) + 200,
        y: Math.round((rng() - 0.5) * 600) + 200
      },
      {
        width: 120 + Math.round(rng() * 120),
        height: 90 + Math.round(rng() * 90)
      }
    );

    for (const startPort of CARDINAL_PORTS) {
      for (const endPort of CARDINAL_PORTS) {
        const connector = createConnector('elbow', startPort, endPort);
        let path: ReturnType<typeof getConnectorPath> | null = null;
        try {
          path = getConnectorPath(connector, source, target);
        } catch (error) {
          assert.fail(
            `Routing failed for ${startPort}→${endPort} (iteration ${iteration}): ${(error as Error).message}`
          );
        }
        if (!path) {
          continue;
        }

        assert.ok(path.points.length >= 2);

        for (let index = 0; index < path.points.length - 1; index += 1) {
          const a = path.points[index];
          const b = path.points[index + 1];
          const dx = Math.abs(b.x - a.x);
          const dy = Math.abs(b.y - a.y);
          const orthogonal = dx < 1e-6 || dy < 1e-6;
          assert.ok(orthogonal, 'Segments must be orthogonal.');
        }

        const first = path.points[0];
        const second = path.points[1];
        if (startPort === 'top' || startPort === 'bottom') {
          assert.ok(Math.abs(second.x - first.x) < 1e-6);
          const delta = second.y - first.y;
          if (startPort === 'top') {
            assert.ok(delta < 0);
          } else {
            assert.ok(delta > 0);
          }
        } else {
          assert.ok(Math.abs(second.y - first.y) < 1e-6);
          const delta = second.x - first.x;
          if (startPort === 'left') {
            assert.ok(delta < 0);
          } else {
            assert.ok(delta > 0);
          }
        }

        const penultimate = path.points[path.points.length - 2];
        const last = path.points[path.points.length - 1];
        if (endPort === 'top' || endPort === 'bottom') {
          assert.ok(Math.abs(last.x - penultimate.x) < 1e-6);
          const delta = last.y - penultimate.y;
          if (endPort === 'top') {
            assert.ok(delta > 0);
          } else {
            assert.ok(delta < 0);
          }
        } else {
          assert.ok(Math.abs(last.y - penultimate.y) < 1e-6);
          const delta = last.x - penultimate.x;
          if (endPort === 'left') {
            assert.ok(delta > 0);
          } else {
            assert.ok(delta < 0);
          }
        }
      }
    }
  }
});

test('straight connectors produce a single segment between ports', () => {
  const source = createNode('source', { x: 0, y: 0 });
  const target = createNode('target', { x: 320, y: 200 });
  const connector = createConnector('straight', 'right', 'left');
  const path = getConnectorPath(connector, source, target);
  assert.deepStrictEqual(path.waypoints, []);
  assert.strictEqual(path.points.length, 2);
  assert.deepStrictEqual(path.points[0], getConnectorPortPositions(source).right);
  assert.deepStrictEqual(path.points[1], getConnectorPortPositions(target).left);
});

test('tidyOrthogonalWaypoints collapses redundant points', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 200, y: 160 };
  const base: Vec2[] = [
    { x: 0, y: 40 },
    { x: 0.4, y: 40 },
    { x: 0.4, y: 120 },
    { x: 0.4000001, y: 120.0000001 },
    { x: 180, y: 120 },
    { x: 180, y: 150 }
  ];

  const tidy = tidyOrthogonalWaypoints(start, base, end);
  assert.ok(tidy.length < base.length);

  const points = [start, ...tidy, end];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const dx = Math.abs(next.x - current.x);
    const dy = Math.abs(next.y - current.y);
    const orthogonal = dx < 1e-6 || dy < 1e-6;
    assert.ok(orthogonal, 'Segments must remain orthogonal.');
  }

  for (let index = 1; index < tidy.length; index += 1) {
    const prev = tidy[index - 1];
    const current = tidy[index];
    const dx = Math.abs(prev.x - current.x);
    const dy = Math.abs(prev.y - current.y);
    assert.ok(dx > 1e-6 || dy > 1e-6, 'Consecutive points must not collapse to duplicates.');
  }
});
