# 简历 × JD 对齐 Agent（MVP v0.1）

粘一段 JD、一段简历，5 分钟拿到三件事：**这份岗能不能投**、**真实经历怎么往 JD 上对齐**、**JD 要但我没有的是什么、该拿什么话去补**。

核心约束：改写只做「重排 + 语义等价术语对齐」，**不产生任何新事实**。每处改动都记在 Fact Ledger 里，由独立的校验闸门逐条回原简历核对；JD 要而简历没有的，只进待补清单，绝不写进改写稿。

## 快速开始

```bash
# 需要 Node.js >= 20
npm install          # 只装构建期依赖（pdf.js / tesseract.js / puppeteer-core）
npm run vendor       # 生成 public/vendor/（约 25MB，离线运行时资源，不入库）
node src/server.js
# 浏览器打开 http://127.0.0.1:3080
```

也可以直接看演示：`http://127.0.0.1:3080/?demo=1`（自动填示例并跑一遍）。

```bash
node test/all.js   # 45 个用例
```

## 导入方式

| 输入 | 支持 |
|---|---|
| JD | 粘贴文本 / 上传 PDF、DOCX / 粘贴网页链接 / 截图 OCR |
| 简历 | 粘贴文本 / 上传 PDF、DOCX |

## 岗位池与推荐

分析过的 JD 会匿名入库（可关），按指纹去重、30 天时效。只填简历点「推荐岗位」，会从池子里挑 3 个匹配的岗位，附匹配度、命中能力、缺口，一键回填分析。

- 入库前自动脱敏（手机号 / 邮箱 / 微信 / 证件号）。
- 只存 JD，不存简历；数据在 `data/jdpool.sqlite`（已 gitignore）。
- 冷启动时明确标注「岗位池较小，推荐仅供参考」，不凑数。

## 导入细节

- OCR 与 PDF 全在浏览器本地跑，文件不出机器；OCR 结果会先填进输入框，由人核对再分析。
- 链接导入有 SSRF 防护；BOSS 直聘这类登录墙页面抓不到，会提示改用截图。
- 扫描版 PDF 没有文字层，需用截图识别。

## 流水线

```
JD 解析 ──► 证据匹配 ──► 对齐改写 ──► 防幻觉闸门 ──► 交付物
                              ▲            │
                              └── REVISE ──┘   (≤ max_round)
                                           └── BLOCK → 回退原文
```

| 阶段 | 文件 | 做什么 |
|---|---|---|
| ① JD 解析 | `src/engine/jdParse.js` | 硬门槛 / 核心能力（权重 1–5）/ 加分项 / 关键词库 / JD 自身缺陷；空 JD 直接 FATAL |
| ② 证据匹配 | `src/engine/match.js` | 逐条能力项在简历里找证据句，按「命中 + 动作动词 + 数字 + 结果词」打强证据 |
| ③ 对齐改写 | `src/engine/rewrite.js` | 只在连续条目内重排（标题行绝不动）+ 白名单同义术语替换 + 标无关项；逐条写 Fact Ledger |
| ④ 校验闸门 | `src/engine/gate.js` | V1 溯源 / V2 越权升格 / V3 数字与实体 / V4 覆盖与贴标签 / V5 缺失项泄漏 |
| 编排 | `src/engine/pipeline.js` | PASS / REVISE（≤3 轮）/ BLOCK（回退 1 次），依赖可注入以便测试 |

## 打分卡

| 维度 | 计算 | 权重 |
|---|---|---|
| 事实一致率 | 通过断言 / 总断言 × 100 | 0.4，**一票否决** |
| JD 对齐度 | 已回应 must 权重 / must 总权重 × 100 | 0.4 |
| 量化程度 | 含数字的证据句 / 证据句总数 × 100 | 0.2 |

结论（按优先级）：硬门槛不满足 → 不建议投递；事实一致率 < 100 → 不建议投递；must 有缺口或闸门未 PASS → 建议补充后投递；否则可投递。

## 目录

```
public/           前端（无构建步骤）；importers.js 负责 PDF/DOCX/OCR
public/vendor/    npm run vendor 生成的离线资源（不入库）
src/engine/       规则引擎（解析/匹配/改写/闸门/硬门槛）
src/fetcher.js    链接导入 + SSRF 防护
src/server.js     零依赖 HTTP 服务
test/             node:test 用例
docs/ PRD、项目状态、交付说明
plan/             任务树与路线图
log/ test/        实现日志与测试报告
```

## 已知限制

- 中文靠词库匹配，长尾岗位（细分行业/小众工具）会漏，会在 JD 解析里显式暴露，不会静默吞掉。
- 扫描版 PDF 没有文字层，需走截图 OCR；OCR 只认印刷体，识别结果需人工核对。
- 登录墙 / 强反爬站点（如 BOSS 直聘）的链接抓不到，会提示改用截图。
- 不做自由改写（LLM 重写句子）——v0.3 接模型后，规则引擎转为确定性闸门。

细节见 [docs/DELIVER.md](docs/DELIVER.md)、[docs/PRD.md](docs/PRD.md)、[plan/ROADMAP-v0.2.md](plan/ROADMAP-v0.2.md)。

细节见 [docs/DELIVER.md](docs/DELIVER.md)、[docs/PRD.md](docs/PRD.md)。
