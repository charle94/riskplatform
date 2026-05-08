// Generic API client

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Feature types ───────────────────────────────────────────────────────────
export type Feature = {
  id: string;
  name: string;
  category: string;
  scene: string;
  source: string;
  status: string;
  version: string;
  iv: number;
  psi: number;
  usedBy: string[];
  creator: string;
  createTime: string;
  updateTime: string;
  desc: string;
  definition?: string;
};

export type DataSource = {
  id: string;
  name: string;
  type: string;
  tables: number;
  status: string;
  latency: string;
  lastSync: string;
  coverage: number;
  host?: string;
  port?: number;
  database?: string;
};

export type Task = {
  id: string;
  name: string;
  features: number;
  mode: string;
  cron: string;
  status: string;
  lastRun: string;
  duration: string;
  success: number;
};

export type Rule = {
  id: string;
  name: string;
  type: string;
  logic: string;
  action: string;
  priority: number;
  status: string;
  hitRate: number;
};

export type RuleMiningTreeNode = {
  condition: string;
  feature?: string;
  samples?: number;
  badRate?: number;
  isLeaf?: boolean;
  children?: RuleMiningTreeNode[];
};

export type RuleEvalItem = {
  rule: string;
  hitRate: number;
  badRate: number;
  passRateImpact: number;
  oddsImprove: number;
};

export type RuleCandidate = {
  rule: string;
  hitRate: string;
  badRate: string;
  action: string;
};

export type ColdStartTemplate = {
  id: string;
  name: string;
  category: string;
  params: string[];
  severity: string;
  desc: string;
};

export type RuleMiningOverview = {
  treeData: RuleMiningTreeNode;
  ruleEvalData: RuleEvalItem[];
  candidates: RuleCandidate[];
  coldStartTemplates: ColdStartTemplate[];
};

export type RuleMiningRunResponse = {
  success: boolean;
  message: string;
  result: {
    treeData: RuleMiningTreeNode;
    candidates: RuleCandidate[];
  };
};

export type RuleSimulationResult = {
  rules: Array<{
    id: string;
    name: string;
    hitRate: number;
    badRate: number;
  }>;
  overall: {
    passRateImpact: number;
    baseBadRate: number;
    afterBadRate: number;
    oddsImprove: number;
  };
};

export type RuleOptimizeResult = {
  runId: string;
  selectedRuleIds: string[];
  metrics: {
    passRateImpact: number;
    baseBadRate: number;
    afterBadRate: number;
    oddsImprove: number;
  };
};

export type FeatureVersion = {
  id: string;
  feature_id: string;
  version: string;
  payload: string;
  created_at: string;
  author: string;
  change_desc: string;
};

export type FeatureSuggestion = {
  name: string;
  sourceField: string;
  type: string;
  reason: string;
  score: number;
  iv: number;
  ks: number;
  definition?: string;
};

export type Alert = {
  id: string;
  level: string;
  feature: string;
  type: string;
  detail: string;
  time: string;
  status: string;
};

export type Stats = {
  totalFeatures: number;
  avgIV: string;
  stableRatio: string;
  pendingAlerts: number;
  highPriorityAlerts: number;
};

export type AnalysisOverview = {
  featureStats: Array<{
    name: string;
    missing: string;
    min: number;
    max: number;
    mean: number;
    std: number;
    p25: number;
    p75: number;
    skewness: number;
    kurtosis: number;
    status: string;
  }>;
  ivData: Array<{
    name: string;
    iv: number;
    ks: number;
    psi: number;
    auc: number;
    crossing: boolean;
  }>;
  distributionData: Array<{ bin: string; count: number; badRate: number }>;
  psiTrendData: Array<Record<string, string | number>>;
  psiTrendSeries: Array<{ key: string; name: string; status: string }>;
  stabilityCards: Array<{ label: string; value: string; pct: string; color: string }>;
  driftAlerts: Array<{ name: string; psi: number; reason: string }>;
};

export type MonitoringOverview = {
  apiMetrics: Array<{
    name: string;
    endpoint: string;
    qps: number;
    p99: string;
    successRate: number;
    status: string;
  }>;
  responseTimeTrend: Array<{ time: string; p50: number; p99: number; p999: number }>;
  successRateTrend: Array<{ time: string; rate: number }>;
  missingRateData: Array<{ name: string; rate: number; threshold: number; status: string }>;
  ivDecayData: Array<Record<string, string | number>>;
};

export type DashboardOverview = {
  featureTrendData: Array<{ month: string; total: number; active: number; new: number }>;
  ivDistData: Array<{ name: string; value: number; color: string }>;
  topFeatures: Array<{ name: string; iv: number; ks: number; psi: number; status: string }>;
  moduleCards: {
    featureDev: string;
    featureAnalysis: string;
    featureLibrary: string;
    monitoring: string;
    ruleMining: string;
  };
};

// ─── Features API ──────────────────────────────────────────────────────────
export const featuresApi = {
  list: (params?: { scene?: string; status?: string; category?: string; search?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<Feature[]>(`/api/features${q ? "?" + q : ""}`);
  },
  get: (id: string) => request<Feature>(`/api/features/${id}`),
  create: (data: Partial<Feature>) =>
    request<Feature>("/api/features", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Feature>) =>
    request<Feature>(`/api/features/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  versions: (id: string) => request<FeatureVersion[]>(`/api/features/${id}/versions`),
  rollback: (id: string, version: string, actor?: string) =>
    request<{ success: boolean; feature: Feature }>(`/api/features/${id}/rollback`, {
      method: "POST",
      body: JSON.stringify({ version, actor }),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/features/${id}`, { method: "DELETE" }),
};

// ─── Data Sources API ──────────────────────────────────────────────────────
export const datasourcesApi = {
  list: (search?: string) =>
    request<DataSource[]>(`/api/datasources${search ? "?search=" + encodeURIComponent(search) : ""}`),
  create: (data: Partial<DataSource>) =>
    request<DataSource>("/api/datasources", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<DataSource>) =>
    request<DataSource>(`/api/datasources/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/datasources/${id}`, { method: "DELETE" }),
};

// ─── Tasks API ─────────────────────────────────────────────────────────────
export const tasksApi = {
  list: () => request<Task[]>("/api/tasks"),
  create: (data: Partial<Task>) =>
    request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Task>) =>
    request<Task>(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggle: (id: string) =>
    request<Task>(`/api/tasks/${id}/toggle`, { method: "POST" }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
};

// ─── Rules API ─────────────────────────────────────────────────────────────
export const rulesApi = {
  list: () => request<Rule[]>("/api/rules"),
  create: (data: Partial<Rule>) =>
    request<Rule>("/api/rules", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Rule>) =>
    request<Rule>(`/api/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  versions: (id: string) =>
    request<Array<{ id: string; rule_id: string; version: string; payload: string; created_at: string; author: string; change_desc: string }>>(`/api/rules/${id}/versions`),
  rollback: (id: string, version: string, actor?: string) =>
    request<{ success: boolean; rule: Rule }>(`/api/rules/${id}/rollback`, {
      method: "POST",
      body: JSON.stringify({ version, actor }),
    }),
  simulate: (ruleIds: string[]) =>
    request<{ success: boolean; result: RuleSimulationResult }>("/api/rules/simulate", {
      method: "POST",
      body: JSON.stringify({ ruleIds }),
    }),
  optimize: (data: { objective?: string; maxPassImpact?: number; minBadRate?: number; maxRules?: number }) =>
    request<{ success: boolean; result: RuleOptimizeResult }>("/api/rules/optimize", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/api/rules/${id}`, { method: "DELETE" }),
};

export const ruleMiningApi = {
  overview: () => request<RuleMiningOverview>("/api/rule-mining/overview"),
  run: (data?: Record<string, unknown>) =>
    request<RuleMiningRunResponse>("/api/rule-mining/run", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  convertCandidate: (data: { rule: string; name?: string; action?: string }) =>
    request<{ success: boolean; rule: Rule }>("/api/rule-mining/candidates/convert", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  simulateCandidate: (data: { rule: string }) =>
    request<{ success: boolean; result: { hitRate: number; badRate: number; passRateImpact: number; oddsImprove: number } }>("/api/rule-mining/candidates/simulate", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  coldStart: () =>
    request<{ success: boolean; templates: ColdStartTemplate[]; recommendedCandidates: RuleCandidate[]; principle: string }>("/api/rule-mining/cold-start"),
};

export const featureDevApi = {
  preview: (data: { definition: string; limit?: number }) =>
    request<{ success: boolean; rows: Array<{ userId: string; label: number; value: number }>; stats: { sampleCount: number; coverage: number; iv: number; ks: number; psi: number; auc: number } }>("/api/feature-development/preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  validateSave: (data: {
    name: string;
    category: string;
    scene: string;
    source: string;
    desc?: string;
    creator?: string;
    definition: string;
  }) =>
    request<{ success: boolean; feature: Feature; preview: { rows: Array<{ userId: string; label: number; value: number }>; stats: { sampleCount: number; coverage: number; iv: number; ks: number; psi: number; auc: number } } }>("/api/feature-development/validate-save", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  suggestions: (topK?: number) =>
    request<{ success: boolean; recommendations: FeatureSuggestion[] }>(`/api/feature-suggestions${topK ? `?topK=${topK}` : ""}`),
};

export const experimentsApi = {
  championChallenger: (data: { name: string; championRuleIds: string[]; challengerRuleIds: string[]; sampleRate?: number }) =>
    request<{ success: boolean; result: { id: string; name: string; sampleRate: number; winner: string } }>("/api/experiments/champion-challenger", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const activitiesApi = {
  recent: (limit?: number) => request<Array<{ id: string; type: string; text: string; actor: string; time: string; module: string; detail: string }>>(`/api/activities/recent${limit ? `?limit=${limit}` : ""}`),
};

// ─── Alerts API ────────────────────────────────────────────────────────────
export const alertsApi = {
  list: () => request<Alert[]>("/api/alerts"),
  update: (id: string, data: Partial<Alert>) =>
    request<Alert>(`/api/alerts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
};

// ─── Stats API ─────────────────────────────────────────────────────────────
export const statsApi = {
  get: () => request<Stats>("/api/stats"),
};

export const analysisApi = {
  overview: () => request<AnalysisOverview>("/api/analysis/overview"),
};

export const monitoringApi = {
  overview: () => request<MonitoringOverview>("/api/monitoring/overview"),
};

export const dashboardApi = {
  overview: () => request<DashboardOverview>("/api/dashboard/overview"),
};
