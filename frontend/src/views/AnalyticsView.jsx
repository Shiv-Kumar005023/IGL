import React, { useState, useEffect } from "react";
import { BarChart3, Database, AlertTriangle } from "lucide-react";
import { fetchAnalyticsApi } from "../services/api";

export default function AnalyticsView() {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetchAnalyticsApi();
      setAnalyticsData(res);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          Safety Reports & Analytics Graphs
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Safety trend graphs calculated strictly from actual alert records saved in database.
        </p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs font-mono">
          Loading safety database reports...
        </div>
      ) : !analyticsData || !analyticsData.has_data ? (
        /* Empty Database State Banner */
        <div className="p-12 text-center text-slate-400 text-xs space-y-3 border border-dashed border-slate-800 rounded-2xl glass-panel">
          <Database className="w-12 h-12 mx-auto text-slate-600 mb-1" />
          <h3 className="text-base font-bold text-slate-200">No data available for analytics</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            There are zero saved safety incidents in the database right now. As soon as a real camera alert is detected or tested, summary charts will automatically appear here.
          </p>
        </div>
      ) : (
        /* Real Analytics Data Breakdown */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Event Breakdown */}
          <div className="p-6 rounded-2xl glass-panel space-y-4">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Alert Types Breakdown
            </h2>

            <div className="space-y-3">
              {analyticsData.event_breakdown.map((item) => (
                <div key={item.event_type} className="space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>{item.event_type.replace(/_/g, " ")}</span>
                    <span className="font-bold text-cyan-400">{item.count} Incidents</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (item.count / analyticsData.total_alerts) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Severity Breakdown */}
          <div className="p-6 rounded-2xl glass-panel space-y-4">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Danger Level Distribution
            </h2>

            <div className="space-y-3">
              {analyticsData.severity_breakdown.map((item) => (
                <div key={item.severity} className="space-y-1">
                  <div className="flex justify-between text-slate-300">
                    <span>{item.severity}</span>
                    <span className={`font-bold ${item.severity === "CRITICAL" ? "text-red-400" : "text-amber-400"}`}>
                      {item.count} Alerts
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(100, (item.count / analyticsData.total_alerts) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
