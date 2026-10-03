/**
 * 共享 esbuild 打包 helper —— 把仓库 .ts 真模块现场 bundle 成临时 ESM 后 import。
 *
 * 为什么存在：Node 22.x 默认不做类型剥离，verify 脚本直接 `import '../src/**.ts'`
 * 会抛 ERR_UNKNOWN_FILE_EXTENSION（默认开启 type stripping 要 Node ≥23.6）。
 * 本 helper 与 verify-physics-failure.mjs / verify-audio-envelope.mjs 的内联打包
 * 模式同款，收敛到一处，避免每个脚本各复制一份 esbuild 调用。
 *
 * 用法（脚本内顶层 await）：
 *   import { bundleTs } from './lib/bundle-ts.mjs';
 *   const [{ broadcastStateAt }] = await bundleTs(['src/data/broadcastSchedule.ts']);
 *   const [{ assertNoImplicitPromotion }, { exportDependencyGraph }] = await bundleTs([
 *     'src/kernel/types.ts', 'src/kernel/scenario.ts'
 *   ]);
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
/** 仓库根（本文件位于 scripts/lib/ 下）。 */
export const REPO_ROOT = resolve(LIB_DIR, '..', '..');

/**
 * 现场打包并加载若干 .ts 入口。
 * @param {readonly string[]} relEntries 仓库相对路径（.ts 入口，各自独立打包）
 * @returns {Promise<object[]>} 与入参顺序一致的模块命名空间数组
 */
export async function bundleTs(relEntries) {
  const esbuild = resolve(REPO_ROOT, 'node_modules', '.bin', 'esbuild');
  if (!existsSync(esbuild)) {
    throw new Error('缺少 esbuild（vite 内置依赖）—— 无法对真模块断言');
  }
  const tmp = mkdtempSync(resolve(tmpdir(), 'verify-ts-'));
  try {
    const imports = relEntries.map((rel, i) => {
      const outfile = resolve(tmp, `m${i}.mjs`);
      execFileSync(esbuild, [
        resolve(REPO_ROOT, rel),
        '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
        `--outfile=${outfile}`
      ], { stdio: ['ignore', 'ignore', 'inherit'] });
      return import(pathToFileURL(outfile).href);
    });
    return await Promise.all(imports);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
