import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Database, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  ArrowUpRight, ArrowDownRight, Layers, Zap, Shield, GitBranch,
} from "lucide-react";
import { useNavigate } from "react-router";
import { activitiesApi, dashboardApi, statsApi } from "../../../api";
import type { DashboardOverview, Stats } from "../../../api";

const kpiData = [
  { label: "特征总数", valueKey: "totalFeatures" as const, sub: "所有已登记特征", icon: Database, color: "blue", trend: "up" },
  { label: "平均IV值", valueKey: "avgIV" as const, sub: "全库平均", icon: TrendingUp, color: "emerald", trend: "up" },
  { label: "稳定特征占比", valueKey: "stableRatio" as const, sub: "PSI ≤ 0.2", icon: CheckCircle2, color: "violet", trend: "up" },
  { label: "待处理告警", valueKey: "pendingAlerts" as const, sub: "未处理 + 处理中", icon: AlertTriangle, color: "amber", trend: "up" },
];

const recentActivitiesDefault = [
  { type: "add", text: "新增特征「近7日设备更换次数」", user: "李建模", time: "10分钟前", module: "特征开发" },
  { type: "warn", text: "特征「夜间交易占比」PSI=0.28 超阈值告警", user: "系统", time: "35分钟前", module: "监控运维" },
  { type: "rule", text: "规则「多头借贷风险评分>85」已上线", user: "王策略", time: "1小时前", module: "规则挖掘" },
  { type: "eval", text: "批量评估任务「Q1特征集」完成，共142个", user: "张建模", time: "2小时前", module: "特征分析" },
  { type: "warn", text: "特征「三方数据_征信查询次数」缺失率=32%", user: "系统", time: "3小时前", module: "监控运维" },
  { type: "add", text: "数据源「外部行为数据V3」接入成功", user: "赵数据", time: "4小时前", module: "特征开发" },
];

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  violet: "bg-violet-50 text-violet-600 border-violet-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
};

const activityColors: Record<string, string> = {
  add: "bg-blue-100 text-blue-600",
  warn: "bg-amber-100 text-amber-600",
  rule: "bg-violet-100 text-violet-600",
  eval: "bg-emerald-100 text-emerald-600",
};

const activityIcons: Record<string, React.ReactNode> = {
  add: <Database size={12} />,
  warn: <AlertTriangle size={12} />,
  rule: <GitBranch size={12} />,
  eval: <TrendingUp size={12} />,
};

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentActivities, setRecentActivities] = useState(recentActivitiesDefault);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);

  useEffect(() => {
    statsApi.get().then(setStats).catch(() => {});
    dashboardApi.overview().then(setOverview).catch(() => {});
    activitiesApi.recent(6)
      .then(rows => {
        setRecentActivities(rows.map(r => ({
          type: r.type.includes("warn") || r.type.includes("alert") ? "warn" : r.type.includes("rule") ? "rule" : r.type.includes("eval") ? "eval" : "add",
          text: r.text,
          user: r.actor,
          time: r.time,
          module: r.module,
        })));
      })
      .catch(() => {});
  }, []);

  const getKpiValue = (key: keyof Stats): string => {
    if (!stats) return "—";
    const v = stats[key];
    if (key === "avgIV") {
      const num = typeof v === 'string' ? parseFloat(v) : Number(v);
      return isNaN(num) ? "—" : num.toFixed(3);
    }
    if (key === "stableRatio") {
      const val = String(v);
      return val.includes('%') ? val : `${val}%`;
    }
    if (key === "totalFeatures") {
      const num = typeof v === 'number' ? v : parseInt(String(v), 10);
      return isNaN(num) ? "—" : num.toLocaleString();
    }
    return String(v);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 font-semibold text-xl">平台概览</h1>
          <p className="text-slate-500 text-sm mt-0.5">智能特征分析平台 · 风控策略燃料工坊 · 数据更新于 {new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/feature-dev")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Zap size={14} />
            快速开发特征
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpiData.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-500 text-xs font-medium">{kpi.label}</p>
                <p className="text-slate-900 text-2xl font-bold mt-1">{getKpiValue(kpi.valueKey)}</p>
                <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${kpi.trend === "up" && kpi.color !== "amber" ? "text-emerald-600" : kpi.trend === "down" ? "text-red-500" : "text-amber-600"}`}>
                  {kpi.trend === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {kpi.sub}
                </div>
              </div>
              <div className={`p-2.5 rounded-xl border ${colorMap[kpi.color]}`}>
                <kpi.icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Feature Trend */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-slate-800 font-semibold text-sm">特征数量趋势</h3>
              <p className="text-slate-400 text-xs mt-0.5">近6个月特征规模变化</p>
            </div>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block rounded"></span>总量</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded"></span>活跃</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={overview?.featureTrendData || []} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[900, 1300]} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} fill="url(#totalGrad)" name="特征总量" />
              <Area type="monotone" dataKey="active" stroke="#10b981" strokeWidth={2} fill="url(#activeGrad)" name="活跃特征" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* IV Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="mb-4">
            <h3 className="text-slate-800 font-semibold text-sm">IV值分布</h3>
            <p className="text-slate-400 text-xs mt-0.5">全库特征质量分层</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={overview?.ivDistData || []} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2} dataKey="value">
                {(overview?.ivDistData || []).map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [`${v}个`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {(overview?.ivDistData || []).map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }}></span>
                  <span className="text-slate-600 truncate max-w-[130px]">{d.name}</span>
                </div>
                <span className="text-slate-800 font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Top Features */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-slate-800 font-semibold text-sm">Top 5 高效特征</h3>
              <p className="text-slate-400 text-xs mt-0.5">按IV值排序</p>
            </div>
            <button onClick={() => navigate("/feature-library")} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              查看全部 <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-5 text-xs text-slate-400 font-medium pb-2 border-b border-slate-100">
              <span className="col-span-2">特征名称</span>
              <span className="text-center">IV值</span>
              <span className="text-center">KS值</span>
              <span className="text-center">状态</span>
            </div>
            {(overview?.topFeatures || []).map((f, i) => (
              <div key={i} className="grid grid-cols-5 text-sm items-center py-1.5 hover:bg-slate-50 rounded-lg px-1 transition-colors">
                <div className="col-span-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-bold flex-shrink-0">{i + 1}</span>
                  <span className="text-slate-700 truncate text-xs">{f.name}</span>
                </div>
                <div className="text-center">
                  <span className={`text-xs font-semibold ${f.iv >= 0.3 ? "text-violet-600" : "text-emerald-600"}`}>{f.iv.toFixed(3)}</span>
                </div>
                <div className="text-center text-xs text-slate-600">{f.ks.toFixed(3)}</div>
                <div className="text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.status === "稳定" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                    {f.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="mb-4">
            <h3 className="text-slate-800 font-semibold text-sm">最近动态</h3>
            <p className="text-slate-400 text-xs mt-0.5">平台操作记录</p>
          </div>
          <div className="space-y-3">
            {recentActivities.map((act, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${activityColors[act.type]}`}>
                  {activityIcons[act.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">{act.text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{act.user}</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{act.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Module Quick Access */}
      <div className="grid grid-cols-5 gap-3">
          {[
            { label: "特征开发", desc: overview?.moduleCards.featureDev || "—", icon: Layers, color: "blue", path: "/feature-dev" },
            { label: "特征分析", desc: overview?.moduleCards.featureAnalysis || "—", icon: TrendingUp, color: "emerald", path: "/feature-analysis" },
            { label: "特征资产库", desc: overview?.moduleCards.featureLibrary || "—", icon: Database, color: "violet", path: "/feature-library" },
            { label: "监控运维", desc: overview?.moduleCards.monitoring || "—", icon: Shield, color: "amber", path: "/monitoring" },
            { label: "规则挖掘", desc: overview?.moduleCards.ruleMining || "—", icon: GitBranch, color: "pink", path: "/rule-mining" },
          ].map((mod) => (
          <button
            key={mod.path}
            onClick={() => navigate(mod.path)}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all text-left group"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
              mod.color === "blue" ? "bg-blue-50 text-blue-600" :
              mod.color === "emerald" ? "bg-emerald-50 text-emerald-600" :
              mod.color === "violet" ? "bg-violet-50 text-violet-600" :
              mod.color === "amber" ? "bg-amber-50 text-amber-600" :
              "bg-pink-50 text-pink-600"
            }`}>
              <mod.icon size={18} />
            </div>
            <div className="text-slate-800 text-sm font-medium group-hover:text-blue-600 transition-colors">{mod.label}</div>
            <div className="text-slate-400 text-xs mt-0.5">{mod.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
