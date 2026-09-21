// #26 World Kernel 类型单测
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoImplicitPromotion } from '../src/kernel/types.ts';
import { exportDependencyGraph } from '../src/kernel/scenario.ts';

test('#26 设定不能提升为历史事实', () => {
  assert.throws(() => assertNoImplicitPromotion('设', '史'), /非法认识论提升/);
});

test('#26 模型可以提升为历史事实（经过验证）', () => {
  assert.doesNotThrow(() => assertNoImplicitPromotion('模', '史'));
});

test('#26 工程实现不能提升为历史事实', () => {
  assert.throws(() => assertNoImplicitPromotion('工', '史'), /非法认识论提升/);
});

test('#26 依赖图导出', () => {
  const manifest = {
    id: 'test-scenario',
    version: '1.0.0',
    objects: [
      { id: 'obj-a', version: '1.0.0', epistemicType: '史' },
      { id: 'obj-b', version: '2.0.0', epistemicType: '模' },
    ],
    adapters: [],
    observer: { time: 0, position: {x:0,y:0,z:0}, orientation: {yaw:0,pitch:0,roll:0}, scale: 1, precision: 0.01, referenceFrame: 'local' },
    dependencyGraph: ['obj-a', 'obj-b'],
  };
  const graph = exportDependencyGraph(manifest);
  assert.equal(graph.length, 2);
  assert.ok(graph[0].includes('obj-a'));
  assert.ok(graph[0].includes('[史]'));
});
