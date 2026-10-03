# deAPI Interest Fit 接入与校准记录

原生批量端点已按用户批准迁移完成，London/New York 四类兴趣的完整真实语义流程已验证。此文件保留最初的兼容网关测量与校准历史；当前传输、容量、真实流程及最终检查见 [原生验证报告](NATIVE-DEAPI-VALIDATION.md)。

## 已实现

- `.env.local` 保留 Ticketmaster 配置并新增私有 deAPI Key；`.env.example` 只有两个空 Key。未修改系统代理配置。
- `src/lib/interests/deapi.ts`：server-only 原生异步 batch client、BGE-M3 1024 维响应解析、60 秒总超时、最多 20 次轮询、安全错误分类、数字限额响应头。原生端点使用配置中的原值，不添加认证前缀；最初兼容网关曾经用户批准在请求头补前缀，该兼容代码已移除。
- `src/lib/interests/text.ts`：用户选择标签按 `; ` 连接，再接原始可选兴趣文本；不翻译、不扩展。活动仅使用 Ticketmaster 实际提供的标题、结构化 classification/genre、description、venue、city；缺字段跳过，不发送派生兴趣标签、偏好预算/位置、localStorage 全量或浏览器信息。Mock 活动不发给 deAPI。
- `src/lib/interests/similarity.ts`：标准 cosine、零向量/非有限值/维度不一致处理，以及经真实测量的单调分段映射。
- `src/lib/interests/semantic.ts`：一次搜索批量发送所有尚未缓存的去重文本；5 分钟、最多 1000 条进程内 LRU embedding cache。缓存只在服务端，不持久化、不返回向量；无配置时不使用缓存掩盖失败。单个无效活动向量仅对该项 fallback；用户向量/整批异常对整批 fallback。
- `src/app/api/activities/route.ts`：Ticketmaster retrieval/normalization 后执行 Interest Fit 匹配，只返回数值/provenance/debug metadata。沿用同源入口。
- `src/lib/scoring.ts`、`src/app/results/page.tsx`：现有引擎读取服务端 Interest Fit；其他四项、35/20/15/15/15 权重、硬约束和 verdict 未更改。语义 why/breakdown 仅描述真实算出的关联分数，不由 LLM 生成。
- `src/lib/types.ts`、`preferences.ts`、`providers/ticketmaster-normalize.ts`：增加可选原始兴趣文本、结构化 taxonomy 和匹配元数据，原 provider/normalization 继续保留。
- `src/components/preference-form.tsx`、`src/app/globals.css`：轻量可选多语言兴趣输入，可仅用自由文本；保留标签、原布局和 localStorage。
- `tests/deapi.test.ts`、`tests/e2e/deapi.spec.ts`：mock HTTP/vector tests 及桌面/移动语义分数、排序、中文输入、持久化和 fallback 流程。
- `docs/deapi-calibration.json`：最初独立人工校准的输入和实测数值，自动测试保留数值回归，不持久化向量。
- `scripts/security-check.mjs`：扩展为同时检查两个真实凭据、示例空值、客户端产物及项目文件。

## 官方接口与实测限制

最初实现并验证的接口为 `https://oai.deapi.ai/v1/embeddings`，model `Bge_M3_FP16`，float response，1024 dimensions。现已改用 `https://api.deapi.ai/api/v2/embeddings`，模型、cosine 和映射保持原样。

[官方兼容网关说明](https://docs.deapi.ai/openai-compatibility)指出，数组每项都单独计入任务和限额。真实账号响应头显示 **limit=10、remaining=0、Retry-After=17 秒**；14 项输入的批次获得 429。一次两项输入成功耗时 10,064 ms，4 项批次 10,960 ms，6 项批次 14,893 ms，补充 4 项批次 9,338 ms。不能把减少 HTTP 请求次数描述为只占一次任务额度。

用户随后批准先验证同一 deAPI 的[原生批量 embeddings](https://docs.deapi.ai/api/v2/embeddings/embeddings)，仅在 51-text 成功后迁移。真实容量验证通过后完成迁移，Ticketmaster 的 50 项候选上限保持原样；没有拆成小批次绕限额。

## 实际校准（未经修改的用户样例）

| Case          | User / Event 简记                                                                      | 实际 cosine | Interest Fit |
| ------------- | -------------------------------------------------------------------------------------- | ----------: | -----------: |
| A             | technology, immersive experiences / interactive digital art exhibition                 |    0.680043 |           71 |
| B             | architecture, urban exploration / architecture and city design exhibition              |    0.644717 |           62 |
| C             | architecture and museums / Premier League football                                     |    0.345793 |            0 |
| D             | 城市探索、建筑、艺术展览 / architecture and urban art exhibition                       |    0.717896 |           81 |
| E             | 科技和互动展览 / baseball                                                              |    0.395416 |            0 |
| STEP 8 high   | architecture, urban exploration, exhibitions / architecture exhibition, Arts & Theatre |    0.751738 |           90 |
| STEP 8 medium | technology and interactive exhibitions / science museum event                          |    0.601609 |           50 |

每段输入均返回 1024 维。中文高/低例的差异符合这组受控样例的预期；不能从 7 对样例宣称所有语言/活动匹配都准确。JSON 保留用户原始完整输入与数值；这些受控文本不是来自 Ticketmaster 的活动事实。

映射锚点为 `(0.40, 0)、(0.60, 50)、(0.75, 90)、(1.00, 100)`；区间线性插值并四舍五入，区间外 clamp。理由：低例上界 0.395，保守取 0.40；中例 0.602，取 0.60 对应 50；高例上界约 0.752，取 0.75 对应 90，只有接近 identical 才到 100。这不是概率；无城市、类别或演示案例专属分支。

## fallback 与评分边界

缺 Key、timeout、401/403、429、其他 HTTP 错误、失败/取消任务、malformed response、invalid/zero vector、dimension mismatch 会使用原 tagMatcher；不重试提交、不自动增加额度、不暴露上游错误。正常结果不显示 AI 故障提示，API metadata 可区分 `semantic` 与 `keyword-fallback` 并记录安全 reason。Mock 继续走原 matcher。

原 tagMatcher 只支持原有选中标签；纯自由文本在 deAPI 不可用时不能获得语义理解，保留原 matcher 的保守低匹配结果，不偷偷加入翻译、LLM 或新关键词引擎。

## 当前验证与安全

- lint：通过。
- 单元测试：93/93，包括原 scoring 12、Ticketmaster 26、deAPI 37 和新增原生 transport 18。原 75 项保留，HTTP fixtures 适配新协议；全为 mock HTTP 或固定实测数值回归，无自动真实 API 请求。
- production build：原生迁移版本通过。
- 桌面/移动浏览器：20/20，原测试未删除/跳过。
- 五个指定校准例及两个补充例：真实 API 完成。
- London/New York 的四类兴趣完整真实流程：8/8，均为 Live、原生语义评分，fallback=0，未缩减候选池。
- 工程文件及 build output 复扫：两个真实 Key 未发现于 `.env.local` 之外，客户端检查通过；目录不是 Git 仓库，忽略规则已配置。
- 会话层例外：需求附件本身包含真实 Key，首次读取需求原文的工具输出也包含它。不能声称 Key 从未出现在会话记录中。后续配置仅提取后写入私有环境文件，网络失败/测试/校准日志不输出凭据。已生成的会话记录不能由项目扫描脚本清除。

兼容网关的逐项配额问题已由原生 batch 迁移解决；原生 jobs 状态查询仍有独立配额，异步延迟和活动覆盖仍需关注。价格和可靠时长缺失仍是原有产品质量问题，本轮未接新数据源或开始下一阶段。
