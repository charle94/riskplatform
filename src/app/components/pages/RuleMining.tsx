import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell,
} from "recharts";
import {
  GitBranch, Plus, Play, Shield, AlertTriangle, CheckCircle2,
  ChevronRight, Settings, Zap, FileText, Copy, Filter,
  TrendingUp, ArrowRight, Clock, X, Trash2,
} from "lucide-react";
import { experimentsApi, ruleMiningApi, rulesApi } from "../../../api";
import type { Rule, RuleCandidate, RuleEvalItem, RuleMiningTreeNode, ColdStartTemplate } from "../../../api";
import { toast } from "sonner";

function RuleDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (data: Partial<Rule>) => void; }) {
  const [form, setForm] = useState({ name: "", type: "单条规则", logic: "", action: "拒绝", hitRate: "" });
  useEffect(() => { if (open) setForm({ name: "", type: "单条规则", logic: "", action: "拒绝", hitRate: "" }); }, [open]);
  if (!open) return null;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("请填写规则名称"); return; }
    if (!form.logic.trim()) { toast.error("请填写规则逻辑"); return; }
    onSave({ name: form.name.trim(), type: form.type, logic: form.logic.trim(), action: form.action, hitRate: Number(form.hitRate) || 0 });
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">新增规则</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">规则名称 <span className="text-red-500">*</span></label>
            <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="如：多头借贷高风险" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">规则类型</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {["单条规则", "规则集(AND)", "规则集(OR)", "规则表"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">决策动作</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}>
                {["拒绝", "人工审核", "降额", "提价"].map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">规则逻辑 <span className="text-red-500">*</span></label>
            <textarea rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none resize-none font-mono" placeholder="如：征信硬查询次数 >= 8 AND 近30日逾期天数 > 0" value={form.logic} onChange={e => setForm(f => ({ ...f, logic: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">预估命中率 (%)</label>
            <input type="number" step="0.1" min="0" max="100" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="0.0" value={form.hitRate} onChange={e => setForm(f => ({ ...f, hitRate: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">取消</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">创建规则</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Decision Tree Visualization Component
function DecisionTreeNode({ node, depth = 0 }: { node: any; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const isLeaf = !node.children;
  const isHighRisk = isLeaf && node.badRate > 0.08;

  return (
    <div className={`flex flex-col items-center`}>
      <div
        onClick={() => !isLeaf && setExpanded(!expanded)}
        className={`relative px-4 py-3 rounded-xl border-2 text-center cursor-pointer transition-all hover:shadow-md ${
          isHighRisk
            ? "bg-red-50 border-red-300 shadow-sm"
            : isLeaf
            ? "bg-emerald-50 border-emerald-200"
            : depth === 0
            ? "bg-blue-50 border-blue-300"
            : "bg-white border-slate-200"
        } min-w-[140px] max-w-[180px]`}
      >
        {isHighRisk && (
          <div className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <AlertTriangle size={10} className="text-white" />
          </div>
        )}
        <div className="text-xs font-semibold text-slate-700">{node.condition}</div>
        {node.feature && <div className="text-xs text-slate-500 mt-0.5">{node.feature}</div>}
        {isLeaf && (
          <div className="mt-1.5 space-y-0.5">
            <div className={`text-xs font-bold ${isHighRisk ? "text-red-600" : "text-emerald-600"}`}>
              坏率: {(node.badRate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-500">样本: {node.samples.toLocaleString()}</div>
          </div>
        )}
        {!isLeaf && (
          <div className="text-xs text-slate-500 mt-0.5">n={node.samples?.toLocaleString()}</div>
        )}
        {isHighRisk && (
          <div className="mt-1.5 px-2 py-0.5 bg-red-100 rounded text-xs text-red-700 font-medium">高风险节点</div>
        )}
      </div>

      {!isLeaf && expanded && node.children && (
        <div className="flex gap-6 mt-0">
          {node.children.map((child: any, i: number) => (
            <div key={i} className="flex flex-col items-center">
              <div className="w-0.5 h-6 bg-slate-200"></div>
              <DecisionTreeNode node={child} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const tabs = ["量化规则挖掘", "规则评估仿真", "人工规则配置", "冷启动模板"];

const actionColors: Record<string, string> = {
  "拒绝": "bg-red-50 text-red-600",
  "人工审核": "bg-amber-50 text-amber-600",
  "降额": "bg-blue-50 text-blue-600",
  "提价": "bg-violet-50 text-violet-600",
};

const severityColors: Record<string, string> = {
  "高": "bg-red-50 text-red-600",
  "中": "bg-amber-50 text-amber-600",
  "低": "bg-blue-50 text-blue-600",
};

export function RuleMining() {
  const [activeTab, setActiveTab] = useState(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [miningLoading, setMiningLoading] = useState(false);
  const [miningTreeData, setMiningTreeData] = useState<RuleMiningTreeNode | null>(null);
  const [miningRuleEvalData, setMiningRuleEvalData] = useState<RuleEvalItem[]>([]);
  const [miningCandidates, setMiningCandidates] = useState<RuleCandidate[]>([]);
  const [miningTemplates, setMiningTemplates] = useState<ColdStartTemplate[]>([]);
  const [lastRunLabel, setLastRunLabel] = useState("上次运行: 今日 09:15 · 耗时 2m18s");
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [optimizeBusy, setOptimizeBusy] = useState(false);
  const [convertBusyIndex, setConvertBusyIndex] = useState<number | null>(null);
  const [candidateSimIndex, setCandidateSimIndex] = useState<number | null>(null);
  const [featureSet, setFeatureSet] = useState("贷前审批特征集");
  const [algorithm, setAlgorithm] = useState("CART决策树");
  const [maxDepth, setMaxDepth] = useState(4);
  const [minSamples, setMinSamples] = useState(120);

  const loadMiningOverview = async () => {
    try {
      const data = await ruleMiningApi.overview();
      setMiningTreeData(data.treeData);
      setMiningRuleEvalData(data.ruleEvalData);
      setMiningCandidates(data.candidates);
      setMiningTemplates(data.coldStartTemplates);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "加载规则挖掘数据失败");
    }
  };

  const handleRunRuleMining = async () => {
    try {
      setMiningLoading(true);
      const run = await ruleMiningApi.run({
        featureSet,
        scene: featureSet,
        algorithm,
        maxDepth,
        minSamples,
      });
      setMiningTreeData(run.result.treeData);
      setMiningCandidates(run.result.candidates);
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      setLastRunLabel(`上次运行: 今日 ${hh}:${mm} · 已完成`);
      await loadMiningOverview();
      toast.success("规则挖掘已完成");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "运行规则挖掘失败");
    } finally {
      setMiningLoading(false);
    }
  };

  const loadRules = async () => {
    setRulesLoading(true);
    try { const data = await rulesApi.list(); setRules(data); }
    catch { toast.error("加载规则失败"); }
    finally { setRulesLoading(false); }
  };

  useEffect(() => { if (activeTab === 2) loadRules(); }, [activeTab]);
  useEffect(() => { void loadMiningOverview(); }, []);
  useEffect(() => {
    if (activeTab === 2) {
      void loadRules();
    }
  }, [activeTab]);

  const handleSaveRule = async (data: Partial<Rule>) => {
    try {
      const created = await rulesApi.create(data);
      setRules(prev => [...prev, created]);
      setSelectedRule(created);
      toast.success('规则已创建，状态为「测试中」');
      setRuleDialogOpen(false);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "创建失败"); }
  };

  const handleToggleRuleStatus = async (rule: Rule) => {
    const newStatus = rule.status === "上线" ? "下线" : "上线";
    try {
      const updated = await rulesApi.update(rule.id, { status: newStatus });
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
      if (selectedRule?.id === rule.id) setSelectedRule(updated);
      toast.success(`规则已${newStatus}`);
    } catch { toast.error("状态更新失败"); }
  };

  const handleDeleteRule = async (rule: Rule) => {
    if (!confirm(`确认删除规则「${rule.name}」？`)) return;
    try {
      await rulesApi.delete(rule.id);
      setRules(prev => prev.filter(r => r.id !== rule.id));
      if (selectedRule?.id === rule.id) setSelectedRule(null);
      toast.success("规则已删除");
    } catch { toast.error("删除失败"); }
  };

  const handleSimulateSelectedRule = async () => {
    if (!selectedRule) return;
    try {
      setSimulationBusy(true);
      const res = await rulesApi.simulate([selectedRule.id]);
      toast.success(`仿真完成：通过率影响 ${res.result.overall.passRateImpact}% ，剩余样本坏率 ${res.result.overall.afterBadRate}% ，逾期率改善 ${res.result.overall.oddsImprove}%`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "仿真失败");
    } finally {
      setSimulationBusy(false);
    }
  };

  const handleCandidateSimulate = async (candidate: RuleCandidate, index: number) => {
    try {
      setCandidateSimIndex(index);
      const res = await ruleMiningApi.simulateCandidate({ rule: candidate.rule });
      toast.success(`拒绝率 ${res.result.hitRate}% · 命中坏率 ${res.result.badRate}% · 逾期改善 ${res.result.oddsImprove}%`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "候选仿真失败");
    } finally {
      setCandidateSimIndex(null);
    }
  };

  const handleCandidateConvert = async (candidate: RuleCandidate, index: number) => {
    try {
      setConvertBusyIndex(index);
      const action = candidate.action.replace("建议：", "") || "拒绝";
      const converted = await ruleMiningApi.convertCandidate({
        rule: candidate.rule,
        name: `候选规则-${index + 1}`,
        action,
      });
      setSelectedRule(converted.rule);
      toast.success("候选规则已转化为规则资产");
      await loadRules();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "候选转化失败");
    } finally {
      setConvertBusyIndex(null);
    }
  };

  const handleOptimizeAndApply = async () => {
    try {
      setOptimizeBusy(true);
      const res = await rulesApi.optimize({
        objective: "max_odds_improve",
        maxPassImpact: 15,
        minBadRate: 25,
        maxRules: 3,
      });
      const ids = res.result.selectedRuleIds;
      if (ids.length > 0) {
        await Promise.all(ids.map(id => rulesApi.update(id, { status: "上线" })));
        await loadRules();
      }
      toast.success(`策略优化完成，已应用 ${ids.length} 条规则；剩余通过样本坏率 ${res.result.metrics.afterBadRate}%`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "策略优化失败");
    } finally {
      setOptimizeBusy(false);
    }
  };

  const handleCustomExperiment = async () => {
    try {
      const online = rules.filter(r => r.status === "上线").map(r => r.id);
      const test = rules.filter(r => r.status !== "上线").map(r => r.id);
      if (online.length === 0 || test.length === 0) {
        toast.error("需要至少1条上线规则和1条测试规则才能发起实验");
        return;
      }
      const res = await experimentsApi.championChallenger({
        name: "自定义组合实验",
        championRuleIds: [online[0]],
        challengerRuleIds: [test[0]],
        sampleRate: 0.2,
      });
      toast.success(`实验完成，胜出策略：${res.result.winner === "challenger" ? "挑战者" : "冠军"}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "实验失败");
    }
  };

  const handleUseTemplate = async (t: ColdStartTemplate) => {
    try {
      const rec = await ruleMiningApi.coldStart();
      const picked = rec.recommendedCandidates[0];
      if (!picked) {
        toast.error("当前无可用推荐候选");
        return;
      }
      await ruleMiningApi.convertCandidate({
        rule: picked.rule,
        name: `${t.name}-自动生成`,
        action: picked.action.replace("建议：", "") || "人工审核",
      });
      toast.success(`模板「${t.name}」已生成规则`);
      await loadRules();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "模板应用失败");
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 font-semibold text-xl">规则挖掘工作台</h1>
          <p className="text-slate-500 text-sm mt-0.5">特征驱动的智能策略生成平台 · 从优质特征到可落地规则</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-medium">
            {rules.filter(r => r.status === "上线").length} 条活跃规则
          </span>
        </div>
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

      {/* Tab 0: Quantitative Mining */}
      {activeTab === 0 && (
        <div className="space-y-4">
          {/* Config Panel */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-slate-800 font-semibold text-sm mb-4">自动规则挖掘配置</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">选择特征集</label>
                <select value={featureSet} onChange={(e) => setFeatureSet(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white">
                  <option>贷前审批特征集</option>
                  <option>反欺诈特征集</option>
                  <option>贷后催收特征集</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">算法</label>
                <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-white">
                  <option>CART决策树</option>
                  <option>卡方分箱 + CART</option>
                  <option>信息增益树</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">最大树深度</label>
                <input type="number" value={maxDepth} onChange={(e) => setMaxDepth(Number(e.target.value) || 4)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">叶节点最小样本</label>
                <input type="number" value={minSamples} onChange={(e) => setMinSamples(Number(e.target.value) || 120)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => void handleRunRuleMining()}
                disabled={miningLoading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                <Play size={14} /> {miningLoading ? "运行中..." : "运行规则挖掘"}
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                <Clock size={12} />
                {lastRunLabel}
              </div>
            </div>
          </div>

          {/* Decision Tree */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-slate-800 font-semibold text-sm">决策树可视化</h3>
                <p className="text-slate-400 text-xs mt-0.5">红色节点为高风险叶子节点（命中坏率 &gt; 8%），点击节点展开/折叠</p>
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded bg-red-100 border border-red-300"></span>高风险</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>低风险</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span>分裂节点</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="flex flex-col items-center py-4 min-w-[800px]">
                {miningTreeData ? <DecisionTreeNode node={miningTreeData} /> : <div className="text-sm text-slate-400">暂无决策树结果</div>}
              </div>
            </div>
          </div>

          {/* Extracted Rules */}
          <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-100 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-violet-600" />
              <span className="text-sm font-semibold text-violet-800">自动提取候选规则</span>
            </div>
            <div className="space-y-2">
              {miningCandidates.map((r, i) => (
                <div key={i} className="bg-white rounded-xl p-4 border border-violet-100 flex items-center gap-4">
                  <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
                  <div className="flex-1">
                    <div className="text-sm font-mono text-slate-800">{r.rule}</div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-slate-500">拒绝率: <span className="font-medium text-slate-700">{r.hitRate}</span></span>
                      <span className="text-xs text-slate-500">命中坏率: <span className="font-medium text-red-600">{r.badRate}</span></span>
                      <span className="text-xs text-emerald-600 font-medium">{r.action}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                     <button
                       onClick={() => void handleCandidateSimulate(r, i)}
                       disabled={candidateSimIndex === i}
                       className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                     >
                       {candidateSimIndex === i ? "仿真中..." : "仿真评估"}
                     </button>
                     <button
                       onClick={() => void handleCandidateConvert(r, i)}
                       disabled={convertBusyIndex === i}
                       className="px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60"
                     >
                       {convertBusyIndex === i ? "转化中..." : "一键转化"}
                     </button>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Rule Evaluation */}
      {activeTab === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-slate-800 font-semibold text-sm mb-1">规则拒绝率 vs 命中坏率</h3>
               <p className="text-slate-400 text-xs mb-4">理想规则：拒绝率可控 + 命中坏率高</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={miningRuleEvalData} layout="vertical" margin={{ top: 5, right: 60, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="rule" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={160} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => `${v}%`} />
                  <Bar dataKey="hitRate" fill="#bfdbfe" name="拒绝率" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="badRate" fill="#fca5a5" name="命中坏率" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-slate-800 font-semibold text-sm mb-4">策略影响仿真</h3>
              <div className="space-y-3">
                {miningRuleEvalData.map((r, i) => (
                  <div key={i} className="p-3 border border-slate-100 rounded-xl hover:border-blue-200 transition-colors">
                    <div className="text-xs font-medium text-slate-800 truncate mb-2">{r.rule}</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs text-slate-400">通过率影响</div>
                        <div className="text-sm font-bold text-red-600">{r.passRateImpact}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">命中坏率</div>
                        <div className="text-sm font-bold text-amber-600">{r.badRate}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">逾期率改善</div>
                        <div className="text-sm font-bold text-emerald-600">{r.oddsImprove}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">策略组合推荐</span>
            </div>
             <p className="text-blue-700 text-xs mb-3">综合分析后推荐在可接受拒绝率范围内上线组合规则，并观察剩余通过样本坏率是否持续下降。</p>
            <div className="flex gap-2">
               <button
                 onClick={() => void handleOptimizeAndApply()}
                 disabled={optimizeBusy}
                 className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
               >
                 {optimizeBusy ? "优化中..." : "接受推荐并上线"}
               </button>
               <button onClick={() => void handleCustomExperiment()} className="px-4 py-2 border border-blue-200 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-50">自定义组合</button>
             </div>
           </div>
         </div>
      )}

      {/* Tab 2: Manual Rules */}
      {activeTab === 2 && (
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-slate-800 font-semibold text-sm">规则列表</h3>
                <button onClick={() => setRuleDialogOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                  <Plus size={12} /> 新增规则
                </button>
              </div>
              {rulesLoading ? (
                <div className="py-10 text-center text-slate-400 text-sm">加载中...</div>
              ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["优先级", "规则名称", "类型", "决策动作", "命中率", "状态", "操作"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r, idx) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRule(r)}
                      className={`border-b border-slate-50 hover:bg-blue-50/30 cursor-pointer transition-colors ${selectedRule?.id === r.id ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <span className="w-6 h-6 bg-slate-100 text-slate-600 rounded-full text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.type}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColors[r.action]}`}>{r.action}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{r.hitRate}%</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === "上线" ? "bg-emerald-50 text-emerald-600" : r.status === "测试中" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleToggleRuleStatus(r)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors" title={r.status === "上线" ? "下线" : "上线"}><Settings size={12} /></button>
                          <button onClick={() => handleDeleteRule(r)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600 transition-colors" title="删除"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>

          {selectedRule && (
            <div className="w-72 flex-shrink-0 bg-white border border-slate-200 rounded-xl p-4 space-y-4 h-fit">
              <div>
                <h3 className="text-slate-900 font-semibold text-sm">{selectedRule.name}</h3>
                <p className="text-slate-400 text-xs mt-0.5 font-mono">{selectedRule.id}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-medium">规则逻辑</label>
                <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs text-emerald-400 leading-relaxed">
                  {selectedRule.logic}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-400">规则类型</div>
                  <div className="text-slate-700 font-medium mt-0.5">{selectedRule.type}</div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-400">决策动作</div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium mt-0.5 inline-block ${actionColors[selectedRule.action]}`}>{selectedRule.action}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-400">命中率</div>
                  <div className="text-slate-700 font-medium mt-0.5">{selectedRule.hitRate}%</div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-400">状态</div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium mt-0.5 inline-block ${selectedRule.status === "上线" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>{selectedRule.status}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => handleToggleRuleStatus(selectedRule)} className="flex-1 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50">{selectedRule.status === "上线" ? "下线规则" : "上线规则"}</button>
                 <button onClick={() => void handleSimulateSelectedRule()} disabled={simulationBusy} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-60">{simulationBusy ? "仿真中..." : "仿真测试"}</button>
               </div>
             </div>
           )}
        </div>
      )}

      {activeTab === 3 && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield size={14} className="text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">冷启动规则设计原则</span>
            </div>
            <p className="text-amber-700 text-xs leading-relaxed">
              新产品缺乏历史样本时，规则设计需遵循：<strong>全面性</strong>（覆盖主要风险维度）、<strong>从严性</strong>（阈值从紧设置，宁可误杀不可放过）、<strong>可核性</strong>（规则可验证，可解释）。随样本积累逐步放宽。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {miningTemplates.map(t => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-sm text-slate-800 font-semibold">{t.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t.category}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${severityColors[t.severity]}`}>
                    {t.severity}优先
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{t.desc}</p>
                <div className="space-y-1 mb-3">
                  <div className="text-xs text-slate-400 font-medium">可配置参数:</div>
                  {t.params.map(p => (
                    <div key={p} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <ChevronRight size={10} className="text-slate-400" />
                      {p}
                    </div>
                  ))}
                </div>
                 <button onClick={() => void handleUseTemplate(t)} className="w-full py-2 border border-blue-200 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5">
                   <FileText size={12} /> 使用此模板
                 </button>
               </div>
            ))}
          </div>
        </div>
      )}

      <RuleDialog open={ruleDialogOpen} onClose={() => setRuleDialogOpen(false)} onSave={handleSaveRule} />
    </div>
  );
}
