// #21 Rabbit Hole 递归等比门槛单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleTs } from './lib/bundle-ts.mjs';

const [
  {
    rabbitHoleJourney,
    isMonotonicDecreasing,
    RABBIT_HOLE_AXIS,
    RABBIT_HOLE_NODE_COUNT,
    RABBIT_HOLE_S0,
    RABBIT_HOLE_Q,
  },
] = await bundleTs(['src/data/rabbitHoleJourney.ts']);

test('#21 节点数恰为 7', () => {
  assert.equal(RABBIT_HOLE_AXIS.length, RABBIT_HOLE_NODE_COUNT);
  const nodes = rabbitHoleJourney();
  assert.equal(nodes.length, 7);
});

test('#21 轴序列为 40→19→6→1→2→11→28', () => {
  assert.deepEqual([...RABBIT_HOLE_AXIS], [40, 19, 6, 1, 2, 11, 28]);
});

test('#21 节点尺度等比收束 s_n = s_0 * q^n', () => {
  const nodes = rabbitHoleJourney();
  for (let i = 0; i < nodes.length; i++) {
    const expected = RABBIT_HOLE_S0 * Math.pow(RABBIT_HOLE_Q, i);
    assert.ok(Math.abs(nodes[i].scale - expected) < 0.001);
  }
});

test('#21 尺度单调递减', () => {
  const nodes = rabbitHoleJourney();
  assert.ok(isMonotonicDecreasing(nodes));
});
