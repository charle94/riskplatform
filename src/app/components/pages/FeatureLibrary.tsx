import { useState, useEffect } from "react";
import {
  Search, Plus, Eye, GitBranch, Clock, Tag,
  CheckCircle2, AlertTriangle, XCircle, ArrowUpRight,
  Download, Copy, X, Trash2,
} from "lucide-react";
import { featureDevApi, featuresApi } from "../../../api";
import type { Feature } from "../../../api";
import { toast } from "sonner";

const scenes = ["全部", "贷前", "贷中", "贷后", "反欺诈"];
const statuses = ["全部", "上线", "测试中", "下线"];
const categories = ["全部", "信用历史", "行为特征", "设备特征", "多头行为"];

type FeatureVersionRow = {
  id: string;
  feature_id: string;
  version: string;
  payload: string;
  created_at: string;
  author: string;
  change_desc: string;
};

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  "上线": { color: "bg-emerald-50 text-emerald-600", icon: <CheckCircle2 size={10} /> },
  "测试中": { color: "bg-blue-50 text-blue-600", icon: <Clock size={10} /> },
  "下线": { color: "bg-slate-100 text-slate-500", icon: <XCircle size={10} /> },
};

// ─── Create Feature Dialog ─────────────────────────────────────────────────
function FeatureDialog({
  open, onClose, onSave, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Feature>) => void;
  initial?: Feature | null;
}) {
  const [form, setForm] = useState({
    name: "", category: "行为特征", scene: "贷前", source: "行为埋点",
    desc: "", creator: "当前用户", iv: "", psi: "", definition: "",
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<Array<{ userId: string; label: number; value: number }>>([]);
  const [previewStats, setPreviewStats] = useState<{ sampleCount: number; coverage: number; iv: number; ks: number; psi: number; auc: number } | null>(null);

  useEffect(() => {
    if (initial) {
        setForm({
          name: initial.name, category: initial.category, scene: initial.scene,
          source: initial.source, desc: initial.desc, creator: initial.creator,
          iv: String(initial.iv), psi: String(initial.psi), definition: initial.definition || "",
        });
        setPreviewRows([]);
        setPreviewStats(null);
    } else {
      setForm({ name: "", category: "行为特征", scene: "贷前", source: "行为埋点", desc: "", creator: "当前用户", iv: "", psi: "", definition: "" });
      setPreviewRows([]);
      setPreviewStats(null);
    }
  }, [initial, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("请填写特征名称"); return; }
    if (!form.definition.trim()) { toast.error("请填写特征定义表达式"); return; }
    onSave({
      name: form.name.trim(), category: form.category, scene: form.scene,
      source: form.source, desc: form.desc, creator: form.creator,
      iv: Number(form.iv) || 0, psi: Number(form.psi) || 0, definition: form.definition.trim(),
    });
  };

  const handlePreview = async () => {
    if (!form.definition.trim()) {
      toast.error("请先填写特征定义表达式");
      return;
    }
    try {
      setPreviewLoading(true);
      const result = await featureDevApi.preview({ definition: form.definition.trim(), limit: 8 });
      setPreviewRows(result.rows);
      setPreviewStats(result.stats);
      setForm((f) => ({ ...f, iv: String(result.stats.iv), psi: String(result.stats.psi) }));
      toast.success(`预览完成，返回 ${result.rows.length} 行样本`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{initial ? "编辑特征" : "登记新特征"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">特征名称 <span className="text-red-500">*</span></label>
            <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="如：近30日夜间交易占比" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">特征类别</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {["行为特征", "信用历史", "设备特征", "多头行为"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">业务场景</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.scene} onChange={e => setForm(f => ({ ...f, scene: e.target.value }))}>
                {["贷前", "贷中", "贷后", "反欺诈"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">数据来源</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                {["行为埋点", "征信数据", "三方数据", "设备指纹服务", "业务核心库"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">创建人</label>
              <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" value={form.creator} onChange={e => setForm(f => ({ ...f, creator: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">IV值 (参考)</label>
              <input type="number" step="0.001" min="0" max="1" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="0.000" value={form.iv} onChange={e => setForm(f => ({ ...f, iv: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">PSI值 (参考)</label>
              <input type="number" step="0.001" min="0" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="0.000" value={form.psi} onChange={e => setForm(f => ({ ...f, psi: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">特征描述</label>
            <textarea rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none resize-none" placeholder="描述特征的计算逻辑和业务含义..." value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">特征定义表达式 <span className="text-red-500">*</span></label>
            <textarea rows={4} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none resize-none font-mono" placeholder="如：night_txn_ratio / (query_6m + 1)" value={form.definition} onChange={e => setForm(f => ({ ...f, definition: e.target.value }))} />
            <div className="text-[11px] text-slate-400 mt-1">可用字段：query_6m、overdue_days_30d、night_txn_ratio、device_risk_score、multi_apply_3m、login_7d、apply_amount_ratio、register_days、third_party_score、income_pred_score</div>
          </div>
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-slate-700">表达式预览</div>
                <div className="text-[11px] text-slate-400">先验证表达式，再保存特征资产</div>
              </div>
              <button type="button" onClick={() => void handlePreview()} disabled={previewLoading} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                {previewLoading ? "预览中..." : "预览计算结果"}
              </button>
            </div>
            {previewStats && (
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>覆盖率: {previewStats.coverage}%</div>
                <div>IV: {previewStats.iv}</div>
                <div>KS: {previewStats.ks}</div>
                <div>PSI: {previewStats.psi}</div>
                <div>AUC: {previewStats.auc}</div>
                <div>有效样本: {previewStats.sampleCount}</div>
              </div>
            )}
            {previewRows.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <div className="px-3 py-2 text-[11px] bg-slate-50 text-slate-500">样本预览（user_id / label / value）</div>
                <div className="max-h-36 overflow-y-auto">
                  {previewRows.map((row) => (
                    <div key={row.userId} className="px-3 py-2 text-[11px] text-slate-700 border-t border-slate-100 font-mono">
                      {row.userId} / {row.label} / {row.value}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">取消</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">{initial ? "保存修改" : "登记"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FeatureLibrary() {
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedScene, setSelectedScene] = useState("全部");
  const [selectedStatus, setSelectedStatus] = useState("全部");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [versionRows, setVersionRows] = useState<FeatureVersionRow[]>([]);

  const loadFeatures = async () => {
    setLoading(true);
    try {
      const data = await featuresApi.list({
        scene: selectedScene !== "全部" ? selectedScene : undefined,
        status: selectedStatus !== "全部" ? selectedStatus : undefined,
        category: selectedCategory !== "全部" ? selectedCategory : undefined,
        search: search || undefined,
      });
      setFeatures(data);
      if (!selectedFeature && data.length > 0) setSelectedFeature(data[0]);
    } catch { toast.error("加载特征失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadFeatures(); }, [selectedScene, selectedStatus, selectedCategory]);
  useEffect(() => {
    if (selectedFeature && activeTab === 1) {
      featuresApi.versions(selectedFeature.id)
        .then(setVersionRows)
        .catch(() => toast.error("加载版本历史失败"));
    }
  }, [selectedFeature, activeTab]);

  const handleSearch = () => loadFeatures();

  const handleSave = async (data: Partial<Feature>) => {
    try {
      if (editingFeature) {
        const updated = await featuresApi.update(editingFeature.id, data);
        setFeatures(prev => prev.map(f => f.id === editingFeature.id ? updated : f));
        if (selectedFeature?.id === editingFeature.id) setSelectedFeature(updated);
        toast.success("特征已更新");
      } else {
        const created = await featureDevApi.validateSave({
          name: String(data.name || ""),
          category: String(data.category || "行为特征"),
          scene: String(data.scene || "贷前"),
          source: String(data.source || "行为埋点"),
          desc: String(data.desc || ""),
          creator: String(data.creator || "当前用户"),
          definition: String(data.definition || ""),
        });
        const feature = created.feature;
        setFeatures(prev => [...prev, feature]);
        setSelectedFeature(feature);
        toast.success("特征已登记，状态为「测试中」");
      }
      await loadFeatures();
      setDialogOpen(false);
      setEditingFeature(null);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "操作失败"); }
  };

  const handleDelete = async (f: Feature) => {
    if (!confirm(`确认删除特征「${f.name}」？此操作不可撤销。`)) return;
    try {
      await featuresApi.delete(f.id);
      setFeatures(prev => prev.filter(x => x.id !== f.id));
      if (selectedFeature?.id === f.id) setSelectedFeature(null);
      toast.success("特征已删除");
    } catch { toast.error("删除失败"); }
  };

  const handleStatusChange = async (f: Feature, newStatus: string) => {
    try {
      const updated = await featuresApi.update(f.id, { status: newStatus });
      setFeatures(prev => prev.map(x => x.id === f.id ? updated : x));
      if (selectedFeature?.id === f.id) setSelectedFeature(updated);
      toast.success(`状态已更改为「${newStatus}」`);
    } catch { toast.error("状态更新失败"); }
  };

  const handleExport = () => {
    const csv = [
      ["特征ID", "特征名称", "类别", "场景", "状态", "IV值", "PSI值", "版本", "创建人"].join(","),
      ...features.map(f => [f.id, f.name, f.category, f.scene, f.status, f.iv, f.psi, f.version, f.creator].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "feature_catalog.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("导出成功");
  };

  const handleRollback = async (version: string) => {
    if (!selectedFeature) return;
    try {
      await featuresApi.rollback(selectedFeature.id, version, "当前用户");
      toast.success(`已回滚到 ${version}`);
      await loadFeatures();
      const freshVersions = await featuresApi.versions(selectedFeature.id);
      setVersionRows(freshVersions);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "回滚失败");
    }
  };

  const handleCopyId = async () => {
    if (!selectedFeature) return;
    try {
      await navigator.clipboard.writeText(selectedFeature.id);
      toast.success(`已复制特征ID：${selectedFeature.id}`);
    } catch {
      toast.error("复制失败，请检查浏览器权限");
    }
  };

  const handleCompareVersion = (version: FeatureVersionRow) => {
    if (!selectedFeature) return;
    try {
      const payload = JSON.parse(version.payload) as Partial<Feature>;
      const changes = [
        payload.name && payload.name !== selectedFeature.name ? `名称: ${payload.name} -> ${selectedFeature.name}` : null,
        payload.scene && payload.scene !== selectedFeature.scene ? `场景: ${payload.scene} -> ${selectedFeature.scene}` : null,
        payload.status && payload.status !== selectedFeature.status ? `状态: ${payload.status} -> ${selectedFeature.status}` : null,
        typeof payload.iv === "number" && payload.iv !== selectedFeature.iv ? `IV: ${payload.iv} -> ${selectedFeature.iv}` : null,
        typeof payload.psi === "number" && payload.psi !== selectedFeature.psi ? `PSI: ${payload.psi} -> ${selectedFeature.psi}` : null,
      ].filter(Boolean);
      toast.info(changes.length > 0 ? changes.join("；") : `版本 ${version.version} 与当前版本无差异`);
    } catch {
      toast.error("版本对比失败");
    }
  };

  const filteredForDisplay = features.filter(f =>
    (f.name.includes(search) || f.id.includes(search) || !search)
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 font-semibold text-xl">特征资产库</h1>
          <p className="text-slate-500 text-sm mt-0.5">标准化管理特征资产，沉淀风控知识</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors">
            <Download size={14} /> 导出目录
          </button>
          <button onClick={() => { setEditingFeature(null); setDialogOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={14} /> 登记新特征
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "特征总数", value: features.length, sub: "全部特征" },
          { label: "已上线", value: features.filter(f => f.status === "上线").length, sub: "生产环境" },
          { label: "测试中", value: features.filter(f => f.status === "测试中").length, sub: "待验证" },
          { label: "已下线", value: features.filter(f => f.status === "下线").length, sub: "归档" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
            <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {["特征目录", "版本历史"].map((tab, i) => (
          <button key={i} onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                <Search size={12} className="text-slate-400" />
                <input className="text-xs bg-transparent outline-none text-slate-600 w-40" placeholder="搜索特征名/ID..." value={search}
                  onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">场景:</span>
                {scenes.map(s => (
                  <button key={s} onClick={() => setSelectedScene(s)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${selectedScene === s ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"}`}>{s}</button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">状态:</span>
                {statuses.map(s => (
                  <button key={s} onClick={() => setSelectedStatus(s)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${selectedStatus === s ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"}`}>{s}</button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-xs text-slate-500 grid grid-cols-8 font-medium">
                <span className="col-span-3">特征名称</span>
                <span>类别</span>
                <span>场景</span>
                <span>状态</span>
                <span>IV值</span>
                <span>版本</span>
              </div>
              {loading ? (
                <div className="py-10 text-center text-slate-400 text-sm">加载中...</div>
              ) : filteredForDisplay.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">暂无特征</div>
              ) : filteredForDisplay.map(f => (
                <div key={f.id} onClick={() => setSelectedFeature(f)}
                  className={`px-4 py-3 border-b border-slate-50 hover:bg-blue-50/30 cursor-pointer transition-colors grid grid-cols-8 items-center ${selectedFeature?.id === f.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}>
                  <div className="col-span-3">
                    <div className="text-sm text-slate-800 font-medium flex items-center gap-1.5">
                      {(f.status === "下线" || (f.iv > 0.5 && f.status !== "下线")) && <AlertTriangle size={11} className="text-amber-500" />}
                      {f.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">{f.id}</div>
                  </div>
                  <span className="text-xs text-slate-600">{f.category}</span>
                  <span className="text-xs text-slate-600">{f.scene}</span>
                  <span>
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full w-fit ${statusConfig[f.status]?.color}`}>
                      {statusConfig[f.status]?.icon}
                      {f.status}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-violet-600">{f.iv.toFixed(3)}</span>
                  <span className="text-xs text-slate-500">{f.version}</span>
                </div>
              ))}
            </div>
          </div>

          {selectedFeature && (
            <div className="w-80 flex-shrink-0 space-y-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-slate-900 font-semibold text-sm">{selectedFeature.name}</h3>
                    <p className="text-slate-400 text-xs mt-0.5 font-mono">{selectedFeature.id}</p>
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusConfig[selectedFeature.status]?.color}`}>
                    {statusConfig[selectedFeature.status]?.icon}
                    {selectedFeature.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{selectedFeature.desc || "暂无描述"}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { label: "数据来源", value: selectedFeature.source },
                      { label: "业务场景", value: selectedFeature.scene },
                      { label: "特征类别", value: selectedFeature.category },
                      { label: "当前版本", value: selectedFeature.version },
                    { label: "创建人", value: selectedFeature.creator },
                    { label: "创建时间", value: selectedFeature.createTime },
                      { label: "最近更新", value: selectedFeature.updateTime },
                      { label: "定义表达式", value: selectedFeature.definition || "—" },
                    ].map(item => (
                    <div key={item.label} className={item.label === "数据来源" || item.label === "最近更新" || item.label === "定义表达式" ? "col-span-2" : ""}>
                      <span className="text-slate-400">{item.label}:</span>
                      <span className={`text-slate-700 ml-1 font-medium ${item.label === "定义表达式" ? "font-mono text-xs break-all" : ""}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                  <div className="text-center">
                    <div className="text-sm font-bold text-violet-600">{selectedFeature.iv.toFixed(3)}</div>
                    <div className="text-xs text-slate-400">IV值</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-bold ${selectedFeature.psi > 0.2 ? "text-red-600" : "text-emerald-600"}`}>{selectedFeature.psi.toFixed(2)}</div>
                    <div className="text-xs text-slate-400">PSI值</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-blue-600">{selectedFeature.usedBy.length}</div>
                    <div className="text-xs text-slate-400">使用模型</div>
                  </div>
                </div>
              </div>

              {selectedFeature.usedBy.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <h4 className="text-slate-700 text-xs font-semibold mb-2">使用去向</h4>
                  <div className="space-y-1.5">
                    {selectedFeature.usedBy.map(m => (
                      <div key={m} className="flex items-center gap-2 text-xs text-slate-600 px-2 py-1.5 bg-slate-50 rounded">
                        <Tag size={10} className="text-slate-400" />{m}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="text-slate-700 text-xs font-semibold">操作</h4>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingFeature(selectedFeature); setDialogOpen(true); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs hover:bg-slate-50">
                    <Copy size={12} /> 编辑
                  </button>
                  <button onClick={() => void handleCopyId()} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                    <Eye size={12} /> 复制ID
                  </button>
                </div>
                <div className="flex gap-2">
                  {selectedFeature.status !== "上线" && (
                    <button onClick={() => handleStatusChange(selectedFeature, "上线")} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700">
                      <CheckCircle2 size={12} /> 上线
                    </button>
                  )}
                  {selectedFeature.status === "上线" && (
                    <button onClick={() => handleStatusChange(selectedFeature, "下线")} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500 text-white rounded-lg text-xs hover:bg-amber-600">
                      <XCircle size={12} /> 下线
                    </button>
                  )}
                  <button onClick={() => handleDelete(selectedFeature)} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 border border-red-100">
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 1 && selectedFeature && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-slate-800 font-semibold text-sm">版本历史 · {selectedFeature.name}</h3>
              <p className="text-slate-400 text-xs mt-0.5">所有版本变更记录，支持对比与回滚</p>
            </div>
            <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-medium">当前: {selectedFeature.version}</span>
          </div>
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-100"></div>
            <div className="space-y-4">
              {versionRows.map((v, i) => (
                <div key={v.version} className="flex gap-4 items-start relative pl-12">
                  <div className={`absolute left-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${i === 0 ? "bg-blue-500 border-blue-500" : "bg-white border-slate-300"}`}>
                    {i === 0 && <div className="w-2 h-2 bg-white rounded-full"></div>}
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${i === 0 ? "text-blue-600" : "text-slate-700"}`}>{v.version}</span>
                        {i === 0 && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium">当前</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{v.author}</span><span>{v.created_at}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">{v.change_desc}</p>
                    {i > 0 && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleCompareVersion(v)} className="text-xs text-slate-500 hover:text-blue-600 hover:underline flex items-center gap-1">
                          <GitBranch size={10} /> 与当前对比
                        </button>
                        <button onClick={() => void handleRollback(v.version)} className="text-xs text-slate-500 hover:text-amber-600 hover:underline flex items-center gap-1">
                          <Clock size={10} /> 回滚至此版本
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {versionRows.length === 0 && <div className="text-xs text-slate-400">暂无版本记录</div>}
            </div>
          </div>
        </div>
      )}

      <FeatureDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setEditingFeature(null); }} onSave={handleSave} initial={editingFeature} />
    </div>
  );
}
