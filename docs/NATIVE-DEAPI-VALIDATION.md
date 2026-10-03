# deAPI 原生批量迁移实施与验证报告

验证时间：2026-10-03。本轮按用户批准先完成容量验证，确认 51-text 成功后才修改生产 matcher。已达到情况 A 并停止；未启动其他产品功能。

## 实际修改

- `src/lib/interests/deapi.ts`：移除兼容网关 HTTP 路径和请求时添加前缀的逻辑，改为原生 submit → bounded job polling → JSON matrix parsing；保留原公共 client 接口和向量验证。新增提交/完成延迟、HTTP 次数、poll 次数。
- `src/lib/interests/semantic.ts`：仅把 transport metrics 接入现有安全诊断；原文本构造、去重、缓存、余弦、映射、keyword fallback 均保持。
- `src/lib/types.ts`：新增安全的 `job-failed` reason 及可选 transport metrics。
- `tests/deapi.test.ts`：原 37 项断言/场景保留，成功 HTTP fixtures 适配 submit/job 协议；认证和请求体断言更新为原生格式。
- `tests/native-deapi.test.ts`：新增 18 项原生 transport、错误、超时、取消、缓存对应关系和 matcher fallback 测试。
- `scripts/manual-native-capacity.mjs`：独立服务端容量验证工具，短文本、受限轮询、仅保存 shape/count/dimension/公开限额，不保存向量或凭据。
- `scripts/manual-native-flow.mjs`：8 次真实浏览器流程验证工具，不属于自动测试。
- `README.md`、`docs/DEAPI-INTEGRATION.md`、本报告：更新当前状态，保留兼容网关限制与旧校准的工程决策历史。
- 新增 `docs/native-capacity-validation.json`、`docs/native-live-flow.json`、`docs/native-validation/*.png`、`docs/native-validation-status.json` 作为证据。

现有环境配置未改写。Ticketmaster provider、50 候选上限、其他评分项、权重、verdict、UI、localStorage、75 个旧单元测试和 20 个旧浏览器测试均保留。原人工校准脚本导入当前 client，因此也不会再走旧网关；旧实测 JSON 数值未修改。

## 官方与实际协议

[官方 embeddings API](https://docs.deapi.ai/api/v2/embeddings/embeddings) 和 [jobs API](https://docs.deapi.ai/api/v2/utilities/jobs) 确认：

1. 服务端读取私有 `DEAPI_API_KEY` 原值，发送 `Authorization: Bearer <configured token>`；不添加 `dpn-sk-`。
2. `POST https://api.deapi.ai/api/v2/embeddings`，body 为 `model: Bge_M3_FP16`、`input: string[]`、`return_result_in_response: true`。
3. 实际 POST 200 返回 `data.request_id`，不直接返回 embeddings。
4. 使用该 ID 请求 `GET https://api.deapi.ai/api/v2/jobs/{request_id}`，实际观察到 `pending`、`processing`、`done`。
5. 实际 `done` 的 `data.result` 是 **JSON 字符串，解析后为按输入顺序对应的二维向量数组**。`result_url` 也存在，但生产 client 不下载该 URL，也不会向其他主机转发 Authorization。
6. 验证 count、1024 dimensions、finite values、nonzero vectors 后，交给既有 cosine 和 Interest Fit 映射。没有 LLM。

首次 schema 探测误把成功状态仅识别为 `completed`，并把结果字符串当 URL，导致验证工具误报；这发生在生产迁移前。随后通过安全 shape 检查确认实际 `done` 和 JSON 字符串，复用已提交任务取回全部有效向量，再用正确脚本完整重跑五个批次。最终生产代码按实测协议实现，初次误报记录留在 JSON 的 `initialSchemaProbe`，不能把它解释为原生容量失败。

## 最终容量实测

每项只有几个词。以下为修正 schema 后的完整一次验证序列，每批一个 POST，HTTP 均为 200、被接受、成功完成、向量有效；未出现 429 或公开 quota 错误。

| 输入 texts | 返回 embeddings | 每个维度 | submit ms | submit 到完成 ms | polls |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 2 | 1024 | 2296 | 9986 | 3 |
| 10 | 10 | 1024 | 913 | 15916 | 5 |
| 14 | 14 | 1024 | 1339 | 16393 | 5 |
| 25 | 25 | 1024 | 998 | 5836 | 2 |
| 51 | 51 | 1024 | 859 | 5764 | 2 |

原生 **51 texts 可以一次处理**。这证明当前账号/模型/短文本样本适用于当前 1+50 的规模，不等于长期 SLA 或长文本/高并发压测。

响应头实测提交配额 **10 requests/minute、500/day**；同一个窗口中五批分别只扣一次提交额度（remaining 9 → 5），不再逐段计数。Jobs 配额独立，实测 **50 queries/minute、200/day**。官方 [Limits & Quotas](https://docs.deapi.ai/limits-and-quotas) 提醒以账号实际响应头为准；不要混同批大小、提交 RPM 和 polling RPM。

## 生产 polling 与 cache

首次 poll 立即执行；非终态每 3 秒继续，最多 20 次，全链路总超时 60 秒（包括提交、HTTP、读取响应和等待）。完成立即返回，不再 poll；失败/取消状态、未知状态、HTTP 错误、429、malformed/count 错误、timeout 安全分类。不重试提交，也不把 50 候选拆成小批次。

一次搜索收集 user + 活动公开原始元数据，沿用 NFC/CRLF/trim 去重与 5 分钟、1000-entry 进程内缓存。仅未命中文本一次批量提交；返回位置恢复到对应缓存键和活动。全缓存命中无 POST/GET。多个时间的同一活动若兴趣文本相同，共用向量，但活动记录/日期不会合并。缓存不持久化，不返回浏览器。单个活动无效向量仅该项 fallback，用户向量/整批失败使该次 eligible 活动走原 matcher。

## London / New York 完整真实流程

时间窗口：2026-10-10，12:00–23:30 event-local；时间预算 8h、活动预算 100、半径 50km。每城依次测试 English sports/music/art 和中文兴趣；不选额外标签来掩盖自由文本结果。用户原文存于证据 JSON。

通过实际 preference form → 同源 API → Ticketmaster → normalization → native/cached vectors → existing scoring → verdict → results UI。London 使用桌面 Chromium，New York 使用 iPhone 13 尺寸 Chromium；不是实体手机/Safari 测试。

| 城市 / 兴趣 | 原始/标准化候选 | 未缓存 inputs | cache hits | native batch | submit ms | 完成 ms | semantic 总 ms | 展示 | fallback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| London sports | 50/50 | 50 | 0 | 1 | 2058 | 7095 | 7102 | 5 | 0 |
| London music | 50/50 | 1 | 49 | 1 | 1089 | 19113 | 19117 | 5 | 0 |
| London art | 50/50 | 1 | 49 | 1 | 779 | 23158 | 23163 | 5 | 0 |
| London 中文 | 50/50 | 1 | 49 | 1 | 1215 | 29691 | 29695 | 5 | 0 |
| New York sports | 23/23 | 19 | 1 | 1 | 2867 | 18030 | 18031 | 5 | 0 |
| New York music | 23/23 | 0 | 20 | 0 | — | — | 2 | 5 | 0 |
| New York art | 23/23 | 0 | 20 | 0 | — | — | 2 | 5 | 0 |
| New York 中文 | 23/23 | 0 | 20 | 0 | — | — | 2 | 5 | 0 |

cache hits 是**去重后的文本数量**，不是活动数量。London 的 50 条活动形成 49 个 unique event texts；New York 的 23 条形成 19 个。因此首城并非人为少取候选，次城首搜复用了已缓存的 sports user text，后续三搜又复用了首城 user texts 与次城活动文本。八次均 HTTP 200、Live；所有 50/23 条活动进入语义评分；无 duplicate ID、无 rejection、无页面 JS 错误、无水平溢出；浏览器未直接请求 deAPI/Ticketmaster API。

排序确实随兴趣变化：London sports 的首项为 Saracens，music 为 Belle Livingstone / Myles Sanko，art 转为舞台文化活动。New York music 的首项为 CHRONO TRIGGER Orchestra，Harry Styles、Steve Lacy 等音乐活动前移。sports 请求下纽约池没有强体育匹配，结果保持低分 Skip；art/中文请求的艺术展览/建筑需求也并非真正得到满足。不能把“排序变了”描述成“找到了不存在于源中的合适展览”。所有查询仍显示原负面推荐，没有为了展示高分提高映射或绕过未知价格/时长约束。

## Fallback 与安全

缺 Key、401/403、提交/轮询 429、其他 HTTP 错误、失败/取消 job、timeout、invalid status、malformed JSON/result、count/dimension/nonfinite/zero-vector 错误均有 mock coverage。失败时原 keyword matcher 工作，真实 Ticketmaster 活动保留；桌面/移动 fallback UI 测试通过。纯自由文本在 fallback 时无法得到语义理解，这是原 matcher 的明确能力边界。

当前项目扫描未发现两个真实 Key 存于 `.env.local` 之外，45 个客户端 build 文件检查通过。`.env.example` 仍只有两个空键，Git 忽略规则保留；目录不是 Git repo，因此没有 tracked files。本轮未打印 Key，未把 Key 写入代码/文档/测试/浏览器。旧会话附件和最初读取附件的凭据输出属于上一阶段已记录的会话层例外，项目扫描不能清除它。

## 最终验证与剩余风险

- lint：通过。
- production build：通过。
- unit：93/93（原 scoring 12 + Ticketmaster 26 + deAPI 37 + native 18），无删除/skip，自动测试不依赖真实 API。
- browser：20/20，桌面 10 + 移动 10，旧测试均保留。
- live capacity：2/10/14/25/51 全通过。
- live UI：8/8 全通过，keyword fallback 在自动测试验证。
- 安全检查：通过，项目文件/客户端未发现真实凭据。

当前最大 transport 风险是**异步队列延迟及独立 job-status 配额**：只有一个 uncached user text 的实际查询也曾耗时约 30 秒，多用户/无缓存使用可能触碰 50 polling/min 或 200/day；本轮不是并发/SLA 测试。当前最大推荐质量风险是候选池偏重商业演出、缺少真正的展览/体育记录，以及价格/可靠时长缺失。延迟、数据覆盖和未知字段不会由 embeddings 自动修复。

下一步最值得单独确认并解决的一件事：以当前 50 候选规模测量实际多用户队列延迟和 job-status 配额可用性，确定是否能支持稳定的发现体验。这里只记录建议，没有开始额外架构或产品阶段。
