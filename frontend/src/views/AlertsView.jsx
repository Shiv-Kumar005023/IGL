import React, { useState } from "react";
import { Bell, CheckCircle, Filter, Eye, AlertTriangle, UserCheck } from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function AlertsView() {
  const { alerts, acknowledgeAlert, resolveAlert, setSelectedEvidence } = useSafety();
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterSeverity, setFilterSeverity] = useState("ALL");

  const filteredAlerts = alerts.filter((a) => {
    if (filterStatus !== "ALL" && a.status !== filterStatus) return false;
    if (filterSeverity !== "ALL" && a.severity !== filterSeverity) return false;
    return true;
  });

  const handleResolvePrompt = (alertId) => {
    const notes = prompt("Enter resolution notes:", "Safety inspector checked on site. Issue resolved.");
    if (notes) {
      resolveAlert(alertId, notes, "Plant Safety Manager");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            Safety Alert Log & Incident Resolution
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track safety violations detected by camera. View photo evidence and mark issues as fixed.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-400">Status Filter:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-cyan-400 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="DETECTED">New / Unresolved</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved / Fixed</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-slate-400">Danger Level:</span>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="bg-transparent text-cyan-400 focus:outline-none"
            >
              <option value="ALL">All Levels</option>
              <option value="CRITICAL">Critical Danger</option>
              <option value="HIGH">High Danger</option>
              <option value="MEDIUM">Medium Warning</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alerts Table / List */}
      <div className="p-6 rounded-2xl glass-panel space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2 border border-dashed border-slate-800 rounded-xl">
            <CheckCircle className="w-10 h-10 mx-auto text-emerald-500/50 mb-1" />
            <p className="text-slate-300 font-semibold">No Safety Alerts Found</p>
            <p className="text-slate-500">There are no alert entries matching your filter right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                {/* Left info */}
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl shrink-0 ${
                    alert.severity === "CRITICAL" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                  }`}>
                    <AlertTriangle className="w-5 h-5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-100">{alert.event_type.replace(/_/g, " ")}</h3>
                      <span className={`px-2 py-0.5 text-[10px] rounded font-bold ${
                        alert.status === "RESOLVED" ? "bg-emerald-500/20 text-emerald-400" :
                        alert.status === "ACKNOWLEDGED" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {alert.status}
                      </span>
                    </div>

                    <p className="text-slate-400 text-xs">
                      Location: <strong className="text-slate-200">{alert.zone_name}</strong> | Camera: {alert.camera_name}
                    </p>

                    <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1 font-mono">
                      <span>Time: {alert.detected_at}</span>
                      <span>AI Match: <strong className="text-cyan-400">{Math.round((alert.confidence || 0.95) * 100)}%</strong></span>
                    </div>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                  <button
                    onClick={() => setSelectedEvidence(alert)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span>View Evidence Photo</span>
                  </button>

                  {alert.status === "DETECTED" && (
                    <button
                      onClick={() => acknowledgeAlert(alert.id, "Safety Controller")}
                      className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-lg shadow-blue-500/20 flex items-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Acknowledge</span>
                    </button>
                  )}

                  {alert.status !== "RESOLVED" && (
                    <button
                      onClick={() => handleResolvePrompt(alert.id)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Mark Fixed / Resolve</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
