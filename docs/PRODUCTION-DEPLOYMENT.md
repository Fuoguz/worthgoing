# WorthGoing Production 部署记录

日期：2026-10-04。本轮仅部署和验证，不新增功能。

当前状态：部署准备完成，GitHub 官方 CLI 浏览器授权待完成。线上 smoke test 尚未执行，不能标记 READY。

- GitHub repository：待授权后创建并推送。
- Vercel project：`fuoguzs-projects/worthgoing`，Framework = Next.js，Node.js = 24.x。
- Production URL：待 Production 发布。
- Production/Preview environment：`TICKETMASTER_API_KEY`、`DEAPI_API_KEY` 已配置为隐藏 Secret，通过 stdin 传输，报告不含实际值。本地代理变量不上传。
- API runtime：`nodejs`，`maxDuration = 90` 秒；保留原 8 秒 Ticketmaster 与 60 秒 deAPI 总超时。
- Runtime compatibility：应用 server route 不读写本地持久化文件、不依赖 localhost/Windows 路径/本地后台进程；缓存只为进程内优化，冷启动不影响正确性。
- Preflight lint/build：通过。
- Unit tests：93/93，通过，未删除/skip。
- Desktop/mobile browser tests：20/20，通过，未删除/skip。
- Secret scan：源码/文档/build/client 未发现两个真实 Key；`.env.local`、`.next`、`node_modules`、测试产物均被排除。
- London live music、New York sports、中文兴趣与 mobile production：待真实 URL 发布后验证。
- 线上 Ticketmaster/deAPI/fallback/latency：尚未验证。自动化 keyword fallback 证据已通过，生产配置不会被人为改坏。

唯一需要用户完成的当前步骤是 GitHub 设备授权。其余部署、变量配置、测试由工具继续完成。
