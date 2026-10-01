import React, { useState } from "react";
import { Zap, ShieldAlert, Radio, CheckCircle } from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function NearMissView() {
  const { alerts, dispatchAlert } = useSafety();

  const nearMissAlerts = alerts.filter((a) => a.event_type === "NEAR_MISS");

  const [measuredDist, setMeasuredDist] = useState(0.85); // 0.85 meters
  const [vehicleId, setVehicleId] = useState("Forklift #FLT-09");
  const [workerId, setWorkerId] = useState("Worker #104");

  const handleTestNearMiss = () => {
    dispatchAlert({
      event_type: "NEAR_MISS",
      zone_name: "Loading Dock Bay 2",
      severity: measuredDist < 1.0 ? "CRITICAL" : "HIGH",
      confidence: 0.94,
      metadata: {
        distance_m: measuredDist,
        vehicle_id: vehicleId,
        worker_id: workerId,
        risk_score: Math.round((1.5 - measuredDist) * 100)
      }
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" />
            Worker & Vehicle Distance Radar (Near-Miss Alert)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Monitors safe distance between workers on foot and moving forklifts or trucks.
          </p>
        </div>

        <button
          onClick={handleTestNearMiss}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-blue-500/20 flex items-center gap-2"
        >
          <Zap className="w-4 h-4" />
          <span>Record Near-Miss Warning</span>
        </button>
      </div>

      {/* Main Grid: Radar Screen + Slider Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar View Box */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass-panel space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            Live Distance Radar Screen
          </h2>

          <div className="relative aspect-video rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
            {/* Radar Grid Circles */}
            <div className="absolute w-[80%] aspect-square rounded-full border border-cyan-500/20" />
            <div className="absolute w-[50%] aspect-square rounded-full border border-cyan-500/30" />
            <div className="absolute w-[20%] aspect-square rounded-full border border-red-500/40" />

            {/* Radar Line */}
            <div className="absolute w-full h-full animate-radar opacity-40">
              <div className="w-1/2 h-1/2 bg-gradient-to-tr from-cyan-500/30 to-transparent origin-bottom-right" />
            </div>

            {/* Vehicle Icon Node */}
            <div className="absolute top-[40%] left-[60%] -translate-x-1/2 -translate-y-1/2 p-2 rounded-xl bg-blue-500/20 border border-blue-400 text-blue-400 text-[10px] font-bold shadow-lg">
              {vehicleId}
            </div>

            {/* Worker Icon Node */}
            <div className="absolute top-[48%] left-[48%] -translate-x-1/2 -translate-y-1/2 p-2 rounded-xl bg-red-500/20 border border-red-400 text-red-400 text-[10px] font-bold animate-pulse shadow-lg">
              {workerId}
            </div>

            {/* Proximity Line */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <line x1="60%" y1="40%" x2="48%" y2="48%" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 4" />
            </svg>

            {/* Distance Box */}
            <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200">
              <span>Measured Distance: <strong className="text-red-400 font-bold">{measuredDist} meters</strong> (Safe Distance: &gt; 2.0m)</span>
            </div>
          </div>
        </div>

        {/* Distance Controls */}
        <div className="p-6 rounded-2xl glass-panel space-y-4 text-xs">
          <h2 className="text-sm font-bold text-slate-200">Test Distance Settings</h2>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Worker Distance from Vehicle (Meters):</label>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.05"
                value={measuredDist}
                onChange={(e) => setMeasuredDist(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-slate-500 text-[10px]">
                <span>0.2m (DANGER)</span>
                <span className="text-cyan-400 font-bold">{measuredDist}m</span>
                <span>3.0m (SAFE)</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Vehicle Name / ID:</label>
              <input
                type="text"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Worker Name / Track ID:</label>
              <input
                type="text"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Near-Miss Log Table */}
      <div className="p-6 rounded-2xl glass-panel space-y-4">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-400" />
          Near-Miss Distance Warning Log ({nearMissAlerts.length})
        </h2>

        {nearMissAlerts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2 border border-dashed border-slate-800 rounded-xl">
            <CheckCircle className="w-10 h-10 mx-auto text-emerald-500/50 mb-1" />
            <p className="text-slate-300 font-semibold">Zero Near-Miss Incidents Recorded</p>
            <p className="text-slate-500">No dangerous worker-vehicle proximity warnings logged in database.</p>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            {nearMissAlerts.map((n) => (
              <div key={n.id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-200">{n.event_type} - {n.zone_name}</h4>
                  <p className="text-slate-400 text-[11px]">Distance: <strong className="text-red-400">{n.metadata?.distance_m || 0.85}m</strong> | Vehicle: {n.metadata?.vehicle_id}</p>
                </div>
                <span className="text-slate-500 font-mono">{n.detected_at}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
