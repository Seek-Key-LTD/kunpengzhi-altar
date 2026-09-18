# Gitea #10 · 公共仪式幕次相机环绕 · 设计说明书

> **只设计，不改产品代码。** 本单产出 `docs/design/008-camera-choreography.md`；不触碰 `src/`、`scripts/`、`tools/`、`package.json`、`vite.config.ts`、`.gitea/`。
> 对应议题：`#10 公共仪式运镜：幕次相机环绕（当前仪式期间镜头静止）`。
> 用户裁定：**要做**五幕编排的电影感相机路径，不是缺陷关闭。

---

## 0. 基线与既有事实（本次真实回显）

> 取证方法学（沿用 `docs/design/007-webgl-degradation.md` §0 之训）：本机 macOS/BSD `grep` **不支持 BRE 的 `\|` 交替**（GNU 扩展），多选一必须 `grep -E 'A|B' f`，否则**静默假阴性**。本文所有 `file:line` / 计数均来自本次现场 `Read` / `grep -nE` / `sed -n` 回显。

### 0.1 ⚠️ 基线 HEAD 在本次工作期间被并发推进（如实声明）

主理人交办时给的 HEAD 是 `ccee22e`。本单工作期间队友持续入库，HEAD 两度前移。**本文所有 `file:line` 已在最后一个 HEAD 上逐条复核过**：

```
$ git rev-parse HEAD
2eb4b82ce1a9c1419016f3932e7bd067d245c90c            # @ 15:57:21

$ git log --oneline -3                               # @ 15:53:33 时为 3b24a1c
3b24a1c test(ui-tree): #7 公共 UI 树改为「判定为本」，删除名字白名单（按团队裁定重做）
ccee22e test(audio-gate): #7 静默层放行 components/ 白名单（并实测其零交互）
03c084f feat(webgl): #7 T2+T3 无画分支 + 静默层（文案主理人裁定，一字未改）

$ git status --porcelain                             # @ 15:53:33（队友并发编辑，非本人改动）
 M package.json
 M tools/capture/capture.mjs
?? artifacts/capture/degraded/
?? tools/capture/lib/
?? tools/capture/verify-webgl-degradation.mjs
```

`src/three/AltarScene.ts` 在 `ccee22e → 2eb4b82` 之间**未被改动**（行数恒为 2711，下述全部行号在三个 HEAD 上一致），故本文引用稳定。

> **关于 `npm test` 的一句话如实交代**：本人在 15:38–15:39 跑过两次 `npm test`，结果为 `pass 12 / fail 1` 与 `pass 11 / fail 2`。**这个红不能记到 HEAD 头上** —— 失败明细是
> `✗ 公共 UI 树 src/components/WebglFallback.tsx 无任何交互控件/回调 … 首处 "<button onClick={() => {}}>座次认领 PROBE</button>"`，
> 而该文件在 15:40 复查时**已被队友回滚**（`git diff src/components/WebglFallback.tsx` 为空）。那是队友的**负样本自检注入**与我的取样并发相撞。**本单不引用该次 `npm test` 结论作为基线。**

### 0.2 文件大小（本机回显）

```
$ wc -l src/three/AltarScene.ts src/types/altar.ts src/App.tsx src/audio/phaseEnvelope.ts src/data/altarGeometry.ts
   2711 src/three/AltarScene.ts
    273 src/types/altar.ts
     68 src/App.tsx
    119 src/audio/phaseEnvelope.ts
    169 src/data/altarGeometry.ts
```

### 0.3 关键缺口：**镜头静止**的可机械证据（本次回显）

**（1）相机写入点全景 —— 全文件只有 13 个写点，无一是 `ritualTime` 的函数。**

```
$ grep -nE 'camera\.(position|fov|zoom)|controls\.target|updateProjectionMatrix' src/three/AltarScene.ts
277:    this.camera.position.set(48, 40, 58);            ← 构造时的字面量，此后不再被时间改写
321:    this.controls.target.set(0, 6, 0);
1605:    this.camera.updateProjectionMatrix();           ← onWindowResize 内
2207:    cam.updateProjectionMatrix();                   ← setOrthoTopdown（取证正交相机，非主相机）
2238:    this.camera.position.set(x, y, 0);              ← updateRabbitHoleTour（游客 routine）
2239:    this.controls.target.set(Math.min(x + 2.1, endX), y, 0);
2262:    this.camera.position.add(delta);                ← updateFreeFlight（WASD/QE）
2263:    this.controls.target.add(delta);
2301:      this.camera.position.lerp(this.targetCameraPos, 0.05);     ← 仅当 isCameraTransitioning
2302:      this.controls.target.lerp(this.targetControlsTarget, 0.05);
2303:      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.1) {
2312:    const p = this.camera.position;
2317:      this.camera.position.copy(this.lastSafeCameraPos);          ← 安全边界拉回
2477:      controlsTarget: this.controls.target
```

**（2）唯一的时间驱动点（animate 第 0 段）只读不写相机。**

```
$ grep -nE 'private animate = |updateRitualTimeline\(dt\)|ritualElapsed = |this\.controls\.update\(\)|updateFreeFlight\(dt\)|new THREE\.Clock|if \(this\.renderer && !this\.contextLost\)' src/three/AltarScene.ts
153:  private ritualElapsed = 0;
230:  private clock = new THREE.Clock();        ← 全文件唯一 Clock
1886:    this.ritualElapsed = 0;                ← startRitual()
1930:    this.ritualElapsed = t;                ← seekTo()
1956:    this.ritualElapsed = Math.min(         ← updateRitualTimeline()  ⇒ 仅此 4 处写入
2275:  private animate = () => {
2282:    this.updateRitualTimeline(dt);         ← animate 第 0 段（唯一时间驱动）
2323:    this.controls.update();
2324:    this.updateFreeFlight(dt);
2436:    if (this.renderer && !this.contextLost) {   ← 只有 draw call 被降级门控，循环体照跑
```

**（3）代码自己写下了"应有连续环绕"的契约，但没有任何实现 —— 这是本单最硬的一条证据。**

```
$ sed -n '1734p;1737p' src/three/AltarScene.ts
    // 公共页唯一的镜头运动是 animate() 第 0 段的连续环绕（不受 ritualMode 影响）。
    this.controls.enabled = false;
```

`AltarScene.ts:1734` 的注释**断言**了「animate 第 0 段的连续环绕」存在；而 animate 第 0 段（`:2282`）只有 `updateRitualTimeline(dt)` 一句。
⇒ **本单不是"要不要加"的问题，是既有契约的口径落差。** 补上之后，这行注释重新成为真话。

**（4）另外两条与 §5 / §6.2 相关的现状事实：**

* `:1737` `setRitualState()` 里 **`this.controls.enabled = false;`** —— 走 `startRitual()` 的公共页，仪式期间鼠标 OrbitControls 已被关；但 `:2111` `applyRole()` 又会把 `controls.enabled` 写成 `caps.freeCamera`，而公共页是 `'authenticated'`（`App.tsx:45`）⇒ `freeCamera: true`。两者先后取决于调用顺序，详见 §5.2。
* `:2262` 的 `updateFreeFlight(dt)` 只由按键驱动；`App.tsx:43` 原文明写「进入即为已认证的观察席，**WASD/QE 立刻可用**」⇒ **键盘目前能改写公共页镜头**。这是 #5 的一处既存缝隙，也是确定性（约束 6）的直接威胁，处置见 §6.2 与 §11-3。

### 0.4 幕次与时间轴（`src/types/altar.ts`，本机回显）

```
$ grep -nE 'export const RITUAL_|export const WUJI_|export (type|function) (RitualPhase|ritualPhaseAt|isTimelineDrivenPhase|ritualLitSeatsAt|wujiRevealStateAt)' src/types/altar.ts
181:export const WUJI_ANCHOR_ID = 0;
201:export const WUJI_REVEAL_SEC = 24 * 60;
202:export const WUJI_SILENCE_SEC = 29 * 60 + 11;
211:export function wujiRevealStateAt(sec: number): WujiRevealState {
226:export const RITUAL_TOTAL_SEC = 30 * 60;
229:export const RITUAL_ABYSS_END_SEC = 3 * 60;
232:export const RITUAL_NAMING_END_SEC = 17 * 60;
235:export const RITUAL_LANTERNS_END_SEC = WUJI_REVEAL_SEC;
238:export type RitualPhase = 'abyss' | 'naming' | 'lanterns' | 'extinguishing' | 'silence';
244:export function ritualPhaseAt(sec: number): RitualPhase {
259:export function isTimelineDrivenPhase(phase: RitualPhase): boolean {
268:export function ritualLitSeatsAt(sec: number): number {
```

与交办口径**逐字一致**：`<180 abyss｜<1020 naming｜<1440 lanterns｜<1751 extinguishing｜其余 silence`，边界集合 `{180, 1020, 1440, 1751}`（`:244-250`），`silence` 恰 `1800 − 1751 = 49s`。`:255-260`「早三幕由推进器直写、末两幕交 `setRitualTime()` 结算」的互斥契约亦确认。

### 0.5 幕次时间窗的唯一真源已存在（`src/audio/phaseEnvelope.ts`，本机回显）

```
$ sed -n '5,6p;9p' src/audio/phaseEnvelope.ts
// · 包络**只由** #8 的单一时间轴 `ritualPhaseAt(sec)`（src/types/altar.ts）驱动，
//   **禁止复制第二套时间轴** —— 本模块不新造任何相位阈值，全部来自 types/altar 常量。
// · silence 幕 1751→1800 **恰 49s**，三层增益恒为 0（完全归零，不灰不响）。

$ sed -n '44,50p' src/audio/phaseEnvelope.ts
export const PHASE_WINDOWS: readonly PhaseWindow[] = [
  { phase: 'abyss',         start: 0,                       end: RITUAL_ABYSS_END_SEC },
  { phase: 'naming',        start: RITUAL_ABYSS_END_SEC,    end: RITUAL_NAMING_END_SEC },
  { phase: 'lanterns',      start: RITUAL_NAMING_END_SEC,   end: RITUAL_LANTERNS_END_SEC },
  { phase: 'extinguishing', start: RITUAL_LANTERNS_END_SEC, end: WUJI_SILENCE_SEC },
  { phase: 'silence',       start: WUJI_SILENCE_SEC,        end: RITUAL_TOTAL_SEC }
];
```

`PHASE_WINDOWS`（`:44-50`）**已经是五幕时间窗的唯一真源**（`:41-43` 原文明写「本表不含任何自造数字」），且 `:117` 有 `SILENCE_SPAN_SEC`。本单**直接复用它、一个数字都不抄** ⇒ §2 的「单一时间轴」不变量在相机侧自动成立。

### 0.6 相机初值与几何常量（本机回显）

```
$ grep -nE 'PerspectiveCamera\(45|position\.set\(48, 40, 58\)|target\.set\(0, 6, 0\)|drawless' src/three/AltarScene.ts | head
105:  private drawless = false;
267:    this.drawless = this.tier.tier === 'none';
276:    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
277:    this.camera.position.set(48, 40, 58);
321:    this.controls.target.set(0, 6, 0);
```

- `src/data/altarGeometry.ts:18` `PYRAMID_HALF = (LAYERS * CELL) / 2` = **10.5**（7×7 席面半宽）
- `src/data/altarGeometry.ts:19` `PYRAMID_TOP = LAYERS * BRICK` = **21**（七层方锥总高 = 席面高程）
- `src/data/altarGeometry.ts:21` `PLINTH_HALF = 15`（台基半宽）
- `AltarScene.ts:1366` `absorber.position.set(0, PYRAMID_TOP + 0.14, 0);` ⇒ **#00 世界坐标 = (0, 21.14, 0)**
- `AltarScene.ts:236` 走马灯环半径 `23.5`；`:2154` `setCameraMode('topdown')` 的 `targetCameraPos.set(0, 78, 0.1)` —— **这就是「正穿 #00 轴线」的机位形态，本单明令排除**（§6.3）
- `CAMERA_SAFETY_BY_ROLE`（`types/altar.ts:140-144`）：`guest {minY 0.3, maxRadius 120}` / `authenticated {0.3, 160}` / `director {0.05, 400}`
- `CAMERA_DISTANCE_BY_ROLE`（`:147-151`）：`guest {0.8, 220}` / `authenticated {0.5, 260}` / `director {0.25, 400}`

### 0.7 已有的「esbuild 打真模块 → Node 断言」手法（本机回显）

```
$ sed -n '31,39p' scripts/verify-ritual-timeline.mjs
  execFileSync(esbuildBin, [
    resolve(ROOT, 'src/types/altar.ts'),
    '--bundle', '--platform=node', '--format=esm', '--log-level=warning',
    `--outfile=${resolve(tmp, 'altar.mjs')}`
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  T = await import(pathToFileURL(resolve(tmp, 'altar.mjs')).href);
```

`scripts/verify-ritual-timeline.mjs:31-39`（进 `npm test`）与 `scripts/assert-webgl-capability.mjs:29-43`（独立命令）都有这套现成手法。**本单的浏览器无关断言照抄它。**

### 0.8 Keyframe 原型已真跑过

§3 的 Keyframe 表**不是拍脑袋写的**：我先在 `/tmp/ceremony-proto.mjs`（**仓外，不入库**）把整条路径实现并跑了全区间扫描，输出见 §3.5 与附录 B。约束全通过，逐秒位移有实测上界。

---

## 1. 六条硬约束 → 处置 → 断言（总索引）

| # | 硬约束 | 处置 | 章节 | 判红断言 |
|---|---|---|---|---|
| 1 | 不得新建第二套时钟；时间源只读 | 相机姿态 = `ceremonyPoseAt(ritualElapsed)` **纯函数**；幕窗复用 `PHASE_WINDOWS`；全仓 `ritualElapsed` 写入点**保持 4 处不变** | §2 / §5.1 | A-13、A-14、B-2、B-3 |
| 2 | 导演/工程入口隔离，`camera` 是禁词 | **零 DOM 面**：纯数学模块 + 一个私有方法，不产 Node/文本/属性/window 键/class；并采用去毒命名 | §6.1 / §6.2 | A-15、A-16、C-7 |
| 3 | #00 无极点 | 全程径向距离 ≥ 46 ⇒ 距 #00 ≥ 54.9，**永不落在中心轴**；明禁 `topdown` 形态机位 | §6.3 | A-9、A-10 |
| 4 | 与 #7 WebGL 降级相容 | `none` 档下 `camera`/`controls` **均已无条件构造**，写它们安全；三档同一条路径 | §6.4 | C-2 |
| 5 | silence 幕（恰 49s）须收敛 | **姿态在 [1751, 1800] 全区间恒定**（"收完之后静止"，与音频三层恒 0 同口径） | §6.5 | A-5、C-6 |
| 6 | 确定性 + 帧率无关 | 纯函数、无 `Math.random`/`Date.now`、无帧累积；架构上**每帧整写**而非 lerp 逼近 | §4 / §7 | A-1…A-4、C-3、C-4 |

---

## 2. 时间源只读（约束 1）

**契约（将写进代码注释）：**

> 相机路径**不得持有时间**。它只有一个入参 `sec`，由调用方传入 `this.ritualElapsed`。
> 全仓对 `ritualElapsed` 的写入点**恒为 4 处**（`:153` 初值 / `:1886` `startRitual()` / `:1930` `seekTo()` / `:1956` `updateRitualTimeline()`），本单**一处不加、一处不删**。
> 幕次时间窗**不抄数字**，一律引用 `src/audio/phaseEnvelope.ts:44` 的 `PHASE_WINDOWS`（它自己也只引用 `types/altar` 常量）。

三条理由：

1. `#4` 单一包络不变量（`phaseEnvelope.ts:5-6`）禁止第二套时间轴与自建阈值。相机用同一个 `PHASE_WINDOWS` ⇒ 未来改任何幕边界，音频与画面同步生效，**不可能单边漂移**。
2. `dt` 只在 `updateRitualTimeline(:1956)` 里累加一次。而 `lerp(pos, target, 0.05)` 这类**逐帧逼近**（`AltarScene.ts:2301`）是帧率相关的 —— 30fps 与 144fps 在同一 `sec` 会得到不同位姿。**本单不用它承载仪式运镜**（见 §5.2）。
3. 采样源是 `ritualElapsed` 而非 `Date.now()` / `clock.getElapsedTime()` ⇒ 倍速回放（`:1902`）下画面与音频由**同一个 `sec`** 驱动，不会出现"音频快了画面慢了"。

---

## 3. 五幕取景策略

### 3.1 参数化：绕竖轴的柱坐标

```ts
position = ( r·sinθ , y , r·cosθ )   // r = 径向距离, θ = 方位角
target   = ( 0 , ty , 0 )            // 视线目标恒在中心轴上，只有高度在变
fov      = f                         // 竖直视场角（度）
```

**为什么这样参数化：**

* **初始机位天然落在这一族里**：`AltarScene.ts:277` 的 `(48, 40, 58)` 恰好是 `r = hypot(48,58) = 75.2867`、`θ₀ = atan2(48,58) = 0.690755 rad`、`y = 40`；`:321` 的 `(0,6,0)` 是 `ty = 6`；`:276` 的 `fov = 45`。
  ⇒ **取 `t=0` 的 Keyframe 就等于构造值本身**，仪式第 0 秒与入场画面**零接缝**，不需要"摆渡"过渡。
* **`r` 直接承载无极点判据**：`r ≥ 16` ⟹ `distance(cameraPos, #00) ≥ 16 > 12`（§6.3），三维判据退化成一维，**可机械证明**。
* **θ 是唯一的"环绕"通道**，把它单独拎出来，可以让"幕起伏"与"绕行速率"解耦。

### 3.2 Keyframe 表（默认值）

| 幕 | sec 区间 | Δθ（累积绕行） | r：起→止 | y：起→止 | ty：起→止 | fov：起→止 | 语义 |
|---|---|---|---|---|---|---|---|
| **abyss** | 0 → 180 | +18° | 75.287 → 72 | 40 → 46 | 6 → 12 | 45 → 43 | 深渊黑场：几乎看不见的运动，**起势** —— 从中景机位缓缓抬升、微收紧，为显形蓄势 |
| **naming** | 180 → 1020 | **+330°**（近一整圈） | 72 → 46 | 46 → 62 | 12 → 21 | 43 → 40 | 命名幕：49 席逐一点亮。**抬升 + 推近 + 视线靶心升到席面 y=21** ⇒ 由斜俯逐步压成**俯览 7×7 席面**（半宽 10.5，`altarGeometry.ts:18`），逐席点亮看得清；绕行近一整圈对应 49 席沿乌兰螺线由内向外的展开 |
| **lanterns** | 1020 → 1440 | +150° | 46 → 54 | 62 → 32 | 21 → 9 | 40 → 46 | 走马灯幕：16 灯是主角。**下降 + 视线靶心降到台基面上方** ⇒ 从席面俯览摇到**外环 16 灯（半径 23.5，见 `AltarScene.ts:236`）的掠视角**；fov 放宽把整圈灯环收进画 |
| **extinguishing** | 1440 → 1751 | +72° | 54 → 66 | 32 → 26 | 9 → 17 | 46 → 44 | 敛光幕：**外撤 + 视线靶心回升** ⇒ #00 显形（1440s）后缓缓退成"远观"，席位层层熄灭；全坛渐暗时 #00 的冷顶光（`:1747` `wujiLight.intensity = 2.4`）由画外进入画面心部 |
| **silence** | 1751 → 1800 | **0°** | 66 → 66 | 26 → 26 | 17 → 17 | 44 → 44 | 终寂：**姿态恒定**（§6.5） |

累积总绕行 = 18 + 330 + 150 + 72 = **570°**（约 1.58 圈），单向、不停顿、不折返。

**附在每个数字上的道理（便于他人校准时不碰坏合约）：**

* `r` 全程 ≥ 46 ≫ 16 —— 无极点余量充足
* `y` 全程 ∈ [26, 62]，最低 26 > 席面 21 ⇒ **相机永不低于席面**，不会拍出"从下往上看祭坛"的下位视角
* `ty` 全程 ∈ [6, 21]，永远低于相机 ⇒ **视线恒向下**，不会出现仰拍天空的空画面
* `fov` 全程 ∈ [40, 46]，守住 [30, 60] 的构图带（见 §3.4 C6）

### 3.3 幕内缓动（约束 6 的一部分）

```ts
const raw = (sec - win.start) / (win.end - win.start);  // 与 phaseProgress() 同口径
const u   = smootherstep(raw, 0, 1);                    // 6x^5-15x^4+10x^3
```

**为什么用 smootherstep 而不是线性：**

1. **`u'(0) = u'(1) = 0` ⇒ 幕边界处角速度与线速度归零**。配合"上一幕止值 = 下一幕起值"（表中相邻行严格接续），**每个换幕点在速度上也是连续的** —— 兑现 `:1733` 的契约「进坛后不再有任何机位硬切」。
2. 长幕（naming 840s）中段稍快、两端"吐纳"，比匀速更接近呼吸，也避免"机器转盘感"。
3. 它是五次多项式，一阶二阶导都连续 ⇒ 不会因为 `controls.update()` 的数值往返产生可见抖动。
4. `THREE.MathUtils.smootherstep` 已存在，团队也在用（`:2235`）。

⚠️ **与音频"不同步"是刻意的、且安全**：音频包络幕内是**线性**插值（`phaseEnvelope.ts:59` `phaseProgress` + `:80` 线性 `lerp`），画面是 smootherstep。**两者同源不同形**：都由同一个 `PHASE_WINDOWS` 与同一个线性 `raw` 驱动。`#4` 不变量约束的是"不得有第二套时间轴与阈值"，不是"必须锁相"。⇒ 幕的定义口径一致，幕内的运动曲线各自独立。

### 3.4 不变量约束集 C1–C7（相机侧唯一真源，与具体数字解耦）

> **这一组是合约，Keyframe 数字是默认值。** 校准 Keyframe（§11-2）**不必**削弱任何一条；反之，任何一条被打破即判红。

| # | 约束 | 阈值 | 防什么 |
|---|---|---|---|
| **C1** | `|position| ≤ 110` | 严格小于 `guest` 的 `maxRadius = 120`（`altar.ts:141`）⇒ **任何角色**都不触发安全边界第 3 条 | 出界、被 `:2317` 拉回而破坏纯函数性 |
| **C2** | `position.y ≥ 6` | 远大于 `guest/auth` 的 `minY = 0.3` | 钻到坛体下方、穿台基 |
| **C3** | `径向距离 r ≥ 16` | 见 §6.3 | #00 极点语义 |
| **C4** | `ty < y`（视线恒向下） | — | 仰拍空天、露出画作边界 |
| **C5** | `distance(position, target) ∈ [8, 200]` | 落在 `guest` 的 OrbitControls `[0.8, 220]`（`altar.ts:148`）**之内** | 被 `controls.update()` 的 min/maxDistance 悄悄改写位姿（破坏"写什么出什么"） |
| **C6** | `fov ∈ [30, 60]` | 低于 30 出长焦畸变，高于 60 出广角畸变 | 构图失真、边缘拉伸破坏"7×7 无缝平面"的观感 |
| **C7** | 逐秒位姿步长 `Δposition ≤ 1.2`、`Δfov ≤ 0.05` | 原型实测上界 `0.7768 / 0.02679`（附录 B） | 硬切 / 抽搐；也是 `:1733` 契约的可执行形态 |

### 3.5 关键秒实测表（`/tmp/ceremony-proto.mjs` 真跑输出，非手算）

> 该原型**不在仓内**、不入库；实现落地后由 §8.1 的 `scripts/verify-ceremony-view.mjs` 对**真模块**重跑同一组断言，届时本表作废。

```
约束违规: 0（全通过）
逐秒最大位移 = 0.7768 世界单位/s ；逐秒最大 fov 变化 = 0.02679°/s
silence 幕 49s 姿态恒定: 是
同一 sec 重复求值逐位恒定: 是
乱序采样结果 == 顺序采样结果: 是
pose(0) = pos[48.000000,40.000000,58.000000] target[0.000000,6.000000,0.000000] fov=45.000000
Δ vs 构造值 = 7.11e-15
聚合: { minRadial: 46, minWuji: 54.975, minDist: 58.687, maxDist: 82.608,
        minY: 26, maxY: 62, maxP: 85.44, minFov: 40, maxFov: 46 }

| sec | 幕 | position(x, y, z) | target(y) | fov | |p| | r | 距#00 |
| 0 | abyss | 48.00, 40.00, 58.00 | 6.00 | 45.00 | 85.3 | 75.3 | 77.6 |
| 60 | abyss | 51.24, 41.26, 54.21 | 7.26 | 44.58 | 85.2 | 74.6 | 77.3 |
| 179 | abyss | 60.80, 46.00, 38.57 | 12.00 | 43.00 | 85.4 | 72.0 | 76.2 |
| 180 | naming | 60.80, 46.00, 38.57 | 12.00 | 43.00 | 85.4 | 72.0 | 76.2 |
| 400 | naming | 68.59, 47.86, -7.26 | 13.05 | 42.65 | 84.0 | 69.0 | 74.0 |
| 600 | naming | -39.94, 54.00, -43.42 | 16.50 | 41.50 | 80.0 | 59.0 | 67.5 |
| 1019 | naming | 21.32, 62.00, 40.76 | 21.00 | 40.00 | 77.2 | 46.0 | 61.5 |
| 1020 | lanterns | 21.32, 62.00, 40.76 | 21.00 | 40.00 | 77.2 | 46.0 | 61.5 |
| 1230 | lanterns | 48.79, 47.00, -10.92 | 15.00 | 43.00 | 68.6 | 50.0 | 56.3 |
| 1439 | lanterns | 2.25, 32.00, -53.95 | 9.00 | 46.00 | 62.8 | 54.0 | 55.1 |
| 1440 | extinguishing | 2.25, 32.00, -53.95 | 9.00 | 46.00 | 62.8 | 54.0 | 55.1 |
| 1600 | extinguishing | -35.09, 28.84, -49.07 | 13.22 | 44.95 | 66.9 | 60.3 | 60.8 |
| 1750 | extinguishing | -61.86, 26.00, -22.99 | 17.00 | 44.00 | 70.9 | 66.0 | 66.2 |
| 1751 | silence | -61.86, 26.00, -22.99 | 17.00 | 44.00 | 70.9 | 66.0 | 66.2 |
| 1775 | silence | -61.86, 26.00, -22.99 | 17.00 | 44.00 | 70.9 | 66.0 | 66.2 |
| 1800 | silence | -61.86, 26.00, -22.99 | 17.00 | 44.00 | 70.9 | 66.0 | 66.2 |
```

**这张表可以直接对外讲的三条事实：**

* `179/180`、`1019/1020`、`1439/1440`、`1750/1751` 四对相邻秒位姿**逐位相同** ⇒ 换幕点零跳跃（`smootherstep` 端点导数为 0 的直接结果）。
* `1751 / 1775 / 1800` 三行逐位相同 ⇒ **silence 全 49s 静止**（§6.5）。
* `pose(0)` 与构造值之差 `7.11e-15`（浮点级）⇒ **入场画面与仪式第 0 秒同构图**，不会有"仪式一开始镜头跳一下"。

---

## 4. 缓动与采样方式（为什么必然纯、必然帧率无关）

### 4.1 模块接口

```ts
// src/three/ceremonyView.ts —— 纯域模块，零三方依赖
export interface CeremonyPose {
  /** 相机世界坐标 [x, y, z] */
  position: readonly [number, number, number];
  /** 视线目标世界坐标 [x, y, z]（恒为 [0, ty, 0]） */
  target: readonly [number, number, number];
  /** 竖直视场角（度） */
  fov: number;
}

/** 除入参外无任何依赖；唯一的入参就是仪式秒。 */
export function ceremonyPoseAt(sec: number): CeremonyPose;

/** Keyframe 0 = 构造器初值（§3.1）。导出以便反向对齐、防撞。 */
export const CEREMONY_HOME: CeremonyPose;
```

### 4.2 三条不可协商的实现纪律

| 纪律 | 说明 | 违规后果 |
|---|---|---|
| **D1 · 无随机、无墙钟** | 模块内不得出现 `Math.random` / `Date.now` / `performance.now` / `clock` / `requestAnimationFrame` | 破坏确定性；录屏不可复现 |
| **D2 · 无累积状态** | 模块只有常量与纯函数，无模块级可变状态、无闭包缓存 | 二次调用结果漂移 ⇒ 抽样取证失效 |
| **D3 · 无三方 / 无 DOM** | 只 `import` 自 `src/types/altar.ts` 与 `src/audio/phaseEnvelope.ts`（两者均**不**依赖 three / Tone / DOM） | esbuild 打不进 Node ⇒ 断言只能走浏览器，门禁降级 |

> D3 的可行性已核：`phaseEnvelope.ts:11-18` 的 import 块**只有** `'../types/altar'`。

### 4.3 每帧**整写**，不是逐步逼近（帧率无关的关键）

```
每帧：pose = ceremonyPoseAt(this.ritualElapsed);   // 读
      camera.position.set(...pose.position);       // 写
      controls.target.set(...pose.target);         // 写
      if (|camera.fov - pose.fov| > 1e-4) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
```

**为什么不能用既有的 `lerp(0.05)` 通道（`:2301`）**：`lerp` 的收敛速率**按帧计**，`α = 0.05` 时 60fps 与 30fps 在同一 `sec` 的残余误差差一个量级以上 ⇒ 同一秒不同机器构图不同 ⇒ 录屏不可作为发布证据。整写姿态则**同一个 `sec` ⟹ 逐位相同的 `position / target / fov`**（原型已验证逐位相同）。

**关于 `camera.aspect` 的如实交代**：`aspect` 来自视口（`:275`），**位姿与它无关，但最终成像与它有关**。故本单的确定性断言断言的是 **pose 逐位相同**，不是像素逐位相同 —— 像素级比对必须在**同一视口**下进行（取证工具固定 1280×800，与 `capture.mjs` 现状一致）。这一条须写进 §7，不得含糊。

---

## 5. 与既有机构的共处（不打架的四个接口）

### 5.1 调用点：animate 内**一处**，且必须在四个"会改写相机"的老玩家之后

现有顺序（`:2275` 起）：

```
2275 animate = () => {
2282   updateRitualTimeline(dt)        ← 唯一时间驱动；推进 ritualElapsed
2285   syncFogCaption()
2288   游客 routine
2300   if (isCameraTransitioning) { lerp 逼近 targetCameraPos }   ← 旧机制 A
2312   安全边界校验 / lastSafeCameraPos 兜底                       ← 旧机制 B
2323   this.controls.update();                                     ← 旧机制 C
2324   this.updateFreeFlight(dt);                                  ← 旧机制 D
       …
2436   render
```

**插入点 = `:2324` 之后、`:2326`（原 "2. 外环 16 茶灯…"）之前。** 理由逐条：

| 旧机制 | 若不放在它之后 | 处置 |
|---|---|---|
| A `lerp` 逼近（`:2300`） | 它的目标都是 **pointerdown 触发的**机位切换（`focusTeaLantern` / `focusInteriorPoem` / `setActiveSeat`）。写在前 ⇒ 我们覆盖它的结果，但 `isCameraTransitioning` 仍为真，每帧白算一次 | 整写时顺手置 `false`（一次性赋值）；并由 T3 从源头掐断抢占（§6.2） |
| B 安全边界（`:2312`） | 它是**依赖上一帧历史**的机制（失败即 `copy(lastSafeCameraPos)`）。一旦被触发，纯函数性立刻破堤 | C1/C2/C5 已按**最严格的角色**（`guest`）留出余量 ⇒ **永不触发**；它由此保持为一道纯保险杠 |
| C `controls.update()`（`:2323`） | OrbitControls 在 `update()` 里会用 `[minDistance, maxDistance]` 夹相机到靶心的距离，并对四元数做数值往返 ⇒ 写在前会被**悄悄改写** | 写在其**后** ⇒ 绘制时相机就是 pose 本身；C5 的 `[8, 200]` 保证即便下一帧被夹也不改值 |
| D `updateFreeFlight(dt)`（`:2324`） | 公共页 `App.tsx:45` 是 `'authenticated'`、`freeCamera: true` ⇒ **按 WASD 能改画面** | 写在其**后**（画面即时纠正）+ T3 从源头屏蔽（§6.2） |

> **两个必须显式 return 的例外（不得接管）**：
> ① `this.orthoTopdownCamera !== null`（`:2192` 启用的俯视正交取证相机在场）⇒ 交回取证控制权；
> ② `!this.ritualRunning`（`:160`）⇒ **只有走 `startRitual()` 的路径被接管**。
> 这正是 §6.1 隔离的本体保障：`presentImmediately()`（`:1791`）保持 `ritualRunning = false` ⇒ 导演 / 直入路径的镜头权限一丝不动。

### 5.2 与 OrbitControls 的 `enabled` 打架 → 顺手变成背景事实

现状：`setRitualState():1737` 写 `controls.enabled = false`；`applyRole():2111` 写 `controls.enabled = caps.freeCamera`。二者取决于调用次序，公共页（`App.tsx:45 setRole → :48 startRitual`）当前最终停在 `false`。

**本单不修这个**（不在范围内）。而且**对本单没有正确性影响**：`controls.enabled` 只控制鼠标输入，取景器不读它；而键盘通路已被 §6.2 一并掐断。

### 5.3 与 `seekTo()`（`:1928`）的共处

`seekTo(t)` 直接写 `ritualElapsed = t`，下一帧 `applyCeremonyView(this.ritualElapsed)` 收编 ⇒ **无头取证按秒取样天然可用**。且 `tools/capture/main.ts:54` 已调 `startRitual()` ⇒ `ritualRunning = true` ⇒ 取证路径自动带上五幕运镜。**不需要为取证新增任何开关。**

---

## 6. 六条硬约束的逐条处置

### 6.1 导演/工程入口隔离（约束 2）· **正面答复：`camera` 只能是 DOM 面禁词**

**（a）先把扫描器的三个面定位清楚**（`scripts/qa-audit-public-entry.mjs:97-147` `pageScanner` 精读）：

| 面 | 扫描对象 | 是否含 `camera` |
|---|---|---|
| ① **文本面** | `el.childNodes` 里 `nodeType === 3` 的文本节点（`:115-122`） | ✅ 禁 |
| ② **属性面** | `Array.from(el.attributes)` 的**每一个值**（`:110-113`）—— 含所有 `data-*`、`class`、`id` | ✅ 禁 |
| ③ **window 面** | `Object.keys(window)`（`:124`） | ✅ 禁 |
| ④ **bundle 面** | 公共页**实际下发**的 JS 文本，但词表是 `BUNDLE_MARKERS`（`:64-71`） | ❌ **不含 `camera`** |

**（b）结构性证明：④ 面永远不可能把 `camera` 立为禁词**（本机回显）：

```
$ （dist/index.html 静态引用的 chunk 中 'camera' 字面量计数）
assets/index-DB1xwmXC.js : camera×110

$ 依赖侧（结构性，不随构建变化）
three.module.js camera×311
OrbitControls.js camera×18
src/three/AltarScene.ts camera×27
```

`App.tsx:2` 静态 `import { AltarScene }`，`AltarScene.ts:2` 静态 `import { OrbitControls }` ⇒ **three 的相机实现与 OrbitControls 必然打进公共 entry**。公共 chunk 里出现 `camera` 是**结构性必然**（现状 110 处）。
⇒ **`camera` 这个禁词在物理上只对 ①②③（DOM）面有意义**；任何"改 bundle 文本规避"的设想都会立刻撞上 three 自身。

**（c）本单的处置（三层，逐步加固）：**

* **R1 · 零 DOM 面（本体）**：新增模块**不创建 HTML 元素、不写文本、不设任何属性、不挂 `window` 键、不新增 CSS class**。它就是一个纯函数模块 + `AltarScene` 内的一个 `private` 方法，**落在 ①②③ 三个面的视野之外**。
  ⇒ **运镜不引入任何扫描器可见的 token**，故**既不必改 `SCAN_WORDS`，也不削弱任何既有门禁**。
* **R2 · 去毒命名（纵深防御）**：文件 `src/three/ceremonyView.ts`、导出 `ceremonyPoseAt()` / `CeremonyPose`、字段 `position / target / fov`、私有方法 `applyCeremonyView()`、常量 `CEREMONY_HOME` —— **全链路不含 `camera`**。
  理由不是"现在需要"（见 (b)，现在不需要），而是：**一旦将来团队把 `camera` 并入面向源码树的 import-graph 断言**（团队已有 `scripts/verify-honor-isolation.mjs` 这一手法），本单**不需要改名就能过关**。
* **R3 · 零导入牵连**：新模块**只被 `AltarScene.ts` import**，不得出现在 `DirectorApp` / 组件树的导入图里 ⇒ 不拖入、也不泄漏任何工程侧代码。

**（d）"公共路径不得出现相机控件或操控入口"**：**本单不新增任何控件**；相反，§6.2 要**消掉一个既存的、此前未被察觉的**公共入口键盘操控面（`updateFreeFlight`）。⇒ 隔离是**变严**，不是变松。

### 6.2 镜头争夺消解（一并修 #5 既存缝隙）

| 来源 | 现状 | 处置（T3） | 依据 |
|---|---|---|---|
| 键盘 WASD/QE | 公共页 `App.tsx:45` 为 `'authenticated'`；`App.tsx:43` 原文「进入即为已认证的观察席，**WASD/QE 立刻可用**」；`onKeyDown:1691` 只判 `caps.freeCamera` | `ritualRunning` 为真 ⇒ **`onKeyDown` 直接 return**，并执行 `pressedKeys.clear()` | 与 `setRitualState():1737` 已关 `controls.enabled` 的意图一致；也与确定性（约束 6）一致 |
| `focusTeaLantern` / `focusInteriorPoem` / `setActiveSeat` 引发的机位跃迁 | `:2026` / `:2047` / `:1704` 三条都在往 `targetCameraPos` 上写字 | 公共页三个回调在 `App.tsx:24` **均传 `undefined`** ⇒ 点选本就没有任何 UI 后果，只剩一次无谓的相机目标写入 ⇒ 连同上一行一并屏蔽（保留 `onXxxSelect` 回调本体，只掐掉聚焦跃迁） | `App.tsx:24`：`new AltarScene(container, INITIAL_SPIRAL_EVENTS, undefined, undefined, undefined, { tier: t })` |
| 游客 routine（`activateGuestRoutine`） | 只 `role === 'guest'` 触发（`:1611`），公共页是 `'authenticated'`；且 `setRitualState():1735-1736` 已把倒计时归零 | 不动 | `:1733` 原文「进坛后不再有任何机位硬切」 |

> ⚠️ **这是我请主理人留意的一条事实修正**：交办描述里没提 —— **公共页今天并非"完全没有操控"**，键盘 WASD/QE 目前是可以改写公共页镜头的（上面 `App.tsx:43` 原文为证）。它既是 #5 隔离的一处缝隙，也是约束 6（确定性）的直接威胁。本单把它作为 T3 的一部分关掉。**若主理人主张公共页保留键盘操作，请明示** —— 那样 §7 的确定性断言必须降级为"仅对无键盘输入的录屏成立"，我会改口径，不假装没事。

### 6.3 #00 无极点（约束 3）

**判据（两条，均可机械证明）：**

1. **轴线排除**：全程径向距离 `r ≥ 16`（实测最小 `46`）⇒ **相机永不落在 `x=0, z=0` 的中心轴上**。
   ⇒ 结构性排除 `:2154` 那类 `(0, 78, 0.1)` 的"正上方驻留"形态。**这不是数字上的巧合，而是表示法上的强制**：本单的姿态**只在 `r ≥ 16` 的坐标域里有定义**，写不出一个轴上的 pose。
2. **体积排除**：`distance(position, (0, PYRAMID_TOP + 0.14, 0)) ≥ 12`（实测最小 `54.975`，余量 4.6 倍）。
   #00 世界坐标取自 `AltarScene.ts:1366`（不抄数：模块里由 `PYRAMID_TOP`（`altarGeometry.ts:19`）现算）。

**朝向口径怎么说才不出"极点"语义：**

* 视线目标**恒为 `(0, ty, 0)`，且 `ty < y`**（§3.4 C4）⇒ 相机**恒在席面之上向下看**。`ty` 最高只到 `21`（= `PYRAMID_TOP`，席面本身），**从不瞄准 #00 所在的 `21.14`**。
* **我们从不"锁定 #00"** —— 没有任何一个 Keyframe 把靶心设在 #00 上方。`extinguishing` 幕之所以看得见 #00，是因为随着 `ty` 由 9 回升到 17、相机由 32 降到 26，**#00 自然进入画面中部**（同时其余灯火熄灭），而不是镜头去追它。这恰恰符合 #3 的立意：#00 是**自己显形**的，不是被观看者占有的。
* **本单不改任何一个光源的强度曲线** —— 那一摊由 `setRitualState():1747` 掌管，本单不碰。

**小结**：「无极点」在本单里 = 相机既不进入 #00 的体积（实测 ≥ 54.9，阈值 12），也不占据它正上方的轴线（实测 `r ≥ 46`，阈值 16），并且从不把它当镜头目标。三条各自独立成立，任一条破了还有另外两条顶着。

### 6.4 与 #7 WebGL 降级相容（约束 4）

| tier | 本单行为 | 依据（本机核过） |
|---|---|---|
| `full` | 正常：每帧写 `camera.position` / `controls.target` / `camera.fov` | — |
| `degraded` | **与 `full` 完全同路径**（该档只降 `pixelRatio` 与阴影，相机层无任何差异） | `AltarScene.ts:297-300` |
| `none`（`drawless`） | **同路径、必须空转成功、不得抛错** | 关键：`:276-277` 的 camera 构造与 `:313` 的 `controls` 构造都在 `if (!this.drawless)`（起始于 `:283`）**之外** ⇒ **`none` 档下 `this.camera` 与 `this.controls` 均已存在**；写它们是安全的（`controls` 挂的是一张游离 canvas，`:309-311` 原文为证） |

补充两条：

* `animate` 循环体在 `drawless` 下**照跑**（只有 draw call 被 `:2436` 门控；`AltarScene.ts:2434-2435` 原文「上面的时间轴推进、字幕刷新、音频包络**一字未动**」）⇒ **不需要也不能早退** —— 早退反而会让这条代码路径变成"只有在出错时才跑到"的盲区。
* **唯一的防御性细节**：`:275` 的 `aspect = container.clientWidth / container.clientHeight` 在极端布局下可能是 `0` 或 `NaN`。故 `fov` 写入前加守卫：`Number.isFinite(camera.aspect) && camera.aspect > 0` ⇒ 否则跳过 `updateProjectionMatrix()`。**位姿（position / target）照写不误**，因为它与 aspect 无关。

⇒ **`none` 档下 `applyCeremonyView` 是一条"看不见结果但永不失败"的空转**，且每次演出都真实跑到。由 C-2（禁 WebGL 启动、0 pageerror）判红。

### 6.5 silence 幕（1751 → 1800，恰 49s）的运镜口径（约束 5）

**决策：姿态在 [1751, 1800] 全区间恒定（"收完之后静止"）。**

理由四条（按重要性）：

1. **口径同源（最硬的一条）**：`phaseEnvelope.ts:9` 原文「silence 幕 1751→1800 **恰 49s**，三层增益恒为 0（完全归零，不灰不响）」。音频在这 49s 里是**恒值**。要视听合一，画面在这 49s 也应是恒值；否则就是"听得见寂静、看得见运动"的自相矛盾。
2. **可断言**：`pose(1751) ≡ pose(s)`，`∀ s ∈ [1751, 1800]`，**逐位相等、不需要任何容差** ⇒ 这是全表最好判的一条。
3. **终局安全**：最后 49s 是发布录屏的收束段，任何残余运动都会叠加到依赖历史的安全边界机制（§5.1 机制 B）上；静止 ⇒ 这段**永远踩不到它**。
4. **语义**：#00 是吸光体。全坛灭尽后镜头还在滑行，等于摄影机继续"巡礼"一个已经散场的坛（占有语义），与"散场留白"相反。

**"推远"发生在 extinguishing（1440→1751）内部完成**：该幕 `r: 54→66`、`y: 32→26`、`ty: 9→17` 就是一段**缓缓后撤 + 视线抬平**，到 `1751` 正好停稳在"远观斜侧（r=66, y=26, ty=17, fov=44）"这一帧上。⇒ 观众感知是"镜头退开了、停下了"，不是"镜头卡住了"。

**另外两个候选口径（写在 §11-1 供裁定）**：A = 继续极缓漂移（每秒 ≲ 0.05 单位）；B = silence 内再推远一步。**默认推荐选定的静止口径。**

---

## 7. 确定性验收（约束 6）

### 7.1 定义（先把话说明白）

> **在同一视口下，`ceremonyPoseAt(sec)` 是 `sec` 的纯函数：同一 `sec` ⇒ 逐位相同的 `position / target / fov`。**
> 它**不含**随机、不含墙钟、不含帧率累积、不含历史状态。
> **成像**（像素）还额外依赖 `camera.aspect` —— 所以像素级比对必须锁视口（1280×800）；这条约束写进取证工具，而不是写进合约。

### 7.2 验收断言思路（六条）

| 编号 | 断言 | 为什么这一条能证"确定" | 面 |
|---|---|---|---|
| A-1 | 1801 个整秒点，同一 `sec` 求两次 → `JSON.stringify` 逐位相同 | 排除隐藏状态 / 惰性缓存 | Node |
| A-2 | **乱序采样**（洗牌 0…1800）与顺序采样逐点相同 | 排除"依赖上次调用"的累积 | Node |
| A-3 | 源码负向扫描：模块内 `Math.random / Date.now / performance.now / requestAnimationFrame / THREE` **零命中** | 排除随机与墙钟；同时锁死"不依赖 three" | Node |
| A-4 | 源码负向扫描：模块内 `document. / window. / localStorage / navigator / screen.` **零命中** | 排除环境依赖（视口 / UA / 时区） | Node |
| C-3 | 浏览器里 `seek(600)` 读实到位姿 → `seek(1799)` → `seek(600)` 再读，**两次逐位相同** | **历史无关性**：同秒必同构图的最强实地证据 | Browser |
| C-4 | `--run`（rate=64 真跑）到达 `t` 时读到的位姿 = `ceremonyPoseAt(t)`（容差由 C7 的 `1.2/s × Δt` 给出） | **帧率无关性**：不同帧率 / 不同倍速 ⇒ 同一个 `t` 同一构图的同一状态 | Browser |

> A-1 / A-2 是"看起来一样"的弱证据；**C-3 才是"足以作为发布证据"的那一条**：它证明了把 `ritualElapsed` 倒回同一个值，画面必定回到同一个构图，与中间跑了多少帧、经过多远无关。

---

## 8. 可验证性：可机械判红的断言清单

> 划分依据：**能不能在没有浏览器的 Node 里跑**。能 ⇒ 进 `npm test`（`scripts/run-tests.mjs:18-33` 的 SUITES）；不能 ⇒ 走独立命令（`docs/design/007-webgl-degradation.md:131` 之训：「独立命令，**不入 `npm test`**」）。

### 8.1 A 组 · 浏览器无关（**建议进 `npm test`**，见 §11-5）

落 `scripts/verify-ceremony-view.mjs`（**新**），esbuild 打真模块后 import，手法照抄 `scripts/verify-ritual-timeline.mjs:31-39`。

| # | 断言 | 判红口径 |
|---|---|---|
| **A-1** | 纯函数 · 重复求值 | ∀ s ∈ [0,1800] 整点：`JSON(pose(s))` 两次求值逐位相同 |
| **A-2** | 纯函数 · 历史无关 | 洗牌序列 vs 顺序序列，1801 点逐点相同 |
| **A-3** | 无随机 / 无墙钟 | 源码 `/(Math\.random\|Date\.now\|performance\.now\|requestAnimationFrame\|THREE)/` 零命中 |
| **A-4** | 无环境依赖 | 源码 `/(document\.\|window\.\|localStorage\|navigator\|screen\.)/` 零命中 |
| **A-5** | **silence 静止（约束 5）** | ∀ s ∈ [1751,1800]（含 1751.0001 / 1799.999）：`JSON(pose(s))` 全等；且要求 `JSON(pose(1750)) ≠ JSON(pose(1751))`（防止"从头到尾都不动"的假绿） |
| **A-6** | **无硬切（`:1733` 契约）** | ∀ s：相邻整秒 `Δposition ≤ 1.2`、`Δfov ≤ 0.05`；**四个换幕点（179→180、1019→1020、1439→1440、1750→1751）额外要求 ≤ 1e-9** |
| **A-7** | 边界夹取 | `pose(−1) ≡ pose(0)`；`pose(1801) ≡ pose(1800)`；`pose(NaN)` / `pose(±Infinity)` / `pose('600')` 全部有限值且落在合法区间 |
| **A-8** | C1 / C2 / C5 / C6 全区间 | ∀ s（步长 0.25s）：`|p| ≤ 110`、`y ≥ 6`、`dist(pos,target) ∈ [8,200]`、`fov ∈ [30,60]` |
| **A-9** | **#00 无极点 · 轴线（约束 3）** | ∀ s：`hypot(x, z) ≥ 16` |
| **A-10** | **#00 无极点 · 体积（约束 3）** | ∀ s：`distance(pos, (0, PYRAMID_TOP+0.14, 0)) ≥ 12`；`PYRAMID_TOP` 由 esbuild 打 `src/data/altarGeometry.ts` 取真值（不抄 21） |
| **A-11** | C4 视线恒向下 | ∀ s：`pos.y > target[1]` |
| **A-12** | 构造锚点 | 用**真源码 scrape** 取出 `AltarScene.ts` 的 `position.set(48, 40, 58)` / `target.set(0, 6, 0)` / `PerspectiveCamera(45`，与 `CEREMONY_HOME` 逐项相等 ⇒ 任一侧改动未同步 ⇒ 红 |
| **A-13** | 五幕全覆盖 | Keyframe 表的 5 段拼接 = `[0, 1800]`，无空隙、无重叠 |
| **A-14** | **时间源只读（约束 1）** | ① 幕窗逐项等于 esbuild 打出来的 `PHASE_WINDOWS`（`phaseEnvelope.ts:44`）；② `AltarScene.ts` 里 `ritualElapsed =` 的赋值点**恰为 4 处**，且分别落在 `startRitual` / `seekTo` / `updateRitualTimeline` 方法体内（**没有第 5 处**） |
| **A-15** | **隔离 · DOM 面（约束 2）** | 新模块源码里 `document. / setAttribute / classList / createElement / innerHTML / window. / dataset` **零命中** |
| **A-16** | **隔离 · 词表面** | 新模块**全文**（含其中的字符串字面量）对 `SCAN_WORDS` 中的 `camera / debug / speed / playback / 倍速 / 拓扑 / 座次` **零命中**（按 §6.1-R2 的命名，这条当下零成本） |

**进 `npm test` 的代价**：多一次 esbuild 调用 + 约 7200 次浮点求值。同量级既有套件 `verify-honor-aggregation.mjs` 实测 `163ms`（来自本次 `npm test` 回显）⇒ 可接受。

### 8.2 B 组 · 源码结构断言（Node 读文件即可，进同一脚本）

| # | 断言 | 判红口径 |
|---|---|---|
| **B-1** | 单点调用 | `AltarScene.ts` 中 `applyCeremonyView(` 出现次数 **== 2**（1 处定义 + 1 处 animate 内调用）；且调用点行号 **>`this.updateFreeFlight(dt);` 的行号**（把 §5.1 的次序钉死） |
| **B-2** | 无第二时钟 | `AltarScene.ts` 中 `new THREE.Clock` 计数 **== 1**（`:230`）；`requestAnimationFrame` 计数 **== 1**（`:2276`） |
| **B-3** | 形参干净 | `applyCeremonyView` 不接受 `dt`；animate 内实参**字面为 `this.ritualElapsed`** |

> B 组是"用文本扫描把架构决定钉成红灯"。好处：将来有人把调用挪到 `controls.update()` 之前，CI 立刻要求他把次序改回来，比 PR review 靠谱。

### 8.3 C 组 · 浏览器（**独立命令，不入 `npm test`**）

落 `tools/capture/verify-ceremony-view.mjs`（**新**），依赖 `tools/capture/main.ts` 的 `CaptureApi`（`:18-36`）新增一个 `pose()` 读数口 —— **只在取证 harness 里，不在 dist 里**（`main.ts:10` 原文「不进 dist、不打包进 App」）。

| # | 断言 | 判红口径 |
|---|---|---|
| **C-1** | 无异常 | 全程 `page.on('pageerror')` 计数 **== 0**，console `error` **== 0**（或白名单） |
| **C-2** | **#7 空转不抛错（约束 4）** | 复用 `tools/capture/verify-webgl-degradation.mjs`（已由 #7 落地）的"禁 WebGL 启动"开关 ⇒ tier=`none` 下跑同一条时间轴，`pageerror == 0` |
| **C-3** | **历史无关（约束 6）** | `seek(600)` → 读 pose → `seek(1799)` → `seek(600)` → 读 pose：两次**逐位相同** |
| **C-4** | **帧率无关（约束 6）** | `--run`（rate=64）过程中在 5 个幕内点读 `(t, pose)`，断言 `‖pose − ceremonyPoseAt(t)‖ ≤ 1.2 × Δt` |
| **C-5** | **画面确实在动（本 issue 的核心正向证据）** | 关键秒 `90 / 600 / 1200 / 1600` 各截一张，**相邻两张 sha256 必须不同** ⇒ 「镜头静止」被**证伪** |
| **C-6** | **silence 确实静止（约束 5）** | `s=1760` 与 `s=1799` 两张 **sha256 必须相同**（弱口径见下） |
| **C-7** | **隔离回归（约束 2）** | 连带跑 `npm run audit:entry`，要求 `门禁 PASS`；重点是 `A.dom-zero`（含 `camera` 在内的暴露词命中 = 0） |

> **C-6 的诚实交代**：silence 幕下 `fountainGroup` 不可见（`:1751` `fountainGroup.visible = !isDark`，`isDark` 含 silence）、诸灯归零、泉群与星船均不可见，故理论上两帧应像素相同。**若实测因 UI 层抗锯齿 / 字幕动画而不同，退到弱化口径**：只比对 `nonBlackRatio / meanLum / brightPixels` 三个探针（复用 `capture.mjs` 既有 `analyze()`）在 `1e-3` 内相等，并**把弱化原因写进报告，不得静默放宽**。

### 8.4 证据产物

- `artifacts/capture/ceremony/manifest.txt` —— 每幕关键秒的 `sec / phase / pose / sha256 / nonBlackRatio / meanLum` 表，外加 C1–C7 的实测极值。
- `artifacts/capture/ceremony/*.png` —— 关键秒截图（**PNG 不进版本库**，`capture.mjs:28` 之训）。
- **对外交付**：1800s 全程录屏（桌面 + 移动各一次；`docs/design/007-webgl-degradation.md:173` 已有 `--run` + `recordVideo` 的既定做法）+ 上面这份 manifest，**两者时间码须一致**。

---

## 9. 文件清单

| 动作 | 文件 | 说明 | 约束依据 |
|---|---|---|---|
| **新增** | `src/three/ceremonyView.ts` | 五幕取景纯域模块：`CeremonyPose` / `ceremonyPoseAt(sec)` / `CEREMONY_HOME`；**只 import** `types/altar.ts` 与 `audio/phaseEnvelope.ts` | §4 |
| **修改** | `src/three/AltarScene.ts` | ① import 新模块；② 新增 `private applyCeremonyView(sec)`；③ animate 内 `:2324` 之后**单点调用**；④ T3 的争夺屏蔽 | §5.1 / §6.2 |
| **新增** | `scripts/verify-ceremony-view.mjs` | A + B 组断言（浏览器无关） | §8.1 / §8.2 |
| **修改** | `scripts/run-tests.mjs` | SUITES（`:18-33`）追加一行 | §11-5 |
| **修改** | `tools/capture/main.ts` | `CaptureApi`（`:18-36`）加 `pose()` 读数口 | §8.3 |
| **新增** | `tools/capture/verify-ceremony-view.mjs` | C 组浏览器取证驱动 | §8.3 |
| **修改** | `package.json` | 加 `test:ceremony`（Node 脚本）与 `capture:ceremony`（浏览器驱动）；**后者独立，不入 `npm test`** | §8 |
| **产物** | `artifacts/capture/ceremony/*` | manifest + 截图（PNG 不入库） | §8.4 |
| **本单产出** | `docs/design/008-camera-choreography.md` | 本文 | — |

**明确不改**（写在这里，防止实现时顺手动）：`src/types/altar.ts`、`src/audio/*`、`src/App.tsx`、`src/components/*`、`scripts/qa-audit-public-entry.mjs`（含 `SCAN_WORDS`）、`scripts/verify-entry-isolation.mjs`、`.gitea/`、`vite.config.ts`。
⇒ **不碰任何一条既有门禁的词表**，这才是"通过隔离"的正确姿势。

---

## 10. 有序任务（粒度到一次一条）

> 依赖链刻意压扁：T4 只依赖 T1，可与 T2 / T3 并行。

| 任务 | 内容 | 依赖 | 涉及文件 |
|---|---|---|---|
| **T1** | **取景核**：`src/three/ceremonyView.ts` —— `CeremonyPose` / `ceremonyPoseAt(sec)` / `CEREMONY_HOME`；Keyframe 表（§3.2）经 `PHASE_WINDOWS` 取真源；幕内 `smootherstep`；#00 坐标由 `PYRAMID_TOP` 现算。**要求：模块内零 `THREE`、零 DOM、零随机** | — | `src/three/ceremonyView.ts` |
| **T2** | **公共场景接管**：`AltarScene` import + `private applyCeremonyView(sec)`（含两处豁免：`orthoTopdownCamera` 在场 / `!ritualRunning`）+ animate 内 `:2324` 之后**单点调用**；`fov` 写入加 `aspect` 有限守卫 | T1 | `src/three/AltarScene.ts` |
| **T3** | **时间源只读 + 镜头争夺消解**：① 确保 `ritualElapsed` 写入点**仍恰为 4 处**；② 仪式推进态下 `onKeyDown` 直接 return 并清空 `pressedKeys`；③ 拾取不再触发聚焦跃迁（保留 `onXxxSelect` 回调本体） | T2 | `src/three/AltarScene.ts` |
| **T4** | **浏览器无关断言入 `npm test`**：`scripts/verify-ceremony-view.mjs`（A-1…A-16 + B-1…B-3）+ 注册进 `scripts/run-tests.mjs` SUITES + `package.json` 加 `test:ceremony` | T1 | `scripts/verify-ceremony-view.mjs`、`scripts/run-tests.mjs`、`package.json` |
| **T5** | **浏览器取证 + 降级空转 + 隔离回归**：`tools/capture/main.ts` 加 `pose()`；新 `tools/capture/verify-ceremony-view.mjs`（C-1…C-7，含 tier=`none` 空转分支）；`package.json` 加 `capture:ceremony`；出 manifest + 关键秒截图；**连带复跑 `npm run audit:entry` 与 `npm run test:isolation`** | T2, T3 | `tools/capture/main.ts`、`tools/capture/verify-ceremony-view.mjs`、`package.json`、`artifacts/capture/ceremony/*` |

**唯一的人工口径**：T2 / T3 落地后，必须先用 `npm run capture -- --seek` 在 `t = 90 / 600 / 1200 / 1600 / 1780` 五个点**目测一眼**席面、灯环、#00 是否都在画面里。若构图需微调，改的是 §3.2 的 Keyframe 数字，**C1–C7 一条都不许改**。

---

## 11. 待明确事项（默认假设 + `file:line` + 原文）

| # | 歧义 | 默认假设 | 依据（file:line + 原文） |
|---|---|---|---|
| **1** | silence 幕 49s 是"静止 / 继续缓动 / 推远"？ | **静止**（姿态在 [1751,1800] 恒定；"渐远"已在 extinguishing 幕内提前完成） | `src/audio/phaseEnvelope.ts:9`「silence 幕 1751→1800 **恰 49s**，三层增益恒为 0（完全归零，不灰不响）」；`AltarScene.ts:1993` `altarAudio.applyPhaseEnvelope(phase, phaseProgress(this.ritualElapsed));`（视听同源） |
| **2** | Keyframe 数字是否需要视觉校准？ | **需一次五点目视校准**（T2/T3 后立即做）；数字可改、**C1–C7 不可改** | §3.2 表为默认值，§3.5 实测表明当前值已满足全部约束；`tools/capture/main.ts:7`「seek(t) —— …用于 #2 首/中/末席静态取证」 |
| **3** | ⚠️ **我发现的前提偏差**：公共页今天并非"零操控" | 见 §11-3 | 见 §11-3 |
| **4** | 能否认为 `:1734` 的注释是既有契约？ | **是** —— 那就是"应有连续环绕"的契约，本单把它变成真话 | `AltarScene.ts:1734`「// 公共页唯一的镜头运动是 animate() 第 0 段的连续环绕（不受 ritualMode 影响）。」；而 `:2282` 的 animate 第 0 段只有 `this.updateRitualTimeline(dt);` |
| **5** | A 组断言是否进 `npm test`？ | **进**（浏览器无关，与其他套件同手法） | `scripts/run-tests.mjs:18-33` SUITES 均为 Node 套件；`docs/design/007-webgl-degradation.md:131`「…**独立命令，不入 `npm test`**」的前提 = 需要浏览器，本单 A/B 组不需要 |
| **6** | `ceremonyView` 可否直接 import `audio/phaseEnvelope`？ | **可**（它是五幕时间窗唯一真源，且不依赖 Tone / three） | `src/audio/phaseEnvelope.ts:11-18` import 块只有 `'../types/altar'`；`:41-43`「**唯一真源**：全部取自 types/altar 的既有阈值常量，本表不含任何自造数字」 |
| **7** | C-6 的"两帧像素相同"是否过强？ | **先按强口径写死**，跑不通时退到三探针（`nonBlackRatio / meanLum / brightPixels`）**并在报告里写明退化原因** | `tools/capture/capture.mjs:425-426` 已有这三个探针口径 |
| **8** | 走马灯自身转向与相机绕行方向要不要同向？ | **待实现时实测**：读 `AltarMaglevLanternEngine` 的 `omega` 符号后决定；默认"不影响" | `AltarScene.ts:236` `private maglev = new AltarMaglevLanternEngine({ radius: 23.5 });`；`:2405` 注释「茶灯 1020s 门控只作用在**视觉转角**上」 |

### 11-3 ⚠️ 我发现的一处**前提偏差**（请主理人裁定）

交办描述（以及 #5 给我们的整体印象）是"公共路径不得出现任何相机控件或操控入口"。**实测**：

```
$ sed -n '43,48p' src/App.tsx
    // 当前直入版本不开放游客档：进入即为已认证的观察席，WASD/QE 立刻可用。
    // 真正 OIDC 接入后由身份层覆写此角色；祭坛本体仍只消费 role，不自行验权。
    altar.setRole('authenticated');
    // #8：公共入口改由 1800s 五幕时间轴驱动（abyss→naming→lanterns→extinguishing→silence）。
    // presentImmediately() 保留不删，供导演 / 直入路径（#5）另用。
    altar.startRitual();
```

所带来的三条事实：

1. **公共页是 `'authenticated'`（`App.tsx:45`）** ⇒ `ROLE_CAPABILITIES.authenticated.freeCamera = true`（`types/altar.ts:112`）⇒ **`updateFreeFlight`（`AltarScene.ts:2244`）在公共页处于可触发状态**：任何人按 WASD/QE 就能改写公共页镜头。
2. `setRitualState():1737` 写的 `controls.enabled = false` **只挡鼠标 OrbitControls，不挡键盘** —— `onKeyDown:1691` 的判断是 `if (!this.capabilities.freeCamera) return;`，与 `controls.enabled` 无关。
3. 这既**违反 #5 的隔离口径**，也**直接破坏本单约束 6（确定性）**：只要录屏的人按了一个键，1800s 录屏就不可复现。

**默认处置（T3）**：仪式推进态下关掉这条键盘通路。**理由不是"为了做运镜"，而是 #5 本就该如此。** 请主理人确认是否采纳；**若主张公共页保留键盘操作，请明示** —— 那样 §7 的 C-3 / C-4 必须降级为"仅对无键盘输入的录屏成立"，我会把口径改过来，不假装没事。

---

## 附录 A：本说明书自查

| 检查项 | 结论 |
|---|---|
| 是否修改了 `src/` / `scripts/` / `tools/` / `package.json` / `vite.config.ts` / `.gitea/`？ | **否**。仅新增 `docs/design/008-camera-choreography.md`。（原型 `/tmp/ceremony-proto.mjs` 在仓外，不入库） |
| 每个 `file:line` / 引文是否来自本次真实 `Read` / `grep -nE` / `sed -n`？ | **是**。全部在 HEAD `2eb4b82` 上复核；`AltarScene.ts` 在本次 HEAD 三度前移（ccee22e→3b24a1c→2eb4b82）期间未被改动（行数恒 2711，行号逐条一致） |
| 是否伪造过任何命令回显？ | **否**。§0.1 反而如实交代了一次**不可用作基线**的 `npm test`（被队友负样本自检注入并发污染），并明确不引用其结论 |
| 是否主张了产品代码现状中不存在的能力？ | **否**。§0.3 明引 13 个相机写点与 animate 第 0 段，证明"当前仪式期间镜头确无运动"；§3–§8 均为**待实现**设计 |
| 是否与 #4 单一包络、#5 隔离、#7 降级一致？ | **是**。§2 时间源只读 + 幕窗复用 `PHASE_WINDOWS`；§6.1 零 DOM 面 + 去毒命名、**不动任何既有词表**；§6.4 三档同路径 + `none` 档空转不抛错 |
| 是否把未裁定结论写成既定？ | **否**。8 项开放事项均有默认假设 + `file:line` + 原文；§11-3 主动指出交办前提的一处偏差并请裁定 |
| 是否存在"没有对应断言的主张"？ | **否**。§1 总索引把 6 条硬约束逐一映射到 A/B/C 断言编号；附录 B 给出 Keyframe 的真跑输出 |

---

## 附录 B：`/tmp/ceremony-proto.mjs` 完整回显（仓外原型，不入库）

```
$ cd /tmp && node ceremony-proto.mjs
约束违规: 0（全通过）
逐秒最大位移 = 0.7768 世界单位/s ；逐秒最大 fov 变化 = 0.02679°/s
silence 幕 49s 姿态恒定: 是
同一 sec 重复求值逐位恒定: 是
乱序采样结果 == 顺序采样结果: 是
聚合: {
  minRadial: 46, minWuji: 54.975, minDist: 58.687, maxDist: 82.608,
  minY: 26, maxY: 62, maxP: 85.44, minFov: 40, maxFov: 46
}
pose(0) = pos[48.000000,40.000000,58.000000] target[0.000000,6.000000,0.000000] fov=45.000000
Δ vs 构造值 = 7.11e-15
```

逐条对齐 C1–C7：`maxP 85.44 ≤ 110 ✅ C1`｜`minY 26 ≥ 6 ✅ C2`｜`minRadial 46 ≥ 16 ✅ C3`｜`minY 26 > max ty 21 ✅ C4`｜`[58.687, 82.608] ⊂ [8,200] ✅ C5`｜`[40,46] ⊂ [30,60] ✅ C6`｜`0.7768 ≤ 1.2 且 0.02679 ≤ 0.05 ✅ C7`。

---

*本单不改代码，只交付口径与可判红的清单。实施落在 §10 的 T1–T5，验收落在 §8 的 A/B/C 三组断言。*
