import { useState, useEffect, useCallback } from "react";
import {
  Database, Plus, RefreshCw, CheckCircle2, AlertCircle,
  Zap, Eye, GitBranch, Search, Settings, Play, Pause, X, Trash2, Download,
} from "lucide-react";
import { datasourcesApi, tasksApi, featureDevApi, featuresApi, computeApi } from "../../../api";
import type { DataSource, Task, Feature, FeatureSuggestion } from "../../../api";
import { toast } from "sonner";

function DataSourceDialog({
  open, onClose, onSave, initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<DataSource>) => void;
  initial?: DataSource | null;
}) {
  const isFileType = (t: string) => t === "CSV" || t === "XLSX";

  const [form, setForm] = useState({
    name: "", type: "MySQL", host: "", port: "", database: "", coverage: "0",
    file_path: "", pk_column: "", date_column: "", table_name: "",
  });
  const [featureColumns, setFeatureColumns] = useState<string[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        let fc: string[] = [];
        try { fc = JSON.parse(initial.feature_columns || "[]"); } catch {
          console.warn("Failed to parse feature_columns, defaulting to []");
          fc = [];
        }
        setForm({
          name: initial.name, type: initial.type, host: initial.host || "",
          port: String(initial.port || ""), database: initial.database || "",
          coverage: String(initial.coverage), file_path: initial.file_path || "",
          pk_column: initial.pk_column || "", date_column: initial.date_column || "",
          table_name: initial.table_name || "",
        });
        setFeatureColumns(fc);
      } else {
        setForm({ name: "", type: "MySQL", host: "", port: "", database: "", coverage: "0", file_path: "", pk_column: "", date_column: "", table_name: "" });
        setFeatureColumns([]);
      }
      setPreviewCols([]);
      setPreviewRows([]);
      setShowPreview(false);
    }
  }, [initial, open]);

  if (!open) return null;

  const handlePreviewFile = async () => {
    if (!form.file_path.trim()) { toast.error("请填写文件路径"); return; }
    setPreviewLoading(true);
    try {
      const result = await datasourcesApi.previewFile(
        form.file_path.trim(),
        form.type.toLowerCase() as "csv" | "xlsx",
      );
      setPreviewCols(result.columns);
      setPreviewRows(result.rows);
      setShowPreview(true);
      toast.success(`读取成功，共 ${result.columns.length} 列`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "文件读取失败");
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleFeatureColumn = (col: string) => {
    setFeatureColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("请填写数据源名称"); return; }
    const payload: Partial<DataSource> = {
      name: form.name.trim(), type: form.type, coverage: Number(form.coverage) || 0,
      pk_column: form.pk_column, date_column: form.date_column,
    };
    if (isFileType(form.type)) {
      if (!form.file_path.trim()) { toast.error("请填写文件路径"); return; }
      payload.file_path = form.file_path.trim();
      payload.feature_columns = JSON.stringify(featureColumns);
    } else {
      payload.host = form.host;
      payload.port = Number(form.port) || 0;
      payload.database = form.database;
      payload.table_name = form.table_name;
    }
    onSave(payload);
  };

  const nonKeyValueCols = previewCols.filter(c => c !== form.pk_column && c !== form.date_column);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{initial ? "编辑数据源" : "接入新数据源"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-slate-500 font-medium block mb-1.5">数据源名称 <span className="text-red-500">*</span></label>
              <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="如：用户行为数据库" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">类型</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.type}
                onChange={e => { setForm(f => ({ ...f, type: e.target.value })); setPreviewCols([]); setPreviewRows([]); setShowPreview(false); }}>
                {["MySQL", "PostgreSQL", "Hive", "HDFS", "Kafka", "API", "CSV", "XLSX"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">覆盖率 (%)</label>
              <input type="number" min="0" max="100" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" value={form.coverage} onChange={e => setForm(f => ({ ...f, coverage: e.target.value }))} />
            </div>
          </div>

          {isFileType(form.type) ? (
            <>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">文件路径 <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 font-mono" placeholder="/data/features.csv" value={form.file_path} onChange={e => setForm(f => ({ ...f, file_path: e.target.value }))} />
                  <button type="button" onClick={() => void handlePreviewFile()} disabled={previewLoading || !form.file_path.trim()} className="px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap">
                    {previewLoading ? "读取中..." : "读取预览"}
                  </button>
                </div>
              </div>
              {showPreview && previewCols.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1.5">主键列 <span className="text-red-500">*</span></label>
                      <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.pk_column} onChange={e => setForm(f => ({ ...f, pk_column: e.target.value }))}>
                        <option value="">-- 选择主键列 --</option>
                        {previewCols.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1.5">日期列</label>
                      <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.date_column} onChange={e => setForm(f => ({ ...f, date_column: e.target.value }))}>
                        <option value="">-- 选择日期列 --</option>
                        {previewCols.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  {nonKeyValueCols.length > 0 && (
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1.5">入库特征列（多选）</label>
                      <div className="border border-slate-200 rounded-lg p-3 max-h-36 overflow-y-auto grid grid-cols-3 gap-1.5">
                        {nonKeyValueCols.map(c => (
                          <label key={c} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer hover:text-blue-700">
                            <input type="checkbox" checked={featureColumns.includes(c)} onChange={() => toggleFeatureColumn(c)} className="rounded" />
                            <span className="font-mono truncate">{c}</span>
                          </label>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">已选 {featureColumns.length} / {nonKeyValueCols.length} 列</div>
                    </div>
                  )}
                  {previewRows.length > 0 && (
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1.5">数据预览（前 {previewRows.length} 行）</label>
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead><tr className="bg-slate-50">{previewCols.map(c => <th key={c} className="px-2 py-1.5 text-left text-slate-500 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
                          <tbody>{previewRows.map((row, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              {previewCols.map(c => <td key={c} className="px-2 py-1.5 text-slate-700 font-mono whitespace-nowrap">{String(row[c] ?? "")}</td>)}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">主机/端点</label>
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="db.internal" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">端口</label>
                <input type="number" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="3306" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">数据库</label>
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="database_name" value={form.database} onChange={e => setForm(f => ({ ...f, database: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">表名</label>
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="table_name" value={form.table_name} onChange={e => setForm(f => ({ ...f, table_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">主键列</label>
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="user_id" value={form.pk_column} onChange={e => setForm(f => ({ ...f, pk_column: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1.5">日期列</label>
                <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="event_date" value={form.date_column} onChange={e => setForm(f => ({ ...f, date_column: e.target.value }))} />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">取消</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">{initial ? "保存修改" : "接入"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (data: Partial<Task>) => void; }) {
  const [form, setForm] = useState({ name: "", features: "", mode: "离线", cron: "每日 01:00" });
  useEffect(() => { if (open) setForm({ name: "", features: "", mode: "离线", cron: "每日 01:00" }); }, [open]);
  if (!open) return null;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("请填写任务名称"); return; }
    onSave({ name: form.name.trim(), features: Number(form.features) || 0, mode: form.mode, cron: form.cron });
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">新建计算任务</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">任务名称 <span className="text-red-500">*</span></label>
            <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="如：贷前特征日批任务" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">计算模式</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                <option>离线</option><option>实时</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">特征数量</label>
              <input type="number" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="0" value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium block mb-1.5">调度周期</label>
            <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={form.cron} onChange={e => setForm(f => ({ ...f, cron: e.target.value }))}>
              {["每日 01:00", "每日 00:30", "每小时", "每周一 02:00", "持续运行"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">取消</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">创建</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FeatureCreateDialog({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (data: Partial<Feature>) => void; }) {
  const [form, setForm] = useState({ name: "", category: "行为特征", scene: "贷前", source: "用户行为埋点", desc: "", creator: "当前用户", definition: "" });
  const [previewRows, setPreviewRows] = useState<Array<{ userId: string; label: number; value: number }>>([]);
  const [previewStats, setPreviewStats] = useState<{ sampleCount: number; coverage: number; iv: number; ks: number; psi: number; auc: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ name: "", category: "行为特征", scene: "贷前", source: "用户行为埋点", desc: "", creator: "当前用户", definition: "" });
      setPreviewRows([]);
      setPreviewStats(null);
    }
  }, [open]);
  if (!open) return null;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("请填写特征名称"); return; }
    if (!form.definition.trim()) { toast.error("请填写特征定义表达式"); return; }
    onSave({ ...form, name: form.name.trim(), definition: form.definition.trim() });
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
          <h2 className="font-semibold text-slate-900">新建特征</h2>
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
                {["用户行为埋点", "业务核心库", "征信数据", "三方数据", "设备指纹服务"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium block mb-1.5">创建人</label>
              <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" value={form.creator} onChange={e => setForm(f => ({ ...f, creator: e.target.value }))} />
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
                <div className="text-[11px] text-slate-400">预览后创建，确保可在分析页评估</div>
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
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">创建</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const templates = [
  { id: "T001", name: "近N日统计均值", category: "统计型", params: ["字段", "N日", "过滤条件"], desc: "计算近N日指定字段的均值，支持分组聚合", uses: 234 },
  { id: "T002", name: "近N日统计求和", category: "统计型", params: ["字段", "N日"], desc: "计算近N日指定字段的总和", uses: 189 },
  { id: "T003", name: "时间段占比", category: "比率型", params: ["时间段", "字段", "分母字段"], desc: "计算特定时间段内的交易/行为占比", uses: 156 },
  { id: "T004", name: "变化率特征", category: "趋势型", params: ["字段", "基准期", "对比期"], desc: "计算字段在两个时间段之间的变化率", uses: 98 },
  { id: "T005", name: "分位数特征", category: "统计型", params: ["字段", "N日", "分位数"], desc: "计算近N日字段的分位数值", uses: 87 },
  { id: "T006", name: "最大值/最小值", category: "极值型", params: ["字段", "N日"], desc: "计算近N日字段的最大值或最小值", uses: 143 },
];

const tabs = ["数据源管理", "特征设计工作台", "计算调度中心"];

export function FeatureDevelopment() {
  const [activeTab, setActiveTab] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [datasources, setDatasources] = useState<DataSource[]>([]);
  const [dsLoading, setDsLoading] = useState(false);
  const [dsDialogOpen, setDsDialogOpen] = useState(false);
  const [editingDs, setEditingDs] = useState<DataSource | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<Array<{ userId: string; label: number; value: number }>>([]);
  const [suggestions, setSuggestions] = useState<FeatureSuggestion[]>([]);
  const [previewStats, setPreviewStats] = useState<{ sampleCount: number; coverage: number; iv: number; ks: number; psi: number; auc: number } | null>(null);
  const [workbenchFeatureName, setWorkbenchFeatureName] = useState("近30日夜间交易金额占比");
  const [workbenchFeatureId, setWorkbenchFeatureId] = useState("FT_BEH_DERIVED");
  const [workbenchSource, setWorkbenchSource] = useState("用户行为埋点");
  const [workbenchScene, setWorkbenchScene] = useState("贷前审批");
  const [workbenchDefinition, setWorkbenchDefinition] = useState("night_txn_ratio / (query_6m + 1)");
  const [workbenchCategory, setWorkbenchCategory] = useState("行为特征");
  const [workbenchDatasourceId, setWorkbenchDatasourceId] = useState("");

  // Compute panel state
  const [computePanelOpen, setComputePanelOpen] = useState(false);
  const [computeEngine, setComputeEngine] = useState<"polars" | "hive">("polars");
  const [computeCategory, setComputeCategory] = useState("全部");
  const [computeFeatureIds, setComputeFeatureIds] = useState<string[]>([]);
  const [allFeatures, setAllFeatures] = useState<Feature[]>([]);
  const [computeSavePath, setComputeSavePath] = useState("");
  const [computeHiveDb, setComputeHiveDb] = useState("");
  const [computeHiveTable, setComputeHiveTable] = useState("");
  const [computeRunning, setComputeRunning] = useState(false);
  const [computeJobResult, setComputeJobResult] = useState<{ job_id: string; status: string; feature_count: number; duration_ms: number } | null>(null);
  const [computeImporting, setComputeImporting] = useState(false);

  const loadDatasources = useCallback(async () => {
    setDsLoading(true);
    try { const data = await datasourcesApi.list(searchText || undefined); setDatasources(data); }
    catch { toast.error("加载数据源失败"); }
    finally { setDsLoading(false); }
  }, [searchText]);

  const loadTasks = useCallback(async () => {
    setTaskLoading(true);
    try { const data = await tasksApi.list(); setTasks(data); }
    catch { toast.error("加载任务失败"); }
    finally { setTaskLoading(false); }
  }, []);

  useEffect(() => { loadDatasources(); }, [loadDatasources]);
  useEffect(() => { if (activeTab === 2) loadTasks(); }, [activeTab, loadTasks]);
  useEffect(() => {
    if (activeTab === 1) {
      featureDevApi.suggestions(3).then(res => setSuggestions(res.recommendations)).catch(() => setSuggestions([]));
    }
  }, [activeTab]);
  useEffect(() => {
    if (activeTab === 2) {
      featuresApi.list().then(data => setAllFeatures(data)).catch(() => setAllFeatures([]));
    }
  }, [activeTab]);

  const handleSaveDs = async (data: Partial<DataSource>) => {
    try {
      if (editingDs) {
        const updated = await datasourcesApi.update(editingDs.id, data);
        setDatasources(prev => prev.map(d => d.id === editingDs.id ? updated : d));
        toast.success("数据源已更新");
      } else {
        const created = await datasourcesApi.create(data);
        setDatasources(prev => [...prev, created]);
        toast.success("数据源接入成功");
      }
      setDsDialogOpen(false); setEditingDs(null);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "操作失败"); }
  };

  const handleDeleteDs = async (id: string) => {
    if (!confirm("确定删除该数据源？")) return;
    try { await datasourcesApi.delete(id); setDatasources(prev => prev.filter(d => d.id !== id)); toast.success("已删除"); }
    catch { toast.error("删除失败"); }
  };

  const handleSaveTask = async (data: Partial<Task>) => {
    try {
      const created = await tasksApi.create(data);
      setTasks(prev => [...prev, created]);
      toast.success("任务已创建");
      setTaskDialogOpen(false);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "创建失败"); }
  };

  const handleToggleTask = async (id: string) => {
    try {
      const updated = await tasksApi.toggle(id);
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
      toast.success(updated.status === "暂停" ? "任务已暂停" : "任务已启动");
    } catch { toast.error("操作失败"); }
  };

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`确认删除任务「${task.name}」？`)) return;
    try { await tasksApi.delete(task.id); setTasks(prev => prev.filter(t => t.id !== task.id)); toast.success("任务已删除"); }
    catch { toast.error("删除失败"); }
  };

  const filteredComputeFeatures = computeCategory === "全部"
    ? allFeatures
    : allFeatures.filter(f => f.category === computeCategory);

  const toggleComputeFeature = (id: string) => {
    setComputeFeatureIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSelectAllComputeFeatures = () => {
    const ids = filteredComputeFeatures.map(f => f.id);
    const allSelected = ids.every(id => computeFeatureIds.includes(id));
    if (allSelected) {
      setComputeFeatureIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setComputeFeatureIds(prev => Array.from(new Set([...prev, ...ids])));
    }
  };

  const handleComputeRun = async () => {
    if (computeFeatureIds.length === 0 && computeCategory === "全部") {
      if (!confirm("未选择特征或类别，将计算所有特征。确认继续？")) return;
    }
    if (computeEngine === "polars" && !computeSavePath.trim()) {
      toast.error("请填写 Parquet 保存路径");
      return;
    }
    if (computeEngine === "hive" && (!computeHiveDb.trim() || !computeHiveTable.trim())) {
      toast.error("请填写目标 Hive 数据库和表名");
      return;
    }
    setComputeRunning(true);
    setComputeJobResult(null);
    try {
      const result = await computeApi.run({
        engine: computeEngine,
        feature_ids: computeFeatureIds.length > 0 ? computeFeatureIds : undefined,
        category: computeCategory !== "全部" ? computeCategory : undefined,
        save_path: computeEngine === "polars" ? computeSavePath.trim() : undefined,
        hive_database: computeEngine === "hive" ? computeHiveDb.trim() : undefined,
        hive_table: computeEngine === "hive" ? computeHiveTable.trim() : undefined,
      });
      setComputeJobResult(result);
      toast.success(`计算完成，${result.feature_count} 个特征，耗时 ${result.duration_ms}ms`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "计算失败");
    } finally {
      setComputeRunning(false);
    }
  };

  const handleComputeImport = async () => {
    if (!computeJobResult) return;
    setComputeImporting(true);
    try {
      const res = await computeApi.importDatasource(computeJobResult.job_id);
      toast.success(`衍生数据源已入库，ID: ${res.datasource?.id}，特征元数据已关联`);
      await loadDatasources();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "入库失败");
    } finally {
      setComputeImporting(false);
    }
  };

  const handleSaveFeature = async (data: Partial<Feature>) => {
    try {
      const payload = {
        name: String(data.name || ""),
        category: String(data.category || "行为特征"),
        scene: String(data.scene || workbenchScene),
        source: String(data.source || "用户行为埋点"),
        desc: String(data.desc || ""),
        creator: String(data.creator || "当前用户"),
        definition: String(data.definition || workbenchDefinition),
      };
      const result = await featureDevApi.validateSave(payload);
      setPreviewRows(result.preview.rows);
      setPreviewStats(result.preview.stats);
      setWorkbenchFeatureName(result.feature.name);
      setWorkbenchSource(result.feature.source);
      setWorkbenchScene(result.feature.scene);
      setWorkbenchDefinition(result.feature.definition || payload.definition);
      toast.success('特征已创建，状态为「测试中」');
      setFeatureDialogOpen(false);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "创建失败"); }
  };

  const handlePreview = async () => {
    try {
      const data = await featureDevApi.preview({ definition: workbenchDefinition, limit: 10 });
      setPreviewRows(data.rows);
      setPreviewStats(data.stats);
      toast.success(`数据预览完成，共返回 ${data.rows.length} 行`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "数据预览失败");
    }
  };

  const handleValidateAndSaveFromWorkbench = async () => {
    try {
      const result = await featureDevApi.validateSave({
        name: workbenchFeatureName,
        category: workbenchCategory,
        scene: workbenchScene,
        source: workbenchSource,
        desc: "工作台验证并保存",
        creator: "当前用户",
        definition: workbenchDefinition,
        datasource_id: workbenchDatasourceId || undefined,
      });
      setPreviewRows(result.preview.rows);
      setPreviewStats(result.preview.stats);
      setWorkbenchFeatureName(result.feature.name);
      setWorkbenchScene(result.feature.scene);
      setWorkbenchSource(result.feature.source);
      setWorkbenchDefinition(result.feature.definition || workbenchDefinition);
      toast.success(`特征定义验证通过，已保存到特征资产库，ID: ${result.feature.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "验证保存失败");
    }
  };

  const runningTasks = tasks.filter(t => t.status === "运行中").length;
  const waitingTasks = tasks.filter(t => t.status === "等待中").length;
  const pausedTasks = tasks.filter(t => t.status === "暂停").length;
  const totalF = tasks.reduce((s, t) => s + t.features, 0);
  const totalS = tasks.reduce((s, t) => s + t.success, 0);
  const successRate = totalF > 0 ? ((totalS / totalF) * 100).toFixed(1) + "%" : "—";

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-900 font-semibold text-xl">特征开发与衍生</h1>
          <p className="text-slate-500 text-sm mt-0.5">从原始数据到可用特征的全流程线上化生产车间</p>
        </div>
        <button onClick={() => setFeatureDialogOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={14} />新建特征
        </button>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map((tab, i) => (
          <button key={i} onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "数据源总数", value: String(datasources.length), icon: Database, color: "blue" },
              { label: "接入表数量", value: String(datasources.reduce((s, d) => s + d.tables, 0)), icon: GitBranch, color: "emerald" },
              { label: "实时源", value: String(datasources.filter(d => d.lastSync === "实时" || d.type === "Kafka").length), icon: Zap, color: "violet" },
              { label: "数据质量告警", value: String(datasources.filter(d => d.status === "告警").length), icon: AlertCircle, color: "amber" },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.color === "blue" ? "bg-blue-50 text-blue-600" : s.color === "emerald" ? "bg-emerald-50 text-emerald-600" : s.color === "violet" ? "bg-violet-50 text-violet-600" : "bg-amber-50 text-amber-600"}`}><s.icon size={16} /></div>
                <div><p className="text-slate-500 text-xs">{s.label}</p><p className="text-slate-900 font-bold">{s.value}</p></div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-slate-800 font-semibold text-sm">数据源列表</h3>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <Search size={12} className="text-slate-400" />
                  <input className="text-xs bg-transparent outline-none text-slate-600 w-32" placeholder="搜索数据源..." value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={e => e.key === "Enter" && loadDatasources()} />
                </div>
                <button onClick={() => { setEditingDs(null); setDsDialogOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                  <Plus size={12} /> 接入数据源
                </button>
              </div>
            </div>
            {dsLoading ? (
              <div className="py-12 text-center text-slate-400 text-sm">加载中...</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["ID", "数据源名称", "类型", "表数量", "连接状态", "接口延迟", "最近同步", "数据覆盖率", "操作"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datasources.map(ds => (
                    <tr key={ds.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{ds.id}</td>
                      <td className="px-4 py-3 text-sm text-slate-800 font-medium">{ds.name}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">{ds.type}</span></td>
                      <td className="px-4 py-3 text-sm text-slate-600">{ds.tables}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ds.status === "正常" ? "bg-emerald-50 text-emerald-600" : ds.status === "告警" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>{ds.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">{ds.latency}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{ds.lastSync}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 w-16">
                            <div className={`h-1.5 rounded-full ${ds.coverage >= 90 ? "bg-emerald-500" : ds.coverage >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${ds.coverage}%` }}></div>
                          </div>
                          <span className="text-xs text-slate-500">{ds.coverage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingDs(ds); setDsDialogOpen(true); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="编辑"><Settings size={12} /></button>
                          <button onClick={() => loadDatasources()} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-600" title="刷新"><RefreshCw size={12} /></button>
                          <button onClick={() => handleDeleteDs(ds.id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600" title="删除"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 1 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-4 border-b border-slate-100">
              <h3 className="text-slate-800 font-semibold text-sm">特征模板库</h3>
              <p className="text-slate-400 text-xs mt-0.5">内置通用衍生函数</p>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto max-h-[500px]">
              {templates.map(t => (
                <div key={t.id} className="p-3 border border-slate-100 rounded-lg hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition-all group">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-slate-800 font-medium group-hover:text-blue-700">{t.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{t.desc}</div>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded ml-2 flex-shrink-0">{t.category}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {t.params.map(p => <span key={p} className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-mono">{p}</span>)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5">已使用 {t.uses} 次</div>
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-2 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-slate-800 font-semibold text-sm mb-4">特征定义配置</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">特征名称</label>
                  <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" value={workbenchFeatureName} onChange={e => setWorkbenchFeatureName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">特征ID</label>
                  <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50 text-slate-500" readOnly value={workbenchFeatureId} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">特征类别</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={workbenchCategory} onChange={e => setWorkbenchCategory(e.target.value)}>
                    {["行为特征", "信用历史", "设备特征", "多头行为"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">业务场景</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={workbenchScene} onChange={e => setWorkbenchScene(e.target.value)}>
                    <option>贷前审批</option><option>贷中监控</option><option>贷后催收</option><option>反欺诈</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">数据来源</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={workbenchSource} onChange={e => setWorkbenchSource(e.target.value)}>
                    <option>用户行为埋点</option><option>业务核心库</option><option>征信数据（人行）</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1.5">关联数据源（可选）</label>
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white" value={workbenchDatasourceId} onChange={e => setWorkbenchDatasourceId(e.target.value)}>
                    <option value="">-- 不关联 --</option>
                    {datasources.map(ds => <option key={ds.id} value={ds.id}>{ds.name} ({ds.type})</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-slate-500 font-medium block mb-1.5">特征定义表达式</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none resize-none font-mono focus:border-blue-400"
                  value={workbenchDefinition}
                  onChange={e => setWorkbenchDefinition(e.target.value)}
                  placeholder="如：night_txn_ratio / (query_6m + 1)"
                />
                <div className="mt-1.5 text-xs text-slate-400">
                  可用字段：query_6m、overdue_days_30d、night_txn_ratio、device_risk_score、multi_apply_3m、login_7d、apply_amount_ratio、register_days、third_party_score、income_pred_score
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-slate-500 font-medium block mb-1.5">计算逻辑（SQL/表达式）</label>
                <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-emerald-400 leading-relaxed">
                  <span className="text-blue-400">FIELD</span>: <span className="text-yellow-300">{workbenchDefinition}</span><br />
                  <span className="text-blue-400">SOURCE</span>: <span className="text-yellow-300">{workbenchSource}</span><br />
                  <span className="text-blue-400">SCENE</span>: <span className="text-yellow-300">{workbenchScene}</span><br />
                  <span className="text-blue-400">FEATURE</span>: <span className="text-yellow-300">{workbenchFeatureName}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => void handlePreview()} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"><Eye size={14} /> 数据预览</button>
                <button onClick={() => void handleValidateAndSaveFromWorkbench()} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"><CheckCircle2 size={14} /> 验证并保存到资产库</button>
              </div>
              {previewRows.length > 0 && (
                <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 text-xs bg-slate-50 text-slate-500">预览样本（user_id / label / value）</div>
                  {previewStats && (
                    <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs bg-white border-b border-slate-100 text-slate-600">
                      <div>覆盖率: {previewStats.coverage}%</div>
                      <div>IV: {previewStats.iv}</div>
                      <div>KS: {previewStats.ks}</div>
                      <div>PSI: {previewStats.psi}</div>
                      <div>AUC: {previewStats.auc}</div>
                      <div>有效样本: {previewStats.sampleCount}</div>
                    </div>
                  )}
                  <div className="max-h-40 overflow-y-auto">
                    {previewRows.map(r => (
                      <div key={r.userId} className="px-3 py-2 text-xs text-slate-700 border-t border-slate-100 font-mono">
                        {r.userId} / {r.label} / {r.value.toFixed(4)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">智能衍生建议</span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">AI 推荐</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(suggestions.length > 0 ? suggestions : [
                  { name: "近30日夜间交易次数", type: "计数型", reason: "与占比互补的次数指标", definition: "night_txn_ratio * login_7d" },
                  { name: "近7日 vs 近30日夜间交易比值", type: "趋势型", reason: "短期行为变化趋势", definition: "night_txn_ratio / (apply_amount_ratio + 1)" },
                  { name: "夜间最大单笔金额", type: "极值型", reason: "异常交易识别能力强", definition: "night_txn_ratio * device_risk_score" },
                ]).map(s => (
                  <div key={s.name} onClick={() => { setWorkbenchFeatureName(s.name); setWorkbenchFeatureId(`FT_AUTO_${Date.now()}`); if (s.definition) setWorkbenchDefinition(s.definition); toast.info(`已选择模板：${s.name}`); }} className="bg-white rounded-lg p-3 border border-blue-100 cursor-pointer hover:border-blue-300">
                    <div className="text-xs font-medium text-slate-800">{s.name}</div>
                    <div className="text-xs text-slate-400 mt-1">{s.reason}</div>
                    <span className="text-xs mt-1.5 inline-block px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{s.type}</span>
                    {s.definition && <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">{s.definition}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 2 && (
        <div className="space-y-4">
          {/* Batch compute panel */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              onClick={() => setComputePanelOpen(o => !o)}
            >
              <div className="flex items-center gap-2">
                <Zap size={15} className="text-blue-600" />
                <span className="text-slate-800 font-semibold text-sm">离线批量计算</span>
                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">Polars / Hive</span>
              </div>
              <span className="text-slate-400 text-xs">{computePanelOpen ? "收起 ▲" : "展开 ▼"}</span>
            </button>
            {computePanelOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
                {/* Feature selection */}
                <div className="pt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1.5">特征类别筛选</label>
                    <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white"
                      value={computeCategory} onChange={e => { setComputeCategory(e.target.value); setComputeFeatureIds([]); }}>
                      {["全部", "行为特征", "信用历史", "设备特征", "多头行为"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleSelectAllComputeFeatures} className="px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                      {filteredComputeFeatures.length > 0 && filteredComputeFeatures.every(f => computeFeatureIds.includes(f.id)) ? "全部取消" : "全选"}
                    </button>
                  </div>
                </div>
                {filteredComputeFeatures.length > 0 && (
                  <div className="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto grid grid-cols-3 gap-1.5">
                    {filteredComputeFeatures.map(f => (
                      <label key={f.id} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer hover:text-blue-700">
                        <input type="checkbox" checked={computeFeatureIds.includes(f.id)} onChange={() => toggleComputeFeature(f.id)} className="rounded" />
                        <span className="truncate" title={f.name}>{f.name}</span>
                      </label>
                    ))}
                  </div>
                )}
                <div className="text-[11px] text-slate-400">
                  已选 {computeFeatureIds.length} 个特征
                  {computeCategory !== "全部" && computeFeatureIds.length === 0 && "（未选择时将计算该类别全部特征）"}
                </div>

                {/* Engine selection */}
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-2">计算引擎</label>
                  <div className="flex gap-4">
                    {(["polars", "hive"] as const).map(e => (
                      <label key={e} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="radio" name="engine" value={e} checked={computeEngine === e} onChange={() => setComputeEngine(e)} />
                        <span className="font-mono">{e === "polars" ? "Polars (本地/HDFS)" : "Hive CLI"}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Destination config */}
                {computeEngine === "polars" ? (
                  <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1.5">Parquet 保存路径 <span className="text-red-500">*</span></label>
                    <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 font-mono"
                      placeholder="/data/features/output.parquet"
                      value={computeSavePath} onChange={e => setComputeSavePath(e.target.value)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1.5">目标 Hive 数据库 <span className="text-red-500">*</span></label>
                      <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 font-mono"
                        placeholder="feature_db"
                        value={computeHiveDb} onChange={e => setComputeHiveDb(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-medium block mb-1.5">目标 Hive 表 <span className="text-red-500">*</span></label>
                      <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 font-mono"
                        placeholder="derived_features"
                        value={computeHiveTable} onChange={e => setComputeHiveTable(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Run button */}
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={() => void handleComputeRun()} disabled={computeRunning} className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    <Play size={14} />
                    {computeRunning ? "计算中..." : "开始计算"}
                  </button>
                  {computeJobResult && computeJobResult.status === "success" && (
                    <button onClick={() => void handleComputeImport()} disabled={computeImporting} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                      <Download size={14} />
                      {computeImporting ? "入库中..." : "将衍生结果入库"}
                    </button>
                  )}
                </div>

                {/* Job result */}
                {computeJobResult && (
                  <div className={`rounded-lg p-3 text-sm border ${computeJobResult.status === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                    <div className="flex items-center gap-2 font-medium">
                      {computeJobResult.status === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      {computeJobResult.status === "success" ? "计算成功" : "计算失败"}
                    </div>
                    {computeJobResult.status === "success" && (
                      <div className="mt-1 text-xs space-x-4">
                        <span>特征数量: {computeJobResult.feature_count}</span>
                        <span>耗时: {computeJobResult.duration_ms}ms</span>
                        <span>任务ID: {computeJobResult.job_id}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "运行中任务", value: String(runningTasks), color: "emerald" },
              { label: "等待中任务", value: String(waitingTasks), color: "blue" },
              { label: "已暂停任务", value: String(pausedTasks), color: "amber" },
              { label: "今日成功率", value: successRate, color: "violet" },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className={`text-2xl font-bold ${s.color === "emerald" ? "text-emerald-600" : s.color === "blue" ? "text-blue-600" : s.color === "amber" ? "text-amber-600" : "text-violet-600"}`}>{s.value}</p>
                <p className="text-slate-500 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-slate-800 font-semibold text-sm">计算任务列表</h3>
              <button onClick={() => setTaskDialogOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                <Plus size={12} /> 新建任务
              </button>
            </div>
            {taskLoading ? (
              <div className="py-12 text-center text-slate-400 text-sm">加载中...</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["任务ID", "任务名称", "计算模式", "调度周期", "状态", "上次运行", "耗时", "成功/总计", "操作"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task => (
                    <tr key={task.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{task.id}</td>
                      <td className="px-4 py-3 text-sm text-slate-800 font-medium">{task.name}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${task.mode === "实时" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"}`}>{task.mode}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-600">{task.cron}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 text-xs font-medium ${task.status === "运行中" ? "text-emerald-600" : task.status === "等待中" ? "text-blue-600" : "text-amber-600"}`}>
                          {task.status === "运行中" && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>}
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{task.lastRun}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{task.duration}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{task.success}/{task.features}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => handleToggleTask(task.id)} className={`p-1.5 rounded transition-colors ${task.status === "暂停" ? "hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" : "hover:bg-amber-50 text-slate-400 hover:text-amber-600"}`} title={task.status === "暂停" ? "启动" : "暂停"}>
                            {task.status === "暂停" ? <Play size={12} /> : <Pause size={12} />}
                          </button>
                          <button onClick={() => handleDeleteTask(task)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600" title="删除"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <DataSourceDialog open={dsDialogOpen} onClose={() => { setDsDialogOpen(false); setEditingDs(null); }} onSave={handleSaveDs} initial={editingDs} />
      <TaskDialog open={taskDialogOpen} onClose={() => setTaskDialogOpen(false)} onSave={handleSaveTask} />
      <FeatureCreateDialog open={featureDialogOpen} onClose={() => setFeatureDialogOpen(false)} onSave={handleSaveFeature} />
    </div>
  );
}
