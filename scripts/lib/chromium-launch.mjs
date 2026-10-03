/**
 * QA 浏览器夹具解析 · `ALTAR_CHROME_PATH`（luban 基建加固）
 *
 * 背景：playwright 的 `chromium-headless-shell` 测试夹具在 luban 下载不了——
 * 官方 CDN 超时；registry.npmmirror.com 的 playwright 二进制镜像里 linux-x64
 * 包止步于 chromium 1200（1228 起仅 arm64），而 playwright 1.63 需要 v1243，
 * `npx playwright install chromium-headless-shell` 必失败。本机已有组织受管的
 * Chrome for Testing 二进制，可作为**一次性测试夹具**使用：
 *
 *   ALTAR_CHROME_PATH=/home/ben/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome
 *
 * 口径：
 *   · 未设 `ALTAR_CHROME_PATH` → 返回值与 playwright 缺省行为完全一致
 *     （仍由 playwright registry 解析自带 chromium-headless-shell），零行为变化。
 *   · 设了 → 以 `executablePath` 启动受管 chrome。每次 `chromium.launch()` 仍是
 *     独立一次性进程，跑完 `browser.close()` 收尾——**绝不连** 127.0.0.1:9222 的
 *     CDP 常驻实例（chrome-cdp.service），也**不留常驻浏览器**。
 *   · luban 实测（uid 1000）无需 `--no-sandbox`；若别的环境需要，由调用方把参数
 *     追加进各自的 launch args，不在此隐式加（保持缺省沙箱）。
 *
 * 用法（调用方）：
 *   const browser = await chromium.launch(chromiumLaunchOptions(LAUNCH_ARGS));
 */
export function chromiumLaunchOptions(extraArgs = []) {
  const opts = { args: [...extraArgs] };
  const exe = process.env.ALTAR_CHROME_PATH;
  if (exe) opts.executablePath = exe;
  return opts;
}
