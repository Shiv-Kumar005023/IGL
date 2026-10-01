import React from "react";
import { Activity, Camera, Radio, EyeOff } from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function CameraHealthView() {
  const { streamMetrics, streamSource, setActiveTab } = useSafety();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Camera Quality & Lens Health Diagnostics
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Checks camera video clarity, lighting levels, and warns if camera lens is dirty, blurry, or blocked.
          </p>
        </div>

        <button
          onClick={() => setActiveTab("camera-input")}
          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-2"
        >
          <Camera className="w-4 h-4" />
          <span>Camera Setup</span>
        </button>
      </div>

      {/* Active Stream Diagnostics */}
      <div className="p-6 rounded-2xl glass-panel space-y-4">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          Active Camera Stream Health
        </h2>

        {streamSource ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Camera Name</span>
              <p className="text-slate-100 font-bold truncate">{streamSource.name}</p>
              <span className="text-emerald-400 text-[10px] font-bold">ACTIVE & SCANNING</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1 font-mono">
              <span className="text-slate-500 text-[10px] uppercase">Camera Speed</span>
              <p className="text-cyan-400 font-bold text-lg">{streamMetrics.fps} FPS</p>
              <span className="text-slate-500 text-[10px]">Normal Speed: 30 FPS</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Lighting Quality</span>
              <p className={`font-bold text-lg ${streamMetrics.brightness < 25 ? "text-red-400" : "text-emerald-400"}`}>
                {streamMetrics.brightness < 25 ? "Too Dark" : "Good Lighting"}
              </p>
              <span className="text-slate-500 text-[10px] font-mono">Level: {streamMetrics.brightness}/255</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Lens Clarity</span>
              <p className={`font-bold text-lg ${streamMetrics.blurScore < 15 ? "text-amber-400" : "text-emerald-400"}`}>
                {streamMetrics.blurScore < 15 ? "Blurry / Dirty" : "Clear Lens"}
              </p>
              <span className="text-slate-500 text-[10px] font-mono">Clarity Score: {streamMetrics.blurScore}</span>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-500 text-xs space-y-2 border border-dashed border-slate-800 rounded-xl">
            <Camera className="w-10 h-10 mx-auto text-slate-700 mb-1" />
            <p className="text-slate-300 font-semibold">NO ACTIVE CAMERA CONNECTED</p>
            <p className="text-slate-500">Connect a live camera under "Camera Setup" to view optical health metrics.</p>
          </div>
        )}
      </div>

      {/* Explanatory Protocol Rules */}
      <div className="p-6 rounded-2xl glass-panel space-y-4">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <EyeOff className="w-4 h-4 text-amber-400" />
          Why System Shows "NOT ASSESSABLE" (Quality Protection Rules)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <h3 className="font-bold text-amber-400 text-sm">Rule 1: Too Dark to See</h3>
            <p className="text-slate-400 text-[11px]">
              If lights are turned off or environment is too dark, system stops AI scanning and shows <strong>NOT ASSESSABLE</strong> instead of giving fake safe clearance.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <h3 className="font-bold text-amber-400 text-sm">Rule 2: Dirty / Blurry Lens</h3>
            <p className="text-slate-400 text-[11px]">
              If camera lens is covered in steam, dust, or fog, system warns camera operator to clean the lens.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <h3 className="font-bold text-amber-400 text-sm">Rule 3: Camera Disconnected</h3>
            <p className="text-slate-400 text-[11px]">
              If CCTV cable breaks or stream fails, dashboard displays <strong>NO LIVE INPUT AVAILABLE</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
