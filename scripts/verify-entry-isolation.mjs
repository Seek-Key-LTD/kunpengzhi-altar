/**
 * #5 · 公共 / 工程入口隔离 · 可复跑断言（无头 Chromium）。
 *
 * 在**真浏览器**里核三条：
 *   (a) 直接访问**公共 hash** 拿不到任何导演态 —— 公共 DOM 零工程/调试入口、零交互控件；
 *   (b) `#/director` **未确认**时不进入导演台 —— 只见确认门，不建场、无导演控件；
 *   (c) 确认后**可达**导演台 —— 出现席次导航 / 相机预设 / 滑块。
 *
 * ⚠️ 如实声明：这是**前端伪认证**（hash + localStorage），只挡误入、**挡不住有意绕过**
 *    （任何人改 localStorage 或直接调路由都能进）。真认证需后端/OIDC，本仓暂无。
 *
 * 运行：node scripts/verify-entry-isolation.mjs
 * 依赖：playwright（devDependency）+ 本机缓存 Chromium；自拉 vite dev server。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROMIUM_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion'
];

let checks = 0;
const ok = (c, m) => { assert.ok(c, `✗ ${m}`); checks++; };
const log = (m) => console.log(`   · ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 宿主侧轮询等待（**不用** page.waitForFunction）。
 *
 * 实测：无头 Chromium 的 rAF 在页面「稳定」后会停摆（本脚本 probe 证实 raf=false），
 * 于是 waitForFunction 的默认 raf 轮询会假死超时。这里改用宿主 setTimeout + evaluate 轮询，
 * 与被测页的帧循环解耦，稳定可靠。
 */
async function waitForCondition(page, condFn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate(condFn)) return;
    if (Date.now() > deadline) throw new Error(`等待超时：${label}`);
    await sleep(150);
  }
}

// 导演台**控件**专属标记（未确认/公共侧必须一个都不出现）。
const CONSOLE_MARKERS = [
  '启动乌兰巡礼', '暂停巡礼', '自由环绕', '俯视九宫', '泉眼无极', '外围16灯',
  '水道巡礼', '入阴', '玉玺', '物理自检', 'Rapier'
];
// 工程/内部字样（公共侧也不得出现；但**确认门本身**会写「导演/认证」，故只查公共侧）。
const ADMIN_WORDS = ['导演', '认证', '拓扑', '座次', '倍速', '调试'];
const SEAT_HUD_RE = /#\s*\d+\s*席/;      // 席次数表（ControlsBar 的「#N 席」）

async function reachable(url, timeoutMs = 1000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(BASE)) return null;
  const viteBin = resolve(ROOT, 'node_modules/.bin/vite');
  const proc = spawn(viteBin, ['--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await reachable(BASE)) return proc;
    await sleep(200);
  }
  proc.kill('SIGTERM');
  throw new Error(`vite dev server 未就绪（30s 超时）：${BASE}`);
}

/** 抓一份快照：正文文本、交互控件数、画布是否存在、外部泄漏的句柄。 */
async function snapshot(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const badClass = all
      .map((el) => el.className)
      .filter((c) => typeof c === 'string')
      .filter((c) => /hud|director|controls|panel/i.test(c));
    return {
      text: document.body.innerText || '',
      interactive: document.querySelectorAll('button,input,select,textarea').length,
      hasCanvas: !!document.querySelector('#root canvas'),
      leakedAltar: typeof window.__altar,
      leakedCapture: typeof window.__capture,
      badClass
    };
  });
}

async function main() {
  const server = await ensureServer();
  console.log(`\n[isolation] dev server ${server ? '已拉起' : '复用现存'}：${BASE}`);
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  let failed = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error(`[isolation][pageerror] ${e.message}`));

    // ── (a) 公共 hash：零工程入口、零导演态 ───────────────────────────────
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(`${BASE}/#/`, { waitUntil: 'load' });
    await waitForCondition(page, () => !!document.querySelector("#root canvas"), 20000, "公共画布");
    const pub = await snapshot(page);

    ok(pub.hasCanvas, '(a) 公共路由应渲染祭坛画布');
    ok(pub.interactive === 0, `(a) 公共侧必须零交互控件（实测 ${pub.interactive} 个）`);
    ok(pub.leakedAltar === 'undefined', '(a) 公共侧不得泄漏 window.__altar');
    ok(pub.leakedCapture === 'undefined', '(a) 公共侧不得泄漏 window.__capture');
    ok(pub.badClass.length === 0, `(a) 公共侧不得有 hud/director/controls/panel 类名（实测 ${pub.badClass.join(',') || '无'}）`);
    for (const mk of [...CONSOLE_MARKERS, ...ADMIN_WORDS]) {
      ok(!pub.text.includes(mk), `(a) 公共正文不得含工程标记「${mk}」`);
    }
    ok(!SEAT_HUD_RE.test(pub.text), '(a) 公共正文不得含席次数表（#N 席）');
    log(`(a) 公共 DOM：textLen=${pub.text.length} · 交互控件=0 · 无工程标记 ✓`);

    // ── (b) #/director 未确认：不进导演台 ─────────────────────────────────
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(`${BASE}/#/director`, { waitUntil: 'load' });
    await waitForCondition(page, () => (document.body.innerText || "").includes("进入"), 20000, "确认门");
    const gate = await snapshot(page);
    const gateButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()));
    ok(!gate.hasCanvas, '(b) 未确认时不得建场（应无画布）');
    ok(gateButtons.length === 1 && gateButtons[0].includes('进入'), `(b) 未确认时只见确认门（实测按钮 ${JSON.stringify(gateButtons)}）`);
    for (const mk of CONSOLE_MARKERS) {
      ok(!gate.text.includes(mk), `(b) 确认门不得含导演台控件标记「${mk}」`);
    }
    ok(!SEAT_HUD_RE.test(gate.text), '(b) 确认门不得含席次数表');
    log(`(b) 未确认：只出确认门（按钮「${gateButtons[0]}」）· 不建场 ✓`);

    // ── (c) 确认后：可达导演台 ────────────────────────────────────────────
    // 先落确认位，再**整页重载**（同 URL 的 goto 是 same-document 导航，不会重挂 React）。
    await page.evaluate(() => window.localStorage.setItem('altar.director.confirmed', '1'));
    await page.reload({ waitUntil: 'load' });
    await waitForCondition(page, () => !!document.querySelector("#root canvas"), 30000, "导演台画布");
    const dir = await snapshot(page);
    ok(dir.hasCanvas, '(c) 确认后导演台应建场（有画布）');
    ok(dir.interactive > 0, '(c) 确认后应出现导演控件');
    ok(SEAT_HUD_RE.test(dir.text), '(c) 确认后应出现席次导航「#N 席」');
    ok(dir.text.includes('启动乌兰巡礼') || dir.text.includes('暂停巡礼'), '(c) 确认后应出现巡礼控件');
    ok(dir.text.includes('自由环绕') || dir.text.includes('俯视九宫'), '(c) 确认后应出现相机预设');
    log(`(c) 确认后：画布 + ${dir.interactive} 个导演控件 + 席次/相机预设 ✓`);
  } catch (err) {
    failed = true;
    console.error(`[isolation] 失败：${err?.stack || err}`);
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }

  console.log(`\n[isolation] ⚠️ 前端伪认证（hash + localStorage）—— 挡误入，不挡有意绕过；真认证需后端/OIDC。`);
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log(`[isolation] ✅ 入口隔离断言全部通过：${checks} 项\n`);
}

main().catch((err) => {
  console.error(`[isolation] 失败：${err?.stack || err}`);
  process.exitCode = 1;
});
