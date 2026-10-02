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
            <div className="absolute w-[25%] aspect-square rounded-full border border-red-500/40" />

            {/* Radar Sweep Animation */}
            <div className="absolute w-full h-full animate-radar opacity-40">
              <div className="w-1/2 h-1/2 bg-gradient-to-tr from-cyan-500/30 to-transparent origin-bottom-right" />
            </div>

            {/* Dynamic Worker Position relative to Vehicle Center (50%, 50%) */}
            {(() => {
              const vehicleX = 50;
              const vehicleY = 50;
              // Map 0.2m -> 3.0m to radar distance offset (6% -> 38% radius)
              const distanceOffset = 5 + (measuredDist / 3.0) * 33;
              // Angle offset (-135 degrees = top-left direction)
              const angleRad = (-135 * Math.PI) / 180;
              const workerX = vehicleX + distanceOffset * Math.cos(angleRad);
              const workerY = vehicleY + distanceOffset * Math.sin(angleRad);
              const isDanger = measuredDist < 1.0;
              const isWarning = measuredDist >= 1.0 && measuredDist <= 2.0;

              return (
                <>
                  {/* Vehicle Safety Boundary Box (Proximity Danger Perimeter around Vehicle) */}
                  <div
                    className={`absolute rounded-2xl border-2 transition-all duration-300 pointer-events-none flex items-start justify-end p-1.5 ${
                      isDanger
                        ? "bg-red-500/20 border-red-500 shadow-[0_0_20px_#ef4444]"
                        : isWarning
                        ? "bg-amber-500/15 border-amber-400 shadow-[0_0_15px_#f59e0b]"
                        : "bg-cyan-500/10 border-cyan-500/40"
                    }`}
                    style={{
                      left: "50%",
                      top: "50%",
                      width: "38%",
                      height: "46%",
                      transform: "translate(-50%, -50%)"
                    }}
                  >
                    <span className="text-[9px] font-mono font-bold text-red-400/90 bg-slate-950/90 px-1.5 py-0.5 rounded border border-red-500/40">
                      DANGEROUS ZONE BOUNDARY (2.0m)
                    </span>
                  </div>

                  {/* Vehicle / Danger Zone Icon Node */}
                  <div
                    className="absolute p-2.5 rounded-xl bg-blue-600/30 border-2 border-blue-400 text-blue-300 text-[10px] font-bold shadow-lg flex items-center gap-1.5 z-10"
                    style={{ left: `${vehicleX}%`, top: `${vehicleY}%`, transform: "translate(-50%, -50%)" }}
                  >
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                    <span>DANGER ZONE: {vehicleId}</span>
                  </div>

                  {/* Worker Icon Node (Positioned dynamically based on measuredDist slider) */}
                  <div
                    className={`absolute p-2.5 rounded-xl border-2 text-[10px] font-bold shadow-lg transition-all duration-150 flex items-center gap-1.5 z-10 ${
                      isDanger
                        ? "bg-red-600/40 border-red-400 text-red-200 animate-bounce shadow-red-500/30"
                        : isWarning
                        ? "bg-amber-600/30 border-amber-400 text-amber-200"
                        : "bg-emerald-600/30 border-emerald-400 text-emerald-200"
                    }`}
                    style={{ left: `${workerX}%`, top: `${workerY}%`, transform: "translate(-50%, -50%)" }}
                  >
                    <div className={`w-2 h-2 rounded-full ${isDanger ? "bg-red-400 animate-ping" : "bg-emerald-400"}`} />
                    <span>WORKER: {workerId}</span>
                  </div>

                  {/* Dynamic Proximity Line connecting Vehicle & Worker */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <line
                      x1={`${vehicleX}%`}
                      y1={`${vehicleY}%`}
                      x2={`${workerX}%`}
                      y2={`${workerY}%`}
                      stroke={isDanger ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981"}
                      strokeWidth="2.5"
                      strokeDasharray="4 4"
                    />
                  </svg>

                  {/* Live Distance Meter & Warning Overlay */}
                  <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200 shadow-xl flex items-center gap-3">
                    <div>
                      <span>Measured Distance: </span>
                      <strong className={`font-bold ${isDanger ? "text-red-400" : isWarning ? "text-amber-400" : "text-emerald-400"}`}>
                        {measuredDist} meters
                      </strong>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      isDanger
                        ? "bg-red-500/20 text-red-300 border-red-500/40"
                        : isWarning
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    }`}>
                      {isDanger ? "CRITICAL PROXIMITY BREACH" : isWarning ? "HIGH PROXIMITY RISK" : "SAFE DISTANCE OK"}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Distance Controls */}
        <div className="p-6 rounded-2xl glass-panel space-y-4 text-xs">
          <h2 className="text-sm font-bold text-slate-200">Test Distance & Boundary Settings</h2>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Worker Distance from Boundary (Meters):</label>
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
              <label className="text-slate-400 text-[11px]">Dangerous Zone / Vehicle Boundary Name:</label>
              <input
                type="text"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                placeholder="e.g. High-Voltage Transformer Boundary"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 text-[11px]">Worker / Personnel Track ID:</label>
              <input
                type="text"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                placeholder="e.g. Worker #104"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
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
