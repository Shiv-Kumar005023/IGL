import React from "react";
import {
  Home,
  Tv,
  ShieldAlert,
  AlertTriangle,
  Flame,
  BarChart2,
  Activity,
  Settings,
  ShieldCheck,
  Camera,
  Boxes,
  UserCheck,
  Users
} from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function Sidebar() {
  const { activeTab, setActiveTab, stats, personnelEvents, alerts } = useSafety();

  const activePersonnelAlerts = (personnelEvents || []).filter(e => e.status !== "RESOLVED").length;
  const unknownAlerts = (alerts || []).filter(a => a.event_type === "UNKNOWN_PERSON" && a.status !== "RESOLVED").length;

  const navItems = [
    { id: "dashboard", label: "Overview", icon: Home },
    { id: "camera-input", label: "Camera Setup", icon: Camera, badge: stats.cameras_online > 0 ? "LIVE" : null },
    { id: "live-monitoring", label: "Live Monitoring", icon: Tv },
    { id: "expected-personnel", label: "Expected Personnel", icon: UserCheck, badge: unknownAlerts > 0 ? unknownAlerts : "ALERT" },
    { id: "personnel-monitoring", label: "Personnel Monitoring", icon: Users, badge: activePersonnelAlerts > 0 ? activePersonnelAlerts : "NEW" },
    { id: "packaging", label: "Packaging Inspection", icon: Boxes },
    { id: "alerts", label: "Safety Events", icon: ShieldAlert, badge: stats.active_alerts > 0 ? stats.active_alerts : null },
    { id: "near-miss", label: "Near Miss", icon: AlertTriangle },
    { id: "personnel", label: "Incidents", icon: Flame },
    { id: "analytics", label: "Analytics", icon: BarChart2 },
    { id: "camera-health", label: "Camera & AI Health", icon: Activity },
    { id: "config", label: "Configuration", icon: Settings }
  ];

  return (
    <aside className="w-56 border-r border-slate-200 bg-slate-50/70 flex flex-col justify-between shrink-0 min-h-[calc(100vh-4rem)] font-sans">
      <div className="p-3 space-y-1">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all text-xs ${
                  isActive
                    ? "bg-sky-100/80 text-sky-800 font-semibold shadow-2xs border border-sky-200/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 font-medium"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-sky-700" : "text-slate-500"}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 border border-red-200 shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Safety First Footer */}
      <div className="p-4 border-t border-slate-200 bg-white text-xs space-y-1">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Safety First</span>
        </div>
        <p className="text-[10px] text-slate-400 font-medium pl-6">
          People | Process | Planet
        </p>
      </div>
    </aside>
  );
}
