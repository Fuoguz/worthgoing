# WorthGoing Production 部署记录

日期：2026-10-04。本轮仅部署和验证，不新增功能。

GITHUB: https://github.com/Fuoguz/worthgoing

PRODUCTION: https://worthgoing-eight.vercel.app

STATUS: READY FOR DEMO AND DEVPOST

Production alias 匿名访问 HTTP 200。GitHub 为 public repository，默认分支 main。最终 main 与 Production 的提交对应关系在最终发布后通过 GitHub / Vercel API 检查；最终检查记录保存在本地被忽略的 `.vercel/deployment-verification.json`。本报告不包含凭据。

## 部署与修改范围

- Vercel project：`fuoguzs-projects/worthgoing`，Framework = Next.js 16.3.8，Node.js = 24.x，target = Production。
- 修改 `package.json` / lockfile，明确 Node 24.x；`src/app/api/activities/route.ts` 只增加 `maxDuration = 90`。保留 Node runtime、原 8 秒 Ticketmaster 与 60 秒 deAPI 超时及全部业务逻辑。
- 新增 `.vercelignore`，排除真实 env、Git、依赖、构建与测试临时产物。保留 `.env.example` 空值模板。
- 新增 `scripts/vercel-configure-env.mjs`、`scripts/production-smoke.mjs`、`scripts/production-secret-scan.mjs`，用于私密环境配置和可重复验证；新增本报告、JSON 记录及 `production-validation/` 截图。
- 本轮初始化 Git、创建 public GitHub repository、提交并推送 main、通过官方 CLI 发布 Production。最终文档提交重新发布，确保不是只发布先前提交。
- 应用 server route 不依赖 Windows 路径、localhost、后台进程或持久化本地文件。缓存仍是进程内优化，实例更替可能失效。

## 环境变量与运行时

`TICKETMASTER_API_KEY`、`DEAPI_API_KEY` 已配置为 Production / Preview 的隐藏 Secret。配置 helper 从本地环境读取，通过 CLI stdin 传输，实际值不进入命令参数、报告、源码或客户端；捕获输出也做凭据替换。未使用 `NEXT_PUBLIC_`。本地代理变量没有上传。

原 `.env.local` 的两个 Key 保留且不被 Git tracked。Vercel link 自动追加的临时 OIDC 变量已移除。官方 CLI 的登录凭据由各自 CLI 保存，不写入项目。自动化测试使用 mock HTTP，不消耗真实 Key。

Next 构建的 functions-config manifest 确认 `/api/activities` 的 90 秒配置。Vercel Cloud build 接受该配置，真实搜索在期限内完成；未人为延长第三方请求到 60 秒以测试边界。官方说明：[Node 版本](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Function duration](https://vercel.com/docs/functions/configuring-functions/duration)。

## 真实 Production 流程

统一窗口：2026-10-10，12:00–23:30（地点本地时间），available time 8h，budget 100，distance 50。清除预置兴趣后输入指定原文。没有注入 mock HTTP，没有修改生产 Key。

| Case                              | Ticketmaster 原始 / 标准化 | 展示 | 语义评分 / keyword fallback | 首轮 API 耗时 | 重复查询耗时 |
| --------------------------------- | -------------------------- | ---- | --------------------------- | ------------- | ------------ |
| London / live music               | 50 / 50（API total 100）   | 5    | 50 / 0                      | 8,457ms       | 6,150ms      |
| New York / sports                 | 23 / 23（API total 23）    | 5    | 23 / 0                      | 7,242ms       | 1,599ms      |
| London / 城市探索、建筑、艺术展览 | 50 / 50（API total 100）   | 5    | 50 / 0                      | 6,680ms       | 2,521ms      |

三个 case 均 HTTP 200，dataMode = live，source = Ticketmaster，mockCount = 0，重复活动 / 拒绝标准化数量均 0，fallbackReasons 为空。首轮每个 case 都实际调用 deAPI 原生 batch embeddings；每次 1 次提交、2 次轮询。模型 Bge_M3_FP16，向量仍只参与 Interest Fit，最终 WorthGoing Score 由原 deterministic scoring pipeline 计算。

首轮 cacheHits 均为 0；重复查询分别 49 / 20 / 50。缓存属于 best-effort，不保证跨实例命中。具体耗时见 `production-latency.json`，完整第二轮浏览器证据见 `production-smoke.json`。

London music 首项 Erykah Badu，54 / Go if nearby；New York sports 首项 advik, Devika, prat.，49 / Skip；中文兴趣首项 Heated Rivalry，52 / Go if nearby。该 New York 窗口缺乏高匹配体育候选，因此低分与负推荐是正常结果。没有为获得高分改变推荐阈值或补造事实。

## 页面、移动端与来源

实际走通 preference input → Ticketmaster → normalization → native embeddings → deterministic scoring → verdict → results cards → score breakdown → source click。浏览器没有直接调用 Ticketmaster Discovery / deAPI 上游。

两项桌面场景和 iPhone 13 尺寸 Chromium 移动端场景：homepage、表单、loading、5 张卡片、评分展开与链接点击均验证；homepage/results 无横向溢出；应用 pageErrors 均为空。移动端是浏览器 viewport 验证，未声称实体 iPhone / Safari 验证。截图保存在 `production-validation/`。

来源链接保留 API 的 canonical URL。本机自动浏览器访问 Ticketmaster 美英主站时两个链接返回 HTTP 403；直接 Node 访问也被限制，未绕过第三方防护。独立官方页面读取可确认伦敦 Erykah Badu 的活动、日期和 Blue Note London；纽约 advik 页面读取器缓存时间为两周前，只能佐证活动身份，不能保证当前库存。剧院来源 Heated Rivalry 在浏览器中 HTTP 200，标题、活动及场地可见。

详细 URL / freshness / 状态见 `production-source-verification.json`。不能将两个 403 写成浏览器访问通过；第三方页面访问仍受其网络、防护和地区策略影响，购票与库存未测试。WorthGoing 公开访问和真实查询没有相应阻塞。

## Fallback 与数据边界

生产六次真实查询均未触发 mock / keyword fallback。本轮没有破坏 Production 配置制造失败。超时、无 Key、API 错误、无结果、无效响应、缺失字段及 semantic fallback 的证据来自保留的 mock HTTP 单元测试与本地浏览器回归，不等同于云端故障注入。

真实活动及来源来自 Ticketmaster，兴趣向量来自 deAPI；最终评分、Why / Trade-off 与硬约束仍使用现有规则。缺失价格、时长或可靠出发坐标不会被补造；旅行距离或时间属于现有估算，并保持相应标签。MockProvider 仍供开发 fallback / 测试使用，明确 Demo / Mock 标记。生产展示没有混入 mock。

当前最明显的数据限制仍是 Ticketmaster 缺少足够价格 / 时长数据，以及该查询窗口的体育候选覆盖；这会限制专程推荐，不属于部署失败。本轮未接新活动源、地图、认证、数据库或改变 scoring。

## 验证、安全与停止条件

- lint：通过（包括新增部署验证脚本）。
- local production build：通过；Vercel production build：通过，首次 Cloud build 约 27 秒。
- 单元测试：93/93，通过，包括全部 scoring / Ticketmaster / 原生 deAPI 测试；无删除、skip。
- 本地 desktop/mobile browser tests：20/20，通过；真实 Production 的三个指定场景及移动端验证如上。
- 本地安全扫描：源码、README/docs、构建、45 个客户端文件未发现两个真实 Key。云端安全脚本扫描匿名 homepage + results HTML、引用的 JS/CSS、Git tracked files；结果见 `production-secret-scan.json`，最终发布后再做只读扫描。
- `.env.local`、`.next`、`node_modules`、`.vercel` 不被 Git tracked；`.env.example` 只含空值；请求和凭据读取位于服务端。
- 本轮未发现项目 / public Git / browser bundle 的 Key 暴露。历史开发会话曾记录工具输出凭据的例外，不能把当前扫描结论解释为从未发生任何历史暴露。
- Vercel Production 最近 1 小时 error-level logs 查询没有记录；这是查询窗口结果，不代表长期监控保证。本轮未新增 logs drain / CI / 其他功能。

部署阶段已完成，不存在 WorthGoing 应用的发布阻塞。来源主站浏览器访问限制已明确披露。代码和验证记录完成后停止；下一步由用户确认演示 / 提交安排，不自行进入下一阶段。
