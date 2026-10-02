import React, { useState, useEffect } from "react";
import {
  Boxes,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Pause,
  Zap,
  Activity,
  Gauge,
  Cpu,
  Video,
  Sliders,
  RefreshCw,
  Info,
  ShieldCheck,
  Search,
  Filter
} from "lucide-react";
import {
  getInitialPackagingState,
  inspectBottle,
  CAP_STATUS,
  FILL_LEVEL_STATUS,
  BOTTLE_BODY_STATUS,
  OVERALL_RESULT
} from "../services/packagingProcessor";

export default function PackagingInspectionView() {
  const [state, setState] = useState(getInitialPackagingState);
  const [isPaused, setIsPaused] = useState(false);
  const [conveyorSpeed, setConveyorSpeed] = useState(1.0); // 1.0x, 2.0x
  const [bottleX, setBottleX] = useState(10); // 0% to 100% position on conveyor
  const [logFilter, setLogFilter] = useState("ALL"); // ALL, PASS, REJECT
  const [selectedLogBottle, setSelectedLogBottle] = useState(null);

  // Animation & Inspection loop for bottles moving along conveyor
  useEffect(() => {
    if (isPaused) return;

    const intervalMs = 60 / conveyorSpeed;
    const timer = setInterval(() => {
      setBottleX((prevX) => {
        const nextX = prevX + 1.2;

        // When bottle reaches inspection scanner zone (50% mark)
        if (prevX < 50 && nextX >= 50) {
          const newInspection = inspectBottle();

          setState((prevState) => {
            const isPass = newInspection.overallResult === OVERALL_RESULT.PASS;

            const updatedDefects = { ...prevState.defectBreakdown };
            if (!isPass) {
              if (newInspection.capStatus !== CAP_STATUS.PASS) updatedDefects.capDefects += 1;
              if (newInspection.fillStatus !== FILL_LEVEL_STATUS.PASS) updatedDefects.lowFillDefects += 1;
              if (newInspection.bottleStatus !== BOTTLE_BODY_STATUS.PASS) updatedDefects.bottleDefects += 1;
            }

            return {
              ...prevState,
              totalInspected: prevState.totalInspected + 1,
              totalPassed: prevState.totalPassed + (isPass ? 1 : 0),
              totalDefective: prevState.totalDefective + (isPass ? 0 : 1),
              defectBreakdown: updatedDefects,
              activeBottle: newInspection,
              recentLogs: [newInspection, ...prevState.recentLogs.slice(0, 49)]
            };
          });
        }

        // Loop bottle back to start after exiting conveyor end
        if (nextX >= 98) {
          return 0;
        }

        return nextX;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPaused, conveyorSpeed]);

  // Handle manual defect test injection
  const handleTriggerTestDefect = (defectType) => {
    const forcedInspection = inspectBottle(defectType);

    setState((prevState) => {
      const isPass = forcedInspection.overallResult === OVERALL_RESULT.PASS;
      const updatedDefects = { ...prevState.defectBreakdown };
      if (!isPass) {
        if (forcedInspection.capStatus !== CAP_STATUS.PASS) updatedDefects.capDefects += 1;
        if (forcedInspection.fillStatus !== FILL_LEVEL_STATUS.PASS) updatedDefects.lowFillDefects += 1;
        if (forcedInspection.bottleStatus !== BOTTLE_BODY_STATUS.PASS) updatedDefects.bottleDefects += 1;
      }

      return {
        ...prevState,
        totalInspected: prevState.totalInspected + 1,
        totalPassed: prevState.totalPassed + (isPass ? 1 : 0),
        totalDefective: prevState.totalDefective + (isPass ? 0 : 1),
        defectBreakdown: updatedDefects,
        activeBottle: forcedInspection,
        recentLogs: [forcedInspection, ...prevState.recentLogs.slice(0, 49)]
      };
    });
  };

  // Active bottle to display in detail panel (either live or selected from log)
  const displayBottle = selectedLogBottle || state.activeBottle;
  const qualityRate = state.totalInspected > 0
    ? Math.round((state.totalPassed / state.totalInspected) * 1000) / 10
    : 100;

  // Filter log entries
  const filteredLogs = state.recentLogs.filter((item) => {
    if (logFilter === "PASS") return item.overallResult === OVERALL_RESULT.PASS;
    if (logFilter === "REJECT") return item.overallResult === OVERALL_RESULT.REJECT;
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-slate-100 font-sans">
      {/* Header Bar & Status Badges */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-600 text-white shadow-lg shadow-indigo-500/20">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Packaging Quality Inspection Line
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300">
                  CONVEYOR VISION AI
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated 3D fill-level, cap integrity, and surface defect inspection on high-speed bottle conveyor.
              </p>
            </div>
          </div>
        </div>

        {/* Prototype & Controls Header */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>CONVEYOR: <strong className="text-emerald-400">{isPaused ? "PAUSED" : "RUNNING"}</strong></span>
          </div>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`px-3 py-1.5 rounded-xl font-semibold transition flex items-center gap-1.5 ${
              isPaused
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isPaused ? "Resume Line" : "Pause Conveyor"}</span>
          </button>

          <button
            onClick={() => setConveyorSpeed(conveyorSpeed === 1.0 ? 2.0 : 1.0)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition flex items-center gap-1.5"
          >
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span>Speed: {conveyorSpeed}x</span>
          </button>
        </div>
      </div>

      {/* Hardware Connection & Prototype Status Banner */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            <strong className="text-cyan-300 font-semibold">Modular Vision Pipeline Ready:</strong> Simulated high-speed conveyor stream active. Connect real 3D Depth camera or TensorRT bottle model seamlessly via <code className="text-cyan-300 bg-slate-950 px-1.5 py-0.5 rounded">packagingProcessor.js</code> API.
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <Video className="w-3.5 h-3.5 text-emerald-400" /> 3D-DEPTH: READY
          </span>
          <span className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" /> INFERENCE: 60 FPS
          </span>
        </div>
      </div>

      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Inspected */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Inspected</span>
            <Boxes className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{state.totalInspected}</div>
          <p className="text-[11px] text-slate-400">Bottles processed through AI scanner</p>
        </div>

        {/* Passed */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Passed / Accepted</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{state.totalPassed}</div>
          <p className="text-[11px] text-emerald-600 font-medium">Verified 100% Quality Pass</p>
        </div>

        {/* Defective */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Defective / Rejected</span>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600">{state.totalDefective}</div>
          <p className="text-[11px] text-red-500 font-medium">Automated Air-Jet Ejected</p>
        </div>

        {/* Quality Rate */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Quality Pass Rate</span>
            <Activity className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 flex items-baseline gap-1">
            <span>{qualityRate}%</span>
            <span className="text-xs text-emerald-600 font-semibold">Target &gt;95%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full transition-all duration-500 ${
                qualityRate >= 95 ? "bg-emerald-500" : qualityRate >= 90 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${qualityRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* MAIN CONVEYOR INSPECTION VIEWPORT & BOTTLE INSPECTION PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conveyor Live AI Camera Screen */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Video className="w-4 h-4 text-cyan-400" />
              Conveyor Inspection Camera Viewport (CAM-PACK-01)
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
              1920x1080 @ 60FPS
            </span>
          </div>

          {/* Visual Conveyor Scanner Frame */}
          <div className="relative aspect-video rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col justify-between p-4">
            {/* Background Conveyor Belt Lines */}
            <div className="absolute inset-x-0 bottom-6 h-12 bg-slate-900 border-y border-slate-700/80 flex items-center overflow-hidden">
              <div
                className="w-full h-full opacity-30 bg-[linear-gradient(90deg,transparent_0px,#0284c7_20px,transparent_40px)] bg-[length:40px_100%] animate-pulse"
              />
            </div>

            {/* Inspection Zone Laser Beam Scanner overlay */}
            <div className="absolute left-1/2 top-0 bottom-0 w-24 -translate-x-1/2 bg-cyan-500/10 border-x border-cyan-400/40 pointer-events-none flex flex-col justify-between items-center py-2">
              <div className="px-2 py-0.5 rounded bg-cyan-500/30 text-cyan-300 text-[9px] font-mono font-bold tracking-widest border border-cyan-400/50 uppercase">
                AI SCAN ZONE
              </div>
              <div className="w-full h-0.5 bg-cyan-400 shadow-[0_0_12px_#06b6d4] animate-pulse" />
              <div className="text-[9px] font-mono text-cyan-400/80">3D LASER ACTIVE</div>
            </div>

            {/* Top Viewport Metadata Overlay */}
            <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-800">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-slate-200">LIVE FEED</span>
              </div>
              <div className="bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-800">
                ZONE: PACKAGING BAY 4
              </div>
            </div>

            {/* Moving Bottle Graphic on Conveyor */}
            <div
              className="absolute bottom-8 transition-all duration-75 flex flex-col items-center pointer-events-none"
              style={{ left: `${bottleX}%`, transform: "translateX(-50%)" }}
            >
              {/* Live Bounding Box Tag */}
              <div className="mb-2 px-2 py-1 rounded bg-slate-900/90 border border-cyan-500/80 text-[10px] font-mono text-cyan-300 shadow-lg whitespace-nowrap flex items-center gap-1.5">
                <span>{state.activeBottle?.id || "BTL-9841"}</span>
                <span className={`px-1 rounded font-bold ${
                  state.activeBottle?.overallResult === OVERALL_RESULT.PASS
                    ? "bg-emerald-500/30 text-emerald-400"
                    : "bg-red-500/30 text-red-400"
                }`}>
                  {state.activeBottle?.overallResult || "SCANNING"}
                </span>
              </div>

              {/* Bottle SVG Visual Representation */}
              <div className="relative w-12 h-28 flex flex-col items-center">
                {/* Cap */}
                <div
                  className={`w-5 h-4 rounded-t-sm border transition-colors ${
                    state.activeBottle?.capStatus === CAP_STATUS.MISSING
                      ? "opacity-0"
                      : state.activeBottle?.capStatus === CAP_STATUS.PASS
                      ? "bg-cyan-500 border-cyan-300"
                      : "bg-red-500 border-red-300 rotate-12"
                  }`}
                />

                {/* Neck */}
                <div className="w-4 h-3 bg-slate-300/40 border-x border-slate-400/60" />

                {/* Body Glass Container */}
                <div className="relative w-10 h-20 rounded-b-lg border-2 border-cyan-400/60 bg-cyan-950/40 overflow-hidden flex flex-col justify-end p-0.5">
                  {/* Liquid Fill Level */}
                  <div
                    className={`w-full rounded-b-md transition-all duration-300 ${
                      state.activeBottle?.fillStatus === FILL_LEVEL_STATUS.PASS
                        ? "bg-cyan-500/80 shadow-[0_0_8px_#06b6d4]"
                        : state.activeBottle?.fillStatus === FILL_LEVEL_STATUS.LOW
                        ? "bg-amber-500/80 shadow-[0_0_8px_#f59e0b]"
                        : "bg-purple-500/80 shadow-[0_0_8px_#a855f7]"
                    }`}
                    style={{ height: `${state.activeBottle?.fillPercentage || 90}%` }}
                  />

                  {/* Surface Defect Marker */}
                  {state.activeBottle?.bottleStatus !== BOTTLE_BODY_STATUS.PASS && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-red-400 animate-ping" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Controls inside Viewport */}
            <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400">
              <span>SCANNER ACCURACY: <strong className="text-cyan-400">99.4%</strong></span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleTriggerTestDefect("LOW_FILL")}
                  className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition"
                >
                  Test Low Fill
                </button>
                <button
                  onClick={() => handleTriggerTestDefect("CAP")}
                  className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 transition"
                >
                  Test Cap Defect
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Selected / Current Bottle Deep Inspection Results */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Inspection Deep Analysis</h2>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                ID: {displayBottle?.id || "N/A"} | Time: {displayBottle?.time || "--:--"}
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                displayBottle?.overallResult === OVERALL_RESULT.PASS
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-red-100 text-red-800 border border-red-300"
              }`}
            >
              {displayBottle?.overallResult === OVERALL_RESULT.PASS ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-600" />
              )}
              <span>{displayBottle?.overallResult || "NO DATA"}</span>
            </span>
          </div>

          {/* Fill-Level Inspection Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">1. Fill-Level Check</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  displayBottle?.fillStatus === FILL_LEVEL_STATUS.PASS
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {displayBottle?.fillStatus || "PASS"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Measured Level:</span>
                <strong className="text-slate-900">{displayBottle?.fillPercentage || 90}%</strong>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    displayBottle?.fillStatus === FILL_LEVEL_STATUS.PASS ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${displayBottle?.fillPercentage || 90}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                <span>Min: 85%</span>
                <span>Target: 90%</span>
                <span>Max: 95%</span>
              </div>
            </div>
          </div>

          {/* Cap Integrity Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">2. Cap Integrity Check</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  displayBottle?.capStatus === CAP_STATUS.PASS
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {displayBottle?.capStatus || "PASS"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {displayBottle?.capStatus === CAP_STATUS.PASS
                ? "Cap correctly positioned, sealed and undamaged."
                : `Anomaly detected: Cap is ${displayBottle?.capStatus}.`}
            </p>
          </div>

          {/* Bottle Surface & Body Defect Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">3. Bottle Body Anomaly</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  displayBottle?.bottleStatus === BOTTLE_BODY_STATUS.PASS
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {displayBottle?.bottleStatus || "PASS"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {displayBottle?.bottleStatus === BOTTLE_BODY_STATUS.PASS
                ? "Glass body clear of cracks, scratches or deformation."
                : `Surface defect spotted: ${displayBottle?.bottleStatus}.`}
            </p>
          </div>

          {/* AI Model Confidence Bar */}
          <div className="pt-1 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
            <span>AI Model Confidence:</span>
            <strong className="text-cyan-700 font-bold">{Math.round((displayBottle?.confidence || 0.97) * 100)}%</strong>
          </div>
        </div>
      </div>

      {/* DEFECT BREAKDOWN & RECENT INSPECTION LOG TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Defect Category Breakdown */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Defect Category Analytics
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-slate-600 font-medium">Cap & Seal Defects</span>
              <strong className="text-slate-900 font-bold">{state.defectBreakdown.capDefects}</strong>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-slate-600 font-medium">Low / Incorrect Fill Level</span>
              <strong className="text-slate-900 font-bold">{state.defectBreakdown.lowFillDefects}</strong>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-slate-600 font-medium">Glass / Body Anomalies</span>
              <strong className="text-slate-900 font-bold">{state.defectBreakdown.bottleDefects}</strong>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-slate-600 font-medium">Other / Conveyor Jams</span>
              <strong className="text-slate-900 font-bold">{state.defectBreakdown.otherDefects}</strong>
            </div>
          </div>
        </div>

        {/* Recent Inspection Log Table */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-600" />
              Recent Conveyor Inspection Log ({state.recentLogs.length})
            </h2>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
              <button
                onClick={() => setLogFilter("ALL")}
                className={`px-2.5 py-1 rounded font-semibold transition ${
                  logFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setLogFilter("PASS")}
                className={`px-2.5 py-1 rounded font-semibold transition ${
                  logFilter === "PASS" ? "bg-emerald-500 text-white" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Passed
              </button>
              <button
                onClick={() => setLogFilter("REJECT")}
                className={`px-2.5 py-1 rounded font-semibold transition ${
                  logFilter === "REJECT" ? "bg-red-500 text-white" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Rejected
              </button>
            </div>
          </div>

          {/* Log Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-medium text-[11px]">
                  <th className="pb-2">Bottle ID</th>
                  <th className="pb-2">Timestamp</th>
                  <th className="pb-2">Fill Level</th>
                  <th className="pb-2">Cap Status</th>
                  <th className="pb-2">Body Status</th>
                  <th className="pb-2">Overall Result</th>
                  <th className="pb-2 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.slice(0, 8).map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLogBottle(log)}
                    className="hover:bg-slate-50 cursor-pointer transition text-slate-700"
                  >
                    <td className="py-2.5 font-mono font-semibold text-slate-900">{log.id}</td>
                    <td className="py-2.5 text-slate-500 font-mono text-[11px]">{log.time}</td>
                    <td className="py-2.5">
                      <span className={`font-semibold ${log.fillStatus === FILL_LEVEL_STATUS.PASS ? "text-slate-800" : "text-amber-600"}`}>
                        {log.fillPercentage}% ({log.fillStatus})
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={log.capStatus === CAP_STATUS.PASS ? "text-slate-600" : "text-red-600 font-semibold"}>
                        {log.capStatus}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={log.bottleStatus === BOTTLE_BODY_STATUS.PASS ? "text-slate-600" : "text-red-600 font-semibold"}>
                        {log.bottleStatus}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.overallResult === OVERALL_RESULT.PASS
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.overallResult}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-500">
                      {Math.round(log.confidence * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
