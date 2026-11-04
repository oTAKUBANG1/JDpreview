# MEMORY

## 项目：简历 × JD 对齐 Agent（D:\JDpreview）

**当前状态（2026-11-05）**：v0.1.0 可用。离线规则版 MVP 跑通，30 用例全绿，界面逐 tab 截图核验过。

- 启动：`node src/server.js` → http://127.0.0.1:3080
- 测试：`node test/all.js`（不要用 `node --test test/`，见坑 2）
- 规格源文件：`C:\Users\PureA1m1ng\Desktop\AI\简历JD对齐Agent-全套Prompt.md`
- 产品边界：改写只重排 + 白名单术语对齐，不自由重写；事实一致率一票否决
- 下一步（P1）：接 OpenAI 兼容 LLM，规则引擎转为闸门；词库扩到细分行业

## 坑（别再踩）

1. **工作区权限**：`D:\JDpreview` 曾因缺 WRITE_OWNER 导致任何 pwsh 命令都报 `SetNamedSecurityInfoW (Win32 5): grantWrite`。用 DSH 的 diagnose-windows-sandbox-acl 脚本修好后正常；报告留在 `C:\Users\PureA1m1ng\Desktop\JDpreview-acl-reports`。
2. **测试 runner**：沙箱里 `node --test test/` 会 spawn 子进程，stdio 管道被拒（EPERM）。用 `node test/all.js` 单进程导入。
3. **无头浏览器**：受限沙箱下 Chrome/Edge 起不来（mojo 命名管道拒绝访问）。截图需要完全权限（当前会话是 danger-full-access，可用）。
4. **PowerShell 发中文**：`Invoke-WebRequest -Body` 默认编码会把中文变问号，冒烟测试用 `node -e "fetch(...)"`。
5. **改完引擎必须重启服务**：Node 不热重载，曾因此截图看到旧代码的排序 bug。

## 决策记录

- 2026-11-04：用户选 B 方案（方案包 + 可运行 Web MVP）。执行排到 18:00 时间窗。
- 2026-11-04：否掉"全量同义词替换"，只保留 14 对语义等价词，避免替换改变事实。
- 2026-11-04：LLM 接入留到 v0.2；MVP 的差异点是"可验证"，不是"写得好看"。
