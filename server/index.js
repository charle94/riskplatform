import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────
// In-memory data store
// ─────────────────────────────────────────

const store = {
  features: [
    { id: "FT_CREDIT_001", name: "近30日逾期天数最大值", category: "信用历史", scene: "贷前", source: "征信数据", status: "上线", version: "v2.3", iv: 0.487, psi: 0.08, usedBy: ["贷前评分卡", "LightGBM模型"], creator: "张建模", createTime: "2025-06-12", updateTime: "2026-01-08", desc: "用户近30日内最大逾期天数，来源于人行征信报告M期字段" },
    { id: "FT_CREDIT_002", name: "征信硬查询近6月次数", category: "信用历史", scene: "贷前", source: "征信数据", status: "上线", version: "v1.8", iv: 0.356, psi: 0.11, usedBy: ["贷前评分卡"], creator: "李风控", createTime: "2025-03-20", updateTime: "2025-12-01", desc: "近6个月内被金融机构查询征信的次数，反映多头借贷风险" },
    { id: "FT_BEH_001", name: "夜间交易金额占比", category: "行为特征", scene: "反欺诈", source: "行为埋点", status: "上线", version: "v1.2", iv: 0.312, psi: 0.28, usedBy: ["反欺诈规则引擎", "XGBoost模型"], creator: "王分析", createTime: "2025-08-15", updateTime: "2026-03-10", desc: "22:00-06:00时间段内交易金额占全日交易总额比例" },
    { id: "FT_BEH_002", name: "近3月消费金额均值", category: "行为特征", scene: "贷前", source: "行为埋点", status: "上线", version: "v2.1", iv: 0.298, psi: 0.09, usedBy: ["贷前评分卡", "额度模型"], creator: "张建模", createTime: "2025-05-18", updateTime: "2026-02-14", desc: "近90日消费交易的日均金额，用于刻画用户消费能力" },
    { id: "FT_DEVICE_001", name: "设备指纹风险评分", category: "设备特征", scene: "反欺诈", source: "设备指纹服务", status: "上线", version: "v3.0", iv: 0.276, psi: 0.07, usedBy: ["反欺诈规则引擎"], creator: "赵安全", createTime: "2024-12-01", updateTime: "2026-04-01", desc: "第三方设备指纹服务输出的设备综合风险评分 0-100" },
    { id: "FT_CREDIT_003", name: "历史逾期标记天数", category: "信用历史", scene: "贷前", source: "征信数据", status: "下线", version: "v1.0", iv: 0.634, psi: 0.03, usedBy: [], creator: "李风控", createTime: "2024-09-10", updateTime: "2025-11-20", desc: "【已下线-穿越风险】历史上最长连续逾期天数，存在特征穿越风险" },
    { id: "FT_BEH_003", name: "近7日设备更换次数", category: "行为特征", scene: "反欺诈", source: "行为埋点", status: "测试中", version: "v1.0", iv: 0.231, psi: 0.05, usedBy: [], creator: "王分析", createTime: "2026-04-10", updateTime: "2026-04-18", desc: "近7日内用户登录设备发生变更的次数，反映账号安全风险" },
    { id: "FT_MULTI_001", name: "多头借贷申请次数", category: "多头行为", scene: "贷前", source: "三方数据", status: "测试中", version: "v1.0", iv: 0.562, psi: 0.04, usedBy: [], creator: "赵安全", createTime: "2026-04-15", updateTime: "2026-04-18", desc: "【待排查穿越】近3个月向多家机构申请借款次数，疑存在穿越风险" },
  ],

  datasources: [
    { id: "DS001", name: "业务核心库", type: "MySQL", tables: 48, status: "正常", latency: "12ms", lastSync: "09:30:05", coverage: 98, host: "db-core.internal", port: 3306, database: "core_db" },
    { id: "DS002", name: "用户行为埋点", type: "Hive", tables: 126, status: "正常", latency: "—", lastSync: "每日00:30", coverage: 95, host: "hive.internal", port: 10000, database: "behavior_db" },
    { id: "DS003", name: "征信数据（人行）", type: "API", tables: 8, status: "正常", latency: "280ms", lastSync: "实时", coverage: 87, host: "credit.api.cn", port: 443, database: "" },
    { id: "DS004", name: "三方行为评分", type: "API", tables: 12, status: "告警", latency: "1200ms", lastSync: "09:28:12", coverage: 72, host: "behavior.thirdparty.com", port: 443, database: "" },
    { id: "DS005", name: "设备指纹服务", type: "Kafka", tables: 3, status: "正常", latency: "8ms", lastSync: "实时", coverage: 99, host: "kafka.internal", port: 9092, database: "device_topic" },
    { id: "DS006", name: "外部爬虫数据", type: "HDFS", tables: 34, status: "离线", latency: "—", lastSync: "03:00:00", coverage: 61, host: "hdfs.internal", port: 8020, database: "/data/crawler" },
  ],

  tasks: [
    { id: "JOB001", name: "贷前特征日批任务", features: 186, mode: "离线", cron: "每日 01:00", status: "运行中", lastRun: "2026-04-19 01:00", duration: "42min", success: 184 },
    { id: "JOB002", name: "实时特征流计算", features: 48, mode: "实时", cron: "持续运行", status: "运行中", lastRun: "—", duration: "—", success: 48 },
    { id: "JOB003", name: "贷后催收特征周批", features: 72, mode: "离线", cron: "每周一 02:00", status: "等待中", lastRun: "2026-04-13 02:00", duration: "1h28min", success: 72 },
    { id: "JOB004", name: "反欺诈特征小时批", features: 34, mode: "离线", cron: "每小时", status: "暂停", lastRun: "2026-04-18 23:00", duration: "8min", success: 32 },
  ],

  rules: [
    { id: "R001", name: "黑名单拦截", type: "单条规则", logic: "user_id IN 黑名单库", action: "拒绝", priority: 1, status: "上线", hitRate: 1.2 },
    { id: "R002", name: "多头借贷高风险", type: "规则集(AND)", logic: "多头借贷申请次数 > 8 AND 近30日硬查询 ≥ 5", action: "拒绝", priority: 2, status: "上线", hitRate: 4.8 },
    { id: "R003", name: "夜间设备双高", type: "规则集(AND)", logic: "夜间交易占比 ≥ 60% AND 设备指纹风险评分 ≥ 60", action: "人工审核", priority: 3, status: "上线", hitRate: 2.6 },
    { id: "R004", name: "新用户高额申请", type: "规则集(AND)", logic: "注册时长 ≤ 30天 AND 申请金额 ≥ 50000", action: "降额", priority: 4, status: "测试中", hitRate: 3.1 },
    { id: "R005", name: "疑似账号异常", type: "规则表", logic: "设备更换次数 ≥ 3 OR IP变更次数 ≥ 5 OR 时段异常登录", action: "人工审核", priority: 5, status: "上线", hitRate: 1.8 },
  ],

  alerts: [
    { id: "AL001", level: "严重", feature: "收入预测分", type: "数据质量", detail: "缺失率 32.1% 超过阈值 10%", time: "09:28:12", status: "未处理" },
    { id: "AL002", level: "告警", feature: "三方行为评分", type: "接口响应", detail: "P99延迟 312ms，超过阈值 200ms", time: "09:50:03", status: "处理中" },
    { id: "AL003", level: "告警", feature: "夜间交易占比", type: "稳定性", detail: "PSI = 0.28，超过阈值 0.2", time: "昨日 23:00", status: "已处理" },
    { id: "AL004", level: "提示", feature: "征信硬查询次数", type: "效果衰减", detail: "IV值月环比下降 4.2%，连续3月下滑", time: "昨日 08:00", status: "已处理" },
    { id: "AL005", level: "提示", feature: "借款金额申请比", type: "稳定性", detail: "PSI = 0.31，超过阈值 0.2", time: "2日前", status: "已处理" },
  ],
};

// ─────────────────────────────────────────
// Helper: generate feature ID
// ─────────────────────────────────────────
function generateFeatureId(category) {
  const prefixMap = {
    "信用历史": "FT_CREDIT",
    "行为特征": "FT_BEH",
    "设备特征": "FT_DEVICE",
    "多头行为": "FT_MULTI",
  };
  const prefix = prefixMap[category] || "FT_CUSTOM";
  const num = String(store.features.length + 1).padStart(3, "0");
  return `${prefix}_${num}`;
}

// ─────────────────────────────────────────
// Features Routes
// ─────────────────────────────────────────
app.get("/api/features", (req, res) => {
  const { scene, status, category, search } = req.query;
  let features = [...store.features];
  if (scene && scene !== "全部") features = features.filter(f => f.scene === scene);
  if (status && status !== "全部") features = features.filter(f => f.status === status);
  if (category && category !== "全部") features = features.filter(f => f.category === category);
  if (search) features = features.filter(f => f.name.includes(search) || f.id.includes(search));
  res.json(features);
});

app.get("/api/features/:id", (req, res) => {
  const feature = store.features.find(f => f.id === req.params.id);
  if (!feature) return res.status(404).json({ error: "Feature not found" });
  res.json(feature);
});

app.post("/api/features", (req, res) => {
  const { name, category, scene, source, desc, iv, psi, creator } = req.body;
  if (!name || !category) return res.status(400).json({ error: "name and category are required" });
  const today = new Date().toISOString().slice(0, 10);
  const newFeature = {
    id: generateFeatureId(category),
    name,
    category,
    scene: scene || "贷前",
    source: source || "",
    status: "测试中",
    version: "v1.0",
    iv: typeof iv === "number" ? iv : 0,
    psi: typeof psi === "number" ? psi : 0,
    usedBy: [],
    creator: creator || "系统",
    createTime: today,
    updateTime: today,
    desc: desc || "",
  };
  store.features.push(newFeature);
  res.status(201).json(newFeature);
});

app.put("/api/features/:id", (req, res) => {
  const idx = store.features.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Feature not found" });
  const today = new Date().toISOString().slice(0, 10);
  store.features[idx] = { ...store.features[idx], ...req.body, id: req.params.id, updateTime: today };
  res.json(store.features[idx]);
});

app.delete("/api/features/:id", (req, res) => {
  const idx = store.features.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Feature not found" });
  store.features.splice(idx, 1);
  res.json({ success: true });
});

// ─────────────────────────────────────────
// Data Sources Routes
// ─────────────────────────────────────────
app.get("/api/datasources", (req, res) => {
  const { search } = req.query;
  let sources = [...store.datasources];
  if (search) sources = sources.filter(d => d.name.includes(search));
  res.json(sources);
});

app.post("/api/datasources", (req, res) => {
  const { name, type, host, port, database, coverage } = req.body;
  if (!name || !type) return res.status(400).json({ error: "name and type are required" });
  const num = String(store.datasources.length + 1).padStart(3, "0");
  const newDS = {
    id: `DS${num}`,
    name,
    type,
    tables: 0,
    status: "正常",
    latency: "—",
    lastSync: "—",
    coverage: typeof coverage === "number" ? coverage : 0,
    host: host || "",
    port: port || 0,
    database: database || "",
  };
  store.datasources.push(newDS);
  res.status(201).json(newDS);
});

app.put("/api/datasources/:id", (req, res) => {
  const idx = store.datasources.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "DataSource not found" });
  store.datasources[idx] = { ...store.datasources[idx], ...req.body, id: req.params.id };
  res.json(store.datasources[idx]);
});

app.delete("/api/datasources/:id", (req, res) => {
  const idx = store.datasources.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "DataSource not found" });
  store.datasources.splice(idx, 1);
  res.json({ success: true });
});

// ─────────────────────────────────────────
// Tasks Routes
// ─────────────────────────────────────────
app.get("/api/tasks", (req, res) => {
  res.json(store.tasks);
});

app.post("/api/tasks", (req, res) => {
  const { name, features, mode, cron } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const num = String(store.tasks.length + 1).padStart(3, "0");
  const newTask = {
    id: `JOB${num}`,
    name,
    features: typeof features === "number" ? features : 0,
    mode: mode || "离线",
    cron: cron || "每日 00:00",
    status: "等待中",
    lastRun: "—",
    duration: "—",
    success: 0,
  };
  store.tasks.push(newTask);
  res.status(201).json(newTask);
});

app.put("/api/tasks/:id", (req, res) => {
  const idx = store.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found" });
  store.tasks[idx] = { ...store.tasks[idx], ...req.body, id: req.params.id };
  res.json(store.tasks[idx]);
});

app.post("/api/tasks/:id/toggle", (req, res) => {
  const idx = store.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found" });
  const task = store.tasks[idx];
  if (task.status === "暂停") {
    task.status = "运行中";
  } else if (task.status === "运行中" || task.status === "等待中") {
    task.status = "暂停";
  }
  res.json(task);
});

app.delete("/api/tasks/:id", (req, res) => {
  const idx = store.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Task not found" });
  store.tasks.splice(idx, 1);
  res.json({ success: true });
});

// ─────────────────────────────────────────
// Rules Routes
// ─────────────────────────────────────────
app.get("/api/rules", (req, res) => {
  res.json(store.rules);
});

app.post("/api/rules", (req, res) => {
  const { name, type, logic, action, priority } = req.body;
  if (!name || !logic) return res.status(400).json({ error: "name and logic are required" });
  const num = String(store.rules.length + 1).padStart(3, "0");
  const newRule = {
    id: `R${num}`,
    name,
    type: type || "单条规则",
    logic,
    action: action || "拒绝",
    priority: priority || store.rules.length + 1,
    status: "测试中",
    hitRate: 0,
  };
  store.rules.push(newRule);
  res.status(201).json(newRule);
});

app.put("/api/rules/:id", (req, res) => {
  const idx = store.rules.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Rule not found" });
  store.rules[idx] = { ...store.rules[idx], ...req.body, id: req.params.id };
  res.json(store.rules[idx]);
});

app.delete("/api/rules/:id", (req, res) => {
  const idx = store.rules.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Rule not found" });
  store.rules.splice(idx, 1);
  res.json({ success: true });
});

// ─────────────────────────────────────────
// Alerts Routes
// ─────────────────────────────────────────
app.get("/api/alerts", (req, res) => {
  res.json(store.alerts);
});

app.put("/api/alerts/:id", (req, res) => {
  const idx = store.alerts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Alert not found" });
  store.alerts[idx] = { ...store.alerts[idx], ...req.body, id: req.params.id };
  res.json(store.alerts[idx]);
});

// ─────────────────────────────────────────
// Stats Route
// ─────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  const features = store.features;
  const onlineFeatures = features.filter(f => f.status === "上线");
  const avgIV = onlineFeatures.length > 0
    ? onlineFeatures.reduce((sum, f) => sum + f.iv, 0) / onlineFeatures.length
    : 0;
  const stableFeatures = onlineFeatures.filter(f => f.psi < 0.2);
  const stableRatio = onlineFeatures.length > 0
    ? (stableFeatures.length / onlineFeatures.length) * 100
    : 0;
  const pendingAlerts = store.alerts.filter(a => a.status === "未处理" || a.status === "处理中");

  res.json({
    totalFeatures: features.length,
    avgIV: avgIV.toFixed(3),
    stableRatio: stableRatio.toFixed(1) + "%",
    pendingAlerts: pendingAlerts.length,
    highPriorityAlerts: pendingAlerts.filter(a => a.level === "严重").length,
  });
});

// ─────────────────────────────────────────
// Start server
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  API server running at http://localhost:${PORT}`);
});
