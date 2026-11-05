// 能力词库：JD 侧抽取能力项、简历侧找证据，都靠这张表。
// 维护约定：name 是规范写法（改写时会用它对齐术语），aliases 是简历/JD 里可能出现的同义说法。
// 只收「可被事实核实」的能力；「学习能力强」这类软性描述尽量少收，收了也只在无证据时进待补清单。

export const COMPETENCIES = [
  // —— 产品 / 分析 ——
  { name: '需求分析', aliases: ['需求调研', '需求梳理', '需求拆解', '需求评审', '需求定义'], group: '产品' },
  { name: '用户调研', aliases: ['用户研究', '用户访谈', '访谈', '问卷', 'VOC', '用户反馈分析', '用户画像'], group: '产品' },
  { name: '竞品分析', aliases: ['竞对分析', '竞品调研', '竞品拆解'], group: '产品' },
  { name: '数据分析', aliases: ['数据洞察', '数据复盘', '数据监控', '数据回收'], group: '数据' },
  { name: '数据驱动', aliases: ['数据导向', '用数据说话', '数据决策'], group: '数据' },
  { name: '指标体系', aliases: ['北极星指标', '指标体系', '埋点', '数据看板', '看板'], group: '数据' },
  { name: 'A/B测试', aliases: ['AB测试', 'AB test', 'ABTest', '实验设计', '灰度实验', '灰度发布'], group: '数据' },
  { name: '用户增长', aliases: ['拉新', '留存', '促活', '召回', '增长策略'], group: '产品' },
  { name: '商业化', aliases: ['变现', '付费转化', '营收', '商业设计'], group: '产品' },
  { name: '产品设计', aliases: ['方案设计', '产品方案', '功能设计', '产品规划'], group: '产品' },
  { name: '原型设计', aliases: ['原型', '原型图', '线框图', 'Axure', 'Figma', '墨刀'], group: '产品' },
  { name: 'PRD', aliases: ['产品需求文档', '需求文档', '需求说明书'], group: '产品' },
  { name: '项目管理', aliases: ['项目推进', '项目协调', '进度管理', '项目落地', '排期'], group: '通用' },
  { name: '跨部门协作', aliases: ['跨团队协作', '跨部门沟通', '协同推进', '多方协作', '沟通协调'], group: '通用' },
  { name: '用户运营', aliases: ['社群运营', '用户生命周期', '用户分层'], group: '运营' },
  { name: '内容运营', aliases: ['内容策划', '内容生产', '内容策略'], group: '运营' },
  { name: 'B端产品', aliases: ['ToB', 'toB', '企业服务', 'SaaS'], group: '产品' },
  { name: 'C端产品', aliases: ['ToC', 'toC', '用户端产品'], group: '产品' },
  { name: 'AI产品', aliases: ['人工智能产品', 'AI产品经理'], group: 'AI' },

  // —— AI / 算法 ——
  { name: '大模型', aliases: ['LLM', '大语言模型', '大模型应用', 'GPT'], group: 'AI' },
  { name: 'Prompt工程', aliases: ['提示词工程', 'Prompt', '提示词', 'Prompt设计'], group: 'AI' },
  { name: 'RAG', aliases: ['检索增强', '知识库检索', '向量检索'], group: 'AI' },
  { name: 'Agent', aliases: ['智能体', 'AI Agent', 'Multi-Agent', '工作流编排'], group: 'AI' },
  { name: '机器学习', aliases: ['ML', '算法模型', '模型训练', '特征工程'], group: 'AI' },
  { name: '深度学习', aliases: ['神经网络', 'CNN', 'Transformer'], group: 'AI' },
  { name: '数据标注', aliases: ['标注', '数据清洗', '语料'], group: 'AI' },
  { name: '推荐系统', aliases: ['推荐算法', '个性化推荐'], group: 'AI' },
  { name: 'NLP', aliases: ['自然语言处理'], group: 'AI' },
  { name: '计算机视觉', aliases: ['CV', '图像识别', '多模态'], group: 'AI' },
  { name: '模型评测', aliases: ['效果评估', 'benchmark', '评测集', 'badcase'], group: 'AI' },

  // —— 技术 ——
  { name: 'SQL', aliases: ['sql', 'MySQL', '数据库查询'], group: '技术' },
  { name: 'Python', aliases: ['python'], group: '技术' },
  { name: 'Java', aliases: ['java'], group: '技术' },
  { name: 'Go', aliases: ['golang'], group: '技术' },
  { name: 'C++', aliases: ['cpp'], group: '技术' },
  { name: 'JavaScript', aliases: ['JS', 'TypeScript', 'ES6'], group: '技术' },
  { name: 'React', aliases: ['react'], group: '技术' },
  { name: 'Vue', aliases: ['vue'], group: '技术' },
  { name: 'Node.js', aliases: ['Node', 'nodejs'], group: '技术' },
  { name: 'Spring', aliases: ['SpringBoot', 'Spring Boot'], group: '技术' },
  { name: 'Redis', aliases: ['redis'], group: '技术' },
  { name: 'Kafka', aliases: ['kafka', '消息队列'], group: '技术' },
  { name: 'Docker', aliases: ['docker', '容器化'], group: '技术' },
  { name: 'Kubernetes', aliases: ['K8s', 'k8s'], group: '技术' },
  { name: '微服务', aliases: ['服务化', 'SOA', '服务治理'], group: '技术' },
  { name: '高并发', aliases: ['大流量', '高可用', '高QPS'], group: '技术' },
  { name: '分布式', aliases: ['分布式系统', '分布式事务'], group: '技术' },
  { name: '性能优化', aliases: ['性能调优', '优化性能', '压测'], group: '技术' },
  { name: '架构设计', aliases: ['系统设计', '技术方案', '技术选型'], group: '技术' },
  { name: '软件测试', aliases: ['测试用例', '功能测试', '接口测试'], group: '技术' },
  { name: '自动化测试', aliases: ['自动化', 'UI自动化', '自动化脚本'], group: '技术' },
  { name: 'DevOps', aliases: ['CI/CD', '持续集成', 'DevOps', '自动化部署'], group: '技术' },
  { name: 'Linux', aliases: ['linux', 'Shell', 'shell脚本'], group: '技术' },
  { name: 'Git', aliases: ['git', '版本控制'], group: '技术' },
  { name: '敏捷开发', aliases: ['Scrum', '敏捷', '迭代管理'], group: '通用' },

  // —— 通用 / 行业 ——
  { name: '团队管理', aliases: ['带团队', '团队搭建', '人员管理', '管理团队'], group: '通用' },
  { name: '沟通表达', aliases: ['汇报', '表达能力', '沟通能力', '演讲'], group: '通用' },
  { name: '学习能力', aliases: ['快速学习', '自学'], group: '通用' },
  { name: '抗压能力', aliases: ['抗压', '承压'], group: '通用' },
  { name: '英语', aliases: ['English', '英文', '英语六级'], group: '通用' },
  { name: '电商', aliases: ['电商平台', '零售', '交易'], group: '行业' },
  { name: '金融', aliases: ['金融科技', '银行', '证券'], group: '行业' },
  { name: '支付', aliases: ['收单', '结算', '支付通道'], group: '行业' },
  { name: '风控', aliases: ['反欺诈', '风险控制', '风控策略'], group: '行业' },
  { name: '在线教育', aliases: ['教育', '课程'], group: '行业' },
  { name: '医疗', aliases: ['医疗健康', '医药'], group: '行业' },
  { name: '游戏', aliases: ['游戏策划', '游戏运营', '小游戏', '休闲游戏', '游戏平台', '小游戏平台', 'H5游戏'], group: '行业' },
  { name: '平台生态', aliases: ['开放生态', '开放平台', '生态合作', '生态建设', '平台治理'], group: '产品' },
  { name: '社交', aliases: ['社区', '内容社区'], group: '行业' },
  { name: '广告', aliases: ['广告投放', '投放', '商业化广告'], group: '行业' },
  { name: '供应链', aliases: ['供应链管理', '仓配'], group: '行业' },
  { name: '客服', aliases: ['工单', '客服'], group: '行业' },
  { name: '服务意识', aliases: ['客户服务意识', '服务意识', '客户满意度'], group: '通用' },
  // —— 网络 / 技术支持 / 售前 ——
  { name: '网络工程', aliases: ['数通', '路由器', '交换机', '防火墙', 'TCP/IP', 'WLAN', '无线组网', '组网', '网络调优', 'AC/AP'], group: '技术' },
  { name: '网络排障', aliases: ['排障', '故障排查', '故障处理', '根因分析', '根因复盘', '问题定位'], group: '技术' },
  { name: '售后支持', aliases: ['售后', '技术支持', '售后支持', '现场实施', '客户支持'], group: '通用' },
  { name: '网络认证', aliases: ['HCIA', 'HCIP', 'HCIE', 'CCNA', 'CCNP'], group: '技术' },
  { name: '知识库', aliases: ['知识库', '排障手册', '案例库', '文档沉淀', '技术文档'], group: '通用' },
  { name: '技术培训', aliases: ['技术培训', '培训赋能', '赋能', '技术分享', '授课'], group: '通用' },
  { name: '售前支持', aliases: ['售前', '售前技术', '售前方案', '技术方案支持'], group: '产品' },
  { name: '招投标', aliases: ['招投标', '投标', '招标', '标书'], group: '通用' },
  { name: '商务谈判', aliases: ['商务谈判', '客户开拓', '市场开拓', '商务拓展'], group: '通用' },
  { name: '业务拓展', aliases: ['新业务', '业务开拓', '商业机会', '销售策略', 'BD', '渠道拓展'], group: '通用' },
  { name: '市场调研', aliases: ['市场研究', '市场分析', '行业研究', '市场洞察'], group: '产品' },
  // —— IT 审计 / 合规 ——
  { name: 'IT审计', aliases: ['IT Audit', '信息系统审计', 'IT审计', '鉴证'], group: '行业' },
  { name: '合规风控', aliases: ['合规', '风控', '内控', '风险控制'], group: '行业' },
  { name: '信息安全', aliases: ['CISSP', 'CISA', '信息安全', '等保'], group: '技术' },
  { name: 'Excel', aliases: ['excel'], group: '技术' },
  { name: '数据可视化', aliases: ['Tableau', 'Power BI', 'PowerBI', '可视化', '数据看板'], group: '数据' },
];

// 建索引：term(小写) -> { name, group }
// 注意：索引键和待匹配文本都要先 compact（去掉中英文之间的空格），
// 否则「AI 产品」这种带空格的写法会漏掉，JD 里明写的 AI 经验直接消失。
const compactCache = (s) =>
  String(s)
    .toLowerCase()
    .replace(/(\p{Script=Han})\s+([A-Za-z0-9])/gu, '$1$2')
    .replace(/([A-Za-z0-9])\s+(\p{Script=Han})/gu, '$1$2');

const TERM_INDEX = new Map();
for (const item of COMPETENCIES) {
  for (const term of [item.name, ...item.aliases]) {
    const key = compactCache(term);
    if (!TERM_INDEX.has(key)) {
      TERM_INDEX.set(key, { name: item.name, group: item.group, term });
    }
  }
}

// 长词优先，避免「AI产品」被「产品」抢走、「MySQL」被「SQL」抢走
const TERMS = [...TERM_INDEX.keys()].sort((a, b) => b.length - a.length);
const LATIN_RE = /[a-z0-9+#.]/i;

function isLatinStart(text, i) {
  return LATIN_RE.test(text[i]);
}

/**
 * 在一段文本里找能力词。返回 [{ name, term, start, end, group }]，同一位置只保留最长匹配。
 */
export function findCompetencies(text) {
  if (!text) return [];
  const lower = compactCache(text);
  const taken = [];
  const hits = [];
  for (const term of TERMS) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(term, from);
      if (idx === -1) break;
      from = idx + term.length;
      const end = idx + term.length;
      // 拉丁词做边界检查，避免 "ai" 命中 "said"
      if (isLatinStart(term, 0)) {
        const before = lower[idx - 1];
        const after = lower[end];
        const beforeOk = !before || !LATIN_RE.test(before);
        const afterOk = !after || !LATIN_RE.test(after);
        if (!(beforeOk && afterOk)) continue;
      }
      if (taken.some((s) => idx < s.end && end > s.start)) continue;
      taken.push({ start: idx, end });
      const meta = TERM_INDEX.get(term);
      hits.push({ name: meta.name, term, start: idx, end, group: meta.group });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** 文本命中的能力名（去重） */
export function competencyNames(text) {
  return [...new Set(findCompetencies(text).map((h) => h.name))];
}

/** 某个能力项的全部写法（含规范名），用于找证据 */
export function termsOf(name) {
  const item = COMPETENCIES.find((c) => c.name === name);
  if (!item) return [name];
  return [item.name, ...item.aliases];
}

/** 该能力是否在文本中出现（任意写法） */
export function mentionsCompetency(text, name) {
  if (!text) return false;
  const lower = compactCache(text);
  return termsOf(name).some((term) => {
    const t = compactCache(term);
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(t, from);
      if (idx === -1) return false;
      from = idx + t.length;
      if (isLatinStart(t, 0)) {
        const before = lower[idx - 1];
        const after = lower[idx + t.length];
        if ((before && LATIN_RE.test(before)) || (after && LATIN_RE.test(after))) continue;
      }
      return true;
    }
  });
}

export const GROUP_ORDER = ['产品', '数据', 'AI', '技术', '运营', '行业', '通用'];
