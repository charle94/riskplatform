import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from "recharts";
import {
  AlertTriangle, CheckCircle2, Info, TrendingDown, Search, Filter, Download,
} from "lucide-react";
import { analysisApi } from "../../../api";

const tabs = ["探索性数据分析", "特征效果评估", "稳定性监控"];
const psiTrendColors = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6"];

function IVBar({ value }: { value: number }) {
  const pct = Math.min((value / 0.7) * 100, 100);
  const color = value > 0.5 ? "#ef4444" : value > 0.3 ? "#a78bfa" : value > 0.1 ? "#34d399" : value > 0.02 ? "#60a5fa" : "#94a3b8";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-slate-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }}></div>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{value.toFixed(3)}</span>
    </div>
  );
}

export function FeatureAnalysis() {
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");
  const [featureStatsState, setFeatureStatsState] = useState<Array<{ name: string; missing: string; min: number; max: number; mean: number; std: number; p25: number; p75: number; skewness: number; kurtosis: number; status: string }>>([]);
  const [ivDataState, setIvDataState] = useState<Array<{ name: string; iv: number; ks: number; psi: number; auc: number; crossing: boolean }>>([]);
  const [distributionDataState, setDistributionDataState] = useState<Array<{ bin: string; count: number; badRate: number }>>([]);
  const [psiTrendDataState, setPsiTrendDataState] = useState<Array<Record<string, string | number>>>([]);
  const [psiTrendSeriesState, setPsiTrendSeriesState] = useState<Array<{ key: string; name: string; status: string }>>([]);
  const [stabilityCardsState, setStabilityCardsState] = useState<Array<{ label: string; value: string; pct: string; color: string }>>([]);
  const [driftAlertsState, setDriftAlertsState] = useState<Array<{ name: string; psi: number; reason: string }>>([]);

  useEffect(() => {
    analysisApi.overview()
      .then((data) => {
        setFeatureStatsState(data.featureStats);
        setIvDataState(data.ivData);
        setDistributionDataState(data.distributionData);
        setPsiTrendDataState(data.psiTrendData);
        setPsiTrendSeriesState(data.psiTrendSeries);
        setStabilityCardsState(data.stabilityCards);
        setDriftAlertsState(data.driftAlerts);
      })
      .catch(() => {});
  }, []);

  const crossingFeatures = ivDataState.filter((f) => f.crossing);
  const filteredFeatures = ivDataState.filter((f) => f.name.includes(search));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 font-semibold text-xl">特征分析与评估</h1>
          <p className="text-slate-500 text-sm mt-0.5">特征质检中心 · 科学评估有效性、稳定性与安全性</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
          <Download size={14} /> 导出报告
        </button>
      </div>

      {/* Alerts */}
      {crossingFeatures.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-600" />
            <span className="text-red-800 font-semibold text-sm">特征穿越风险预警</span>
            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">{crossingFeatures.length} 个特征</span>
          </div>
          <p className="text-red-600 text-xs mb-3">以下特征IV值异常偏高（&gt;0.5），疑似存在"特征穿越"（标签泄露）风险，请排查计算时间窗口是否包含标签时间点后的数据：</p>
          <div className="flex flex-wrap gap-2">
            {crossingFeatures.map((f) => (
              <div key={f.name} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 rounded-lg">
                <AlertTriangle size={11} className="text-red-600" />
                <span className="text-red-800 text-xs font-medium">{f.name}</span>
                <span className="text-red-600 text-xs">IV={f.iv.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* EDA Tab */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Distribution Chart */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="mb-3">
                <h3 className="text-slate-800 font-semibold text-sm">特征分布 · 夜间交易占比</h3>
                <p className="text-slate-400 text-xs mt-0.5">各分箱区间样本量与坏样本率</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={distributionDataState} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="bin" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, name) => name === "坏样本率" ? `${(+v * 100).toFixed(1)}%` : v} />
                  <Bar yAxisId="left" dataKey="count" fill="#bfdbfe" name="样本量" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="right" dataKey="badRate" fill="#ef4444" name="坏样本率" radius={[3, 3, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
              {distributionDataState.length === 0 && <div className="text-xs text-slate-400 mt-2">暂无分布数据</div>}
            </div>

            {/* Stats Table */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="mb-3">
                <h3 className="text-slate-800 font-semibold text-sm">描述性统计摘要</h3>
                <p className="text-slate-400 text-xs mt-0.5">自动化统计分析结果</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 text-slate-500 font-medium">特征名</th>
                      <th className="text-center py-2 text-slate-500 font-medium">缺失率</th>
                      <th className="text-center py-2 text-slate-500 font-medium">均值</th>
                      <th className="text-center py-2 text-slate-500 font-medium">标准差</th>
                      <th className="text-center py-2 text-slate-500 font-medium">偏态</th>
                      <th className="text-center py-2 text-slate-500 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureStatsState.map((f) => (
                      <tr key={f.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 text-slate-700 max-w-[120px] truncate" title={f.name}>{f.name}</td>
                        <td className="py-2.5 text-center">
                          <span className={f.missing > "5%" ? "text-red-600 font-medium" : "text-slate-600"}>{f.missing}</span>
                        </td>
                        <td className="py-2.5 text-center text-slate-600">{typeof f.mean === "number" && f.mean > 100 ? f.mean.toLocaleString() : f.mean}</td>
                        <td className="py-2.5 text-center text-slate-600">{f.std}</td>
                        <td className="py-2.5 text-center text-slate-600">{f.skewness}</td>
                        <td className="py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${f.status === "正常" ? "bg-emerald-50 text-emerald-600" : f.status === "右偏" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>{f.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {featureStatsState.length === 0 && <div className="text-xs text-slate-400 py-4">暂无统计结果</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feature Evaluation Tab */}
      {activeTab === 1 && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-slate-800 font-semibold text-sm">特征效果评估</h3>
                <p className="text-slate-400 text-xs mt-0.5">IV / KS / PSI / AUC 核心指标</p>
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <Search size={12} className="text-slate-400" />
                  <input className="text-xs bg-transparent outline-none text-slate-600 w-36" placeholder="搜索特征名称..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300"></span>IV &lt; 0.02 无效</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span>0.02-0.1 弱</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>0.1-0.3 中</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400"></span>0.3-0.5 强</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"></span>&gt; 0.5 疑似穿越</span>
              <span className="ml-auto flex items-center gap-1 text-amber-600"><Info size={11} /> PSI &gt; 0.2 需关注稳定性</span>
            </div>

            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["特征名称", "IV值", "KS值", "PSI值", "AUC", "穿越风险", "综合评级"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs text-slate-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFeatures.map((f) => (
                  <tr key={f.name} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${f.crossing ? "bg-red-50/30" : ""}`}>
                    <td className="px-5 py-3 text-sm text-slate-800 font-medium">
                      <div className="flex items-center gap-2">
                        {f.crossing && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                        {f.name}
                      </div>
                    </td>
                    <td className="px-5 py-3"><IVBar value={f.iv} /></td>
                    <td className="px-5 py-3 text-sm text-slate-700">{f.ks.toFixed(3)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium ${f.psi > 0.2 ? "text-red-600" : f.psi > 0.1 ? "text-amber-600" : "text-emerald-600"}`}>{f.psi.toFixed(2)}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-700">{f.auc.toFixed(3)}</td>
                    <td className="px-5 py-3">
                      {f.crossing ? (
                        <span className="flex items-center gap-1 text-xs text-red-600 font-medium"><AlertTriangle size={11} />高风险</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={11} />正常</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        f.crossing ? "bg-red-50 text-red-600" :
                        f.iv >= 0.3 ? "bg-violet-50 text-violet-600" :
                        f.iv >= 0.1 ? "bg-emerald-50 text-emerald-600" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {f.crossing ? "待排查" : f.iv >= 0.3 ? "优质" : f.iv >= 0.1 ? "良好" : "待优化"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredFeatures.length === 0 && <div className="px-5 py-6 text-xs text-slate-400">暂无评估特征</div>}
          </div>
        </div>
      )}

      {/* Stability Tab */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            {stabilityCardsState.map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-slate-500 text-xs">{s.label}</p>
                  <span className="text-xs text-slate-400">{s.pct}</span>
                </div>
                <p className={`text-2xl font-bold mt-1 ${s.color === "emerald" ? "text-emerald-600" : s.color === "amber" ? "text-amber-600" : "text-red-600"}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-slate-800 font-semibold text-sm">PSI趋势监控</h3>
              <p className="text-slate-400 text-xs mt-0.5">代表性特征的 PSI 变化趋势（基于样本分段对比，虚线为告警阈值 PSI=0.2）</p>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={psiTrendDataState} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 0.35]} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <ReferenceLine y={0.2} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "告警阈值", fontSize: 11, fill: "#f59e0b" }} />
                {psiTrendSeriesState.map((series, index) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    stroke={psiTrendColors[index % psiTrendColors.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name={series.name}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3 text-xs text-slate-500 flex-wrap">
              {psiTrendSeriesState.map((series, index) => (
                <span key={series.key} className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: psiTrendColors[index % psiTrendColors.length] }}></span>
                  {series.name}（{series.status}）
                </span>
              ))}
            </div>
            {psiTrendSeriesState.length === 0 && <div className="text-xs text-slate-400 mt-2">暂无 PSI 趋势数据</div>}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={16} className="text-amber-600" />
              <span className="text-amber-800 font-semibold text-sm">PSI超阈值预警特征</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {driftAlertsState.map((f) => (
                <div key={f.name} className="bg-white rounded-lg p-3 border border-amber-100">
                  <div className="text-sm text-slate-800 font-medium">{f.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-amber-600 font-bold text-sm">PSI={f.psi}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{f.reason}</div>
                  <button className="mt-2 text-xs text-blue-600 hover:underline">查看详情</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
