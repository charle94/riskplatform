import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area, Cell,
} from "recharts";
import {
  AlertTriangle, CheckCircle2, Clock, Zap, TrendingDown, Bell,
  ArrowUpRight, RefreshCw,
} from "lucide-react";
import { alertsApi, monitoringApi } from "../../../api";
import type { Alert, MonitoringOverview } from "../../../api";
import { toast } from "sonner";

const tabs = ["运行状态监控", "数据质量监控", "效果衰减预警"];

const levelColor: Record<string, string> = {
  "严重": "bg-red-100 text-red-700",
  "告警": "bg-amber-100 text-amber-700",
  "提示": "bg-blue-100 text-blue-600",
};

export function FeatureMonitoring() {
  const [activeTab, setActiveTab] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [overview, setOverview] = useState<MonitoringOverview | null>(null);

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try { const data = await alertsApi.list(); setAlerts(data); }
    catch { toast.error("加载告警失败"); }
    finally { setAlertsLoading(false); }
  };

  const loadOverview = async () => {
    try {
      const data = await monitoringApi.overview();
      setOverview(data);
    } catch {
      toast.error("加载监控指标失败");
    }
  };

  useEffect(() => { loadAlerts(); void loadOverview(); }, []);

  const handleUpdateAlertStatus = async (id: string, newStatus: string) => {
    try {
      const updated = await alertsApi.update(id, { status: newStatus });
      setAlerts(prev => prev.map(a => a.id === id ? updated : a));
      toast.success(`告警已标记为「${newStatus}」`);
    } catch { toast.error("状态更新失败"); }
  };

  const activeAlertCount = alerts.filter(a => a.status === "未处理" || a.status === "处理中").length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 font-semibold text-xl">监控运维</h1>
          <p className="text-slate-500 text-sm mt-0.5">特征健康监护仪 · 确保生产环境稳定运行</p>
        </div>
        <div className="flex items-center gap-2">
          {activeAlertCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
              <Bell size={12} className="text-amber-600" />
              <span className="text-amber-700 text-xs font-medium">{activeAlertCount} 个活跃告警</span>
            </div>
          )}
          <button onClick={loadAlerts} disabled={alertsLoading} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={13} className={alertsLoading ? "animate-spin" : ""} /> 刷新
          </button>
        </div>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-5 gap-3">
          {[
            { label: "服务可用率", value: overview ? `${Math.max(...overview.apiMetrics.map(m => m.successRate)).toFixed(2)}%` : "—", icon: CheckCircle2, color: "emerald", sub: "近24小时" },
            { label: "总调用QPS", value: overview ? String(overview.apiMetrics.reduce((sum, m) => sum + m.qps, 0)) : "—", icon: Zap, color: "blue", sub: "当前" },
            { label: "P99响应时间", value: overview ? overview.apiMetrics[0]?.p99 || "—" : "—", icon: Clock, color: "violet", sub: "整体" },
            { label: "数据质量告警", value: overview ? String(overview.missingRateData.filter(x => x.status !== "正常").length) : "—", icon: AlertTriangle, color: "amber", sub: "未处理" },
            { label: "效果衰减特征", value: overview ? String(Object.keys((overview.ivDecayData[0] || {})).filter(k => k !== "month").length) : "—", icon: TrendingDown, color: "red", sub: "需关注" },
          ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-500 text-xs">{s.label}</p>
              <div className={`p-1.5 rounded-lg ${s.color === "emerald" ? "bg-emerald-50 text-emerald-600" : s.color === "blue" ? "bg-blue-50 text-blue-600" : s.color === "violet" ? "bg-violet-50 text-violet-600" : s.color === "amber" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                <s.icon size={13} />
              </div>
            </div>
            <p className={`text-xl font-bold ${s.color === "emerald" ? "text-emerald-600" : s.color === "blue" ? "text-slate-900" : s.color === "violet" ? "text-slate-900" : s.color === "amber" ? "text-amber-600" : "text-red-600"}`}>{s.value}</p>
            <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Alert List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-slate-800 font-semibold text-sm">告警列表</h3>
          <span className="text-xs text-slate-400">共 {alerts.length} 条</span>
        </div>
        {alertsLoading ? (
          <div className="py-8 text-center text-slate-400 text-sm">加载中...</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {alerts.map(alert => (
              <div key={alert.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${levelColor[alert.level]}`}>{alert.level}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-800 font-medium">{alert.feature}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{alert.type}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{alert.detail}</p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{alert.time}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${alert.status === "未处理" ? "bg-red-50 text-red-600" : alert.status === "处理中" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400"}`}>{alert.status}</span>
                <div className="flex gap-1 flex-shrink-0">
                  {alert.status === "未处理" && (
                    <button onClick={() => handleUpdateAlertStatus(alert.id, "处理中")} className="text-xs px-2 py-1 bg-amber-50 text-amber-600 rounded hover:bg-amber-100">标记处理中</button>
                  )}
                  {alert.status !== "已处理" && (
                    <button onClick={() => handleUpdateAlertStatus(alert.id, "已处理")} className="text-xs px-2 py-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100">标记已处理</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map((tab, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab 0: Runtime */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-slate-800 font-semibold text-sm mb-1">响应时间趋势</h3>
              <p className="text-slate-400 text-xs mb-4">近2小时 P50/P99/P999 延迟（ms）</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={overview?.responseTimeTrend || []} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <ReferenceLine y={200} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} dot={false} name="P50" />
                  <Line type="monotone" dataKey="p99" stroke="#3b82f6" strokeWidth={2} dot={false} name="P99" />
                  <Line type="monotone" dataKey="p999" stroke="#ef4444" strokeWidth={2} dot={false} name="P999" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-slate-800 font-semibold text-sm mb-1">成功率趋势</h3>
              <p className="text-slate-400 text-xs mb-4">近2小时整体调用成功率</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={overview?.successRateTrend || []} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[95, 100]} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [`${v}%`, "成功率"]} />
                  <ReferenceLine y={99} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} fill="url(#rateGrad)" name="成功率" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-slate-800 font-semibold text-sm">特征服务健康状态</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["服务名称", "接口路径", "QPS", "P99延迟", "成功率", "状态"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs text-slate-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(overview?.apiMetrics || []).map(m => (
                  <tr key={m.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm text-slate-800 font-medium">{m.name}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 font-mono">{m.endpoint}</td>
                    <td className="px-5 py-3 text-sm text-slate-700">{m.qps.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium ${parseInt(m.p99) > 200 ? "text-red-600" : "text-slate-700"}`}>{m.p99}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${m.successRate >= 99 ? "bg-emerald-500" : m.successRate >= 98 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(m.successRate, 100)}%` }}></div>
                        </div>
                        <span className={`text-xs font-medium ${m.successRate >= 99 ? "text-emerald-600" : "text-amber-600"}`}>{m.successRate}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1 w-fit text-xs px-2 py-0.5 rounded-full font-medium ${m.status === "正常" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                        {m.status === "正常" ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 1: Data Quality */}
      {activeTab === 1 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-slate-800 font-semibold text-sm mb-1">特征缺失率监控</h3>
          <p className="text-slate-400 text-xs mb-4">红色条形为超过阈值的特征，绿色为正常</p>
          <ResponsiveContainer width="100%" height={300}>
              <BarChart data={overview?.missingRateData || []} layout="vertical" margin={{ top: 5, right: 60, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 35]} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [`${v}%`, "缺失率"]} />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]} name="缺失率">
                {(overview?.missingRateData || []).map((entry, index) => (
                  <Cell key={index} fill={entry.status === "严重" ? "#ef4444" : entry.status === "告警" ? "#f59e0b" : "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {(overview?.missingRateData || []).filter(d => d.status !== "正常").map(d => (
              <div key={d.name} className={`flex items-center gap-3 p-3 rounded-lg ${d.status === "严重" ? "bg-red-50 border border-red-200" : "bg-amber-50 border border-amber-200"}`}>
                <AlertTriangle size={14} className={d.status === "严重" ? "text-red-600" : "text-amber-600"} />
                <span className="text-sm font-medium text-slate-800">{d.name}</span>
                <span className={`text-xs font-semibold ${d.status === "严重" ? "text-red-600" : "text-amber-600"}`}>缺失率 {d.rate}%</span>
                <span className="text-xs text-slate-400">阈值: {d.threshold}%</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${d.status === "严重" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{d.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Effect Decay */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-slate-800 font-semibold text-sm mb-1">IV值衰减趋势</h3>
            <p className="text-slate-400 text-xs mb-4">主要特征月度IV值变化（自动月度计算）</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={overview?.ivDecayData || []} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0.2, 0.55]} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="F1" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="近30日逾期天数" />
                <Line type="monotone" dataKey="F2" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="征信硬查询次数" />
                <Line type="monotone" dataKey="F3" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="夜间交易占比" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(() => {
              const rows = overview?.ivDecayData || [];
              const first = rows[0] || {};
              const last = rows[rows.length - 1] || {};
              const keys = Object.keys(last).filter(k => k !== "month").slice(0, 3);
              return keys.map((key, idx) => {
                const ivStart = Number(first[key] || 0);
                const ivEnd = Number(last[key] || 0);
                const decay = ivStart ? Number((((ivEnd - ivStart) / ivStart) * 100).toFixed(1)) : 0;
                const nameMap = ["近30日逾期天数最大值", "征信硬查询近6月次数", "夜间交易金额占比"];
                const suggestion = decay < -20 ? "衰减显著，建议重新审视定义逻辑" : decay < -10 ? "衰减较快，建议复核时间窗口" : "衰减在合理范围，暂不需要处理";
                return { name: nameMap[idx] || key, ivStart, ivEnd, decay, suggestion };
              });
            })().map(f => (
              <div key={f.name} className={`bg-white border rounded-xl p-4 ${f.decay < -20 ? "border-red-200" : f.decay < -10 ? "border-amber-200" : "border-slate-200"}`}>
                <div className="text-sm text-slate-800 font-medium mb-2">{f.name}</div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-center">
                    <div className="text-xs text-slate-400">基准IV</div>
                    <div className="text-sm font-bold text-slate-700">{f.ivStart.toFixed(3)}</div>
                  </div>
                  <ArrowUpRight size={16} className="text-red-400 rotate-90" />
                  <div className="text-center">
                    <div className="text-xs text-slate-400">最新IV</div>
                    <div className="text-sm font-bold text-slate-700">{f.ivEnd.toFixed(3)}</div>
                  </div>
                  <div className="ml-auto text-center">
                    <div className="text-xs text-slate-400">变化</div>
                    <div className={`text-sm font-bold ${f.decay < -20 ? "text-red-600" : f.decay < -10 ? "text-amber-600" : "text-slate-600"}`}>{f.decay}%</div>
                  </div>
                </div>
                <div className={`text-xs p-2 rounded-lg ${f.decay < -20 ? "bg-red-50 text-red-700" : f.decay < -10 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
                  {f.suggestion}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
