import React, { useState } from "react";
import { Sliders, Save, AlertOctagon } from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function ConfigurationView() {
  const { addRestrictedZone } = useSafety();

  const [zoneName, setZoneName] = useState("High-Voltage Transformer Boundary");
  const [points] = useState([
    [0.15, 0.20],
    [0.45, 0.20],
    [0.45, 0.65],
    [0.15, 0.65]
  ]);

  const [ppeThreshold, setPpeThreshold] = useState(85);
  const [zoneThreshold, setZoneThreshold] = useState(90);
  const [nearMissDistThreshold, setNearMissDistThreshold] = useState(1.5);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveZone = async () => {
    await addRestrictedZone(zoneName, points);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" />
          Dangerous Area Setup (Geofence Boundaries)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Mark forbidden areas on the camera screen to trigger automatic alerts if workers step inside.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
          ✓ Dangerous Zone saved successfully to database!
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Polygon ROI Builder */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass-panel space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-red-400" />
            Dangerous Zone Boundary Box
          </h2>

          <div className="relative aspect-video rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
            {/* Visual preview */}
            <svg className="absolute inset-0 w-full h-full">
              <polygon
                points={points.map((p) => `${p[0] * 100}% ${p[1] * 100}%`).join(", ")}
                fill="rgba(239, 68, 68, 0.2)"
                stroke="#ef4444"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              {points.map((p, idx) => (
                <circle
                  key={idx}
                  cx={`${p[0] * 100}%`}
                  cy={`${p[1] * 100}%`}
                  r="6"
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))}
            </svg>

            <div className="absolute top-4 left-4 p-2 rounded bg-slate-900/90 text-red-400 font-bold border border-slate-800">
              FORBIDDEN AREA: {zoneName}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-slate-400">Dangerous Area Name:</label>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
            />
          </div>

          <button
            onClick={handleSaveZone}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Dangerous Zone to Database</span>
          </button>
        </div>

        {/* AI Threshold Sliders */}
        <div className="p-6 rounded-2xl glass-panel space-y-6">
          <h2 className="text-sm font-bold text-slate-200">AI Sensitivity Settings</h2>

          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Helmet Check Sensitivity:</span>
                <span className="text-cyan-400 font-bold">{ppeThreshold}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="99"
                value={ppeThreshold}
                onChange={(e) => setPpeThreshold(e.target.value)}
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Zone Breach Sensitivity:</span>
                <span className="text-red-400 font-bold">{zoneThreshold}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="99"
                value={zoneThreshold}
                onChange={(e) => setZoneThreshold(e.target.value)}
                className="w-full accent-red-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Safe Distance Distance (m):</span>
                <span className="text-amber-400 font-bold">{nearMissDistThreshold}m</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="4.0"
                step="0.1"
                value={nearMissDistThreshold}
                onChange={(e) => setNearMissDistThreshold(e.target.value)}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
