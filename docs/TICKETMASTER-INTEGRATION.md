# Ticketmaster 接入实施报告

本轮仅接入 Ticketmaster Discovery API v2，保留 provider abstraction、统一 Activity 模型、五项 deterministic scoring、原有结果设计、筛选、localStorage 和全部原有测试。未接入其他活动源、LLM、embedding、认证、数据库或地图。

## 实际文件变化

新增：

- `src/app/api/activities/route.ts`：同源服务端搜索入口、输入校验、安全错误响应。
- `src/lib/providers/ticketmaster.ts`：server-only TicketmasterProvider、查询参数、8 秒超时。
- `src/lib/providers/ticketmaster-normalize.ts`：真实字段标准化、空值和时间状态、去重、查询诊断。
- `src/lib/providers/search-service.ts`：live 优先、开发 fallback、生产错误/空结果策略。
- `src/lib/location.ts`、`src/lib/time.ts`、`src/lib/evidence.ts`：明确城市映射、时区/DST 转换、直线距离和字段完整度规则。
- `tests/fixtures/ticketmaster.ts`、`tests/ticketmaster.test.ts`、`tests/e2e/ticketmaster.spec.ts`：虚构 HTTP fixtures、26 项新增单元测试、桌面/移动各两项新增浏览器场景。
- `scripts/security-check.mjs`、`scripts/sanitize-cache.mjs`：不输出 Key 的字节级扫描及仅针对禁用构建缓存的凭据清理。
- `scripts/manual-live-check.mjs`：独立真实 API 手动验证脚本，不属于任何自动化测试套件。
- 本报告、`docs/live-query-validation.json` 和 `docs/validation/*.png`：实测记录及截图。

更新：

- `.env.local`：私有服务端 Key、本机已有代理及 localhost 绕过配置；未打印内容。
- `.gitignore`、`.env.example`：忽略真实环境文件，示例仅空 Key。
- `package.json`、`package-lock.json`：server-only 依赖；Node 24 dev/start 环境代理支持。
- `next.config.ts`：关闭可能持久保存环境内容的 Turbopack 文件系统缓存。
- `src/lib/types.ts`、`src/lib/preferences.ts`：真实 nullable 字段、时间/价格/来源元数据、币种和服务端严格日期校验。
- `src/lib/providers/index.ts`：客户端只请求本应用 API。
- `src/lib/providers/mock.ts`：保留原测试源，明确 Mock provenance，完整度动态计算。
- `src/lib/scoring.ts`：保留五项权重及排序，加入未知事实的明确处理和不确定性 verdict 限制。
- `src/app/results/page.tsx`、`src/components/activity-card.tsx`、`preference-form.tsx`、`site-chrome.tsx`、`how-it-works.tsx`、`src/app/globals.css`：补齐来源、未知、时区/币种、估算和图像加载/失败状态，保留原视觉结构。
- `vitest.config.mts`：测试路径别名。
- `tests/e2e/flow.spec.ts`：原场景保留，HTTP fixture 固定为 Mock，避免真实 API 依赖。
- `README.md`：更新启动、数据链路、评分和验证说明。原 `tests/scoring.test.ts` 未修改。

## 数据链路与事实边界

用户偏好 → `POST /api/activities` → 服务端私有环境变量 → Ticketmaster Discovery v2 → normalization → 统一 Activity → 现有 deterministic tag matcher → 五项评分和 verdict → 现有结果页前五项 → 返回的原始 source URL。

查询使用 city、可靠映射的 countryCode、已知城市时区转换后的 UTC startDateTime/endDateTime、size=50、sort=date,asc、source=ticketmaster。未知/歧义时区使用官方 localStartDateTime 范围；不猜国家、不用 deprecated latlong，不让外部 API 过滤预算/兴趣。只取首批 50 项，不声称已穷尽全部结果。服务端 no-store、redirect:error、8 秒 timeout；不转发上游原始错误或请求 URL。

真实内容是 API 返回的 ID、标题、日期/开始时间及状态、venue/city/coordinates、canonical URL、images、classifications/genres；价格/币种仅在 API 提供时真实。缺失描述、venue、价格、duration、crowd、noise、indoor/outdoor 均保持 null，不补造。图片慢或失败时显示占位状态。

Mock 仅为原 London fictional plans、测试 fixtures 和开发 fallback；日期/价格/定性标签并非活动事实。响应和每张卡片明确标记 Live data 或 Mock data，二者不混用。

Estimated 为已知城市/街区中心到真实 venue 坐标的 haversine 直线距离，以及 `ceil(km × 8 + 5)` 的单程分钟估算。不是用户精确地址、实际路线或实时交通。未知城市起点或 venue 坐标没有距离/时间估算；没有币种转换。

## 真实 API 实测

窗口为 **2026-10-10，各城市当地 12:00–23:30**。桌面偏好：8 小时、当地币种预算 100、50 km、Art & culture + Live music。按真实表单提交，观察服务端响应、标准化、评分、verdict、结果页和原链接。

| 指标                         |             London |  New York |
| ---------------------------- | -----------------: | --------: |
| API 本次原始返回             |                 50 |        23 |
| API 声明总可用数量           | 100（只取首批 50） |        23 |
| 成功标准化                   |                 50 |        23 |
| 最终展示                     |                  5 |         5 |
| 重复 ID/重复 occurrence      |                  0 |         0 |
| 无效记录                     |                  0 |         0 |
| priceRanges                  |               0/50 |      0/23 |
| venue                        |              50/50 |     23/23 |
| coordinates                  |              50/50 |     23/23 |
| classification               |              50/50 |     23/23 |
| genre                        |              50/50 |     22/23 |
| timezone                     |              50/50 |     23/23 |
| description                  |               0/50 |      0/23 |
| 可可靠推导的 duration        |               0/50 |      0/23 |
| TBD / TBA / approximate      |          0 / 0 / 0 | 0 / 0 / 0 |
| canonical URL                |              50/50 |     23/23 |
| 页面 JS 错误 / 横向溢出      |             0 / 无 |    0 / 无 |
| 浏览器直接请求 Discovery API |                 无 |        无 |

桌面两城前五项均为 81 分、Go if nearby。缺失价格和结束时间/时长，阻止 Worth a trip，正确显示负推荐。纽约同标题的多场演出有不同 ID 和开始时间，保留为独立活动，不误当重复。另完成 New York 移动端真实表单查询：Live data、5 张卡片、无横向溢出（该轮偏好不同，分数不同）。

来源点击验证：

- London 从首卡点击 API canonical URL，打开标题为 “Book tickets for Disney’s The Lion King” 的页面，正文确认 Lyceum Theatre, London。
- New York 首卡点击原 URL；headless popup 当时正文空白。随后通过[原始 Ticketmaster 页面](https://www.ticketmaster.com/a-ghost-in-your-ear-new-york-new-york-10-10-2026/event/300064F5DD76A069)内容读取，确认 A Ghost in Your Ear、2026-10-10 5 PM、Audible’s Minetta Lane Theatre, New York；应用浏览器也显示对应活动票务标题。未伪称 headless 页面成功渲染或 HTTP 200。外部票务页面受浏览器/网络影响，应用不控制其可用性。

详细 JSON 保留原 headless 结果和独立交叉验证。实测数量是当时样本，不保证后续查询数量不变。

## Evidence Confidence 和未知评分

Evidence 是确定性字段完整度，独立于最终五项权重：

| 信号                               | 分值 |
| ---------------------------------- | ---: |
| 可用原始 source URL                |   20 |
| confirmed 日期                     |   15 |
| 提供开始时间                       |   10 |
| confirmed 日期/开始时间及 timezone |   10 |
| venue                              |   10 |
| city                               |    5 |
| latitude + longitude               |   10 |
| 完整 min/max/currency              |   10 |
| classification/genre 名称          |   10 |

缺信号不加分；TBD/TBA/approximate 不获得 confirmed 分。该字段不保证售票、价格包含附加费或数据准确。当前实测多数 Evidence 为 90，因为没有价格；即使 90，缺结束时间和价格仍阻止专程推荐。

最终权重仍为 Interest 35%、Time 20%、Budget 15%、Travel 15%、Evidence 15%。未知预算是中性 50，不当免费/超预算；币种不同也为不确定。开始明确但全程不能验证，Time 最多 50；开始/时区不可靠为 0。未知 Travel 为 50。已知超预算、超距离、超时间等保留硬约束。所有不确定检查明确进入 breakdown 和 trade-off，不能凭高分越过它们。

## fallback、质量问题与安全

缺 Key、请求失败、8 秒 timeout、invalid JSON/结构、无结果、所有返回记录均无法安全标准化：开发环境尝试原 MockProvider 并显示 Mock data 和原因；Mock 不支持的城市为空。生产环境不提供静默 Mock：无结果显示真实空状态，其余失败显示错误/重试。取消请求继续传播，不触发伪结果。

最明显的数据质量问题是本次 73 条样本全部缺失 priceRanges、description、结束时间/可靠 duration，crowd 等也未知，预算和整段出行时间无法验证。分类覆盖很好但本轮仍只做现有标签匹配。未知城市没有真实起点坐标，travel 无法计算。单页 50 条也限制了候选覆盖。

真实 Key 只保留在 `.env.local`；`.env.example` 只有空值；不使用 NEXT_PUBLIC_。server-only 阻止 provider 被客户端 import。源码、README、tests、客户端 static bundle 未发现实际 Key。当前目录不是 Git 仓库，所以不存在已跟踪的 `.env.local`，忽略规则已配置。

安全扫描曾发现 Next.js 在 **3 个被忽略的本地 Turbopack SST 缓存**中保留原始环境凭据字节。已关闭 dev/build 持久缓存并只清除对应凭据字节；生产构建后再次扫描验证。没有发现浏览器 bundle 泄露。该缓存问题不能描述为“从未有任何副本”。扫描脚本只报告路径、计数和通过状态，不输出 Key。

本机直连 Ticketmaster 超时，已验证通过既有本机代理可达，因此 dev/start 开启 Node 环境代理支持；本地应用请求绕过代理。未修改系统网络配置。

## 最终验证与停止范围

- lint：通过。
- production build：通过，动态服务端 `/api/activities`。
- 单元测试：38/38（原 scoring 12 + Ticketmaster 26），HTTP 全部 mock。
- 桌面/移动浏览器：16/16（原 12 + 新增 4），保留原用例，无删除/跳过。
- London / New York：真实 Key 手动查询及结果页链路通过；New York 额外移动端真实查询通过。
- 安全复扫：真实 Key 未发现于 `.env.local` 之外，客户端检查通过。

下一步最值得解决的一件事：**调查 Ticketmaster 真实价格覆盖，并明确如何验证用户预算**。当前 API 样本没有价格，任何专程推荐都应继续保守；本轮未开始价格补源或其他下一阶段工作。需要用户确认后再继续。

官方接口参考：[Discovery API v2](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)。
