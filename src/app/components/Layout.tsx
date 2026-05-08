import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard,
  Wrench,
  BarChart3,
  Database,
  Activity,
  GitBranch,
  ChevronLeft,
  Bell,
  Settings,
  User,
  Shield,
  ChevronRight,
} from "lucide-react";
import { Toaster } from "sonner";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "平台概览", badge: null },
  { path: "/feature-dev", icon: Wrench, label: "特征开发", badge: null },
  { path: "/feature-analysis", icon: BarChart3, label: "特征分析", badge: "3" },
  { path: "/feature-library", icon: Database, label: "特征资产库", badge: null },
  { path: "/monitoring", icon: Activity, label: "监控运维", badge: "2" },
  { path: "/rule-mining", icon: GitBranch, label: "规则挖掘", badge: "新" },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`relative flex flex-col bg-slate-900 transition-all duration-300 ease-in-out ${
          collapsed ? "w-16" : "w-60"
        } flex-shrink-0`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/60">
          <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-lg flex-shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-white text-sm font-semibold whitespace-nowrap">智能特征分析</div>
              <div className="text-slate-400 text-xs whitespace-nowrap">风控策略平台</div>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="px-2 space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative ${
                    active
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
                  {!collapsed && (
                    <span className="text-sm font-medium flex-1 text-left whitespace-nowrap overflow-hidden">
                      {item.label}
                    </span>
                  )}
                  {!collapsed && item.badge && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        item.badge === "新"
                          ? "bg-emerald-500 text-white"
                          : "bg-amber-500 text-white"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {collapsed && item.badge && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full"></span>
                  )}
                  {/* Tooltip for collapsed */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                      {item.label}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Bottom */}
        <div className="border-t border-slate-700/60 p-3 space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
            <Settings size={16} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm">系统设置</span>}
          </button>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
              <User size={14} className="text-white" />
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <div className="text-white text-xs font-medium">张策略师</div>
                <div className="text-slate-400 text-xs">风控建模组</div>
              </div>
            )}
          </div>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-600 transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="text-slate-800 font-medium">
              {navItems.find((n) => isActive(n.path))?.label || "平台概览"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-emerald-700 text-xs font-medium">系统正常运行</span>
            </div>
            <button className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  );
}
