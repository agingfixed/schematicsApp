import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeModel } from '../scene';
import type { NodeKind } from '../../types/scene';

test('createNodeModel creates nodes with positive sizes for each shape', () => {
  const shapes: NodeKind[] = ['rectangle', 'circle', 'ellipse', 'triangle', 'diamond'];
  for (const shape of shapes) {
    const node = createNodeModel(shape, { x: 0, y: 0 });
    assert.strictEqual(node.shape, shape);
    assert.ok(node.size.width > 0, `Expected width for ${shape} to be greater than 0`);
    assert.ok(node.size.height > 0, `Expected height for ${shape} to be greater than 0`);
  }
});

test('createNodeModel falls back to rectangle when defaults are missing', () => {
  const node = createNodeModel('invalid-shape' as NodeKind, { x: 0, y: 0 });
  assert.strictEqual(node.shape, 'rectangle');
  assert.ok(node.size.width > 0);
  assert.ok(node.size.height > 0);
});
