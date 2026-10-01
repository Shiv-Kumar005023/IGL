import React from "react";
import {
  Bell,
  Camera,
  Brain,
  AlertTriangle,
  ClipboardCheck,
  VideoOff,
  ShieldCheck,
  ChevronRight,
  Video,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function DashboardView() {
  const { stats, alerts, streamSource, personCount, setActiveTab, setSelectedEvidence } = useSafety();

  const activeAlertsList = alerts.filter((a) => a.status !== "RESOLVED");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-800">
      {/* Title Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Safety Command Center
        </h1>
        <p className="text-xs text-slate-500 mt-0.5 font-medium">
          AI Powered Workplaces Safety & Hazard Detection
        </p>
      </div>

      {/* Top 5 KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Active Alerts */}
        <div
          onClick={() => setActiveTab("alerts")}
          className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 hover:border-amber-300 transition cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600">
              <Bell className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-amber-200/60 text-amber-800 uppercase tracking-wider">
              {stats.active_alerts > 0 ? `${stats.active_alerts} LIVE` : "LIVE DATA"}
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">Active Alerts</h3>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Real-time safety alerts from AI</p>
          </div>
        </div>

        {/* Card 2: Cameras */}
        <div
          onClick={() => setActiveTab("camera-input")}
          className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 hover:border-sky-300 transition cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600">
              <Camera className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-sky-200/60 text-sky-800 uppercase tracking-wider">
              {streamSource ? "CAM ONLINE" : "AWAITING PLANT FEED"}
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">Cameras</h3>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
              {streamSource ? `${streamSource.name} connected` : "Live feed not connected"}
            </p>
          </div>
        </div>

        {/* Card 3: AI Services */}
        <div
          onClick={() => setActiveTab("camera-health")}
          className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 hover:border-emerald-300 transition cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Brain className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-200/60 text-emerald-800 uppercase tracking-wider">
              SERVICE STATUS
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">AI Services</h3>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">All AI services operational</p>
          </div>
        </div>

        {/* Card 4: Open Near-Misses */}
        <div
          onClick={() => setActiveTab("near-miss")}
          className="p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600 uppercase tracking-wider">
              {stats.near_misses > 0 ? `${stats.near_misses} PENDING` : "AWAITING VALIDATED DATA"}
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">Open Near-Misses</h3>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Pending validation from site team</p>
          </div>
        </div>

        {/* Card 5: Corrective Actions */}
        <div
          onClick={() => setActiveTab("config")}
          className="p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600 uppercase tracking-wider">
              AWAITING VALIDATED DATA
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">Corrective Actions</h3>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Pending action assignment</p>
          </div>
        </div>
      </div>

      {/* Middle Grid (Plant / Zone Safety Overview + Priority Alerts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel (2/3): Plant / Zone Safety Overview */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Plant / Zone Safety Overview</h2>
              <p className="text-xs text-slate-500">Live monitoring of critical areas and zones</p>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-slate-400">Live Plant Feed</span>
              {streamSource ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center gap-1 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  CONNECTED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10px] flex items-center gap-1 border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  NOT CONNECTED
                </span>
              )}
            </div>
          </div>

          {/* Plant Schematic Graphic Background Box */}
          <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 min-h-[340px] flex items-center justify-center p-6">
            {/* Background Graphic Image */}
            <img
              src="/plant_schematic.jpg"
              alt="Plant Blueprint"
              className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none mix-blend-multiply"
            />

            {/* Center State Overlay */}
            {!streamSource ? (
              <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-sm space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-200/80 border border-slate-300 flex items-center justify-center text-slate-500 mb-1">
                  <VideoOff className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">
                  LIVE PLANT FEED NOT CONNECTED
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Connect plant CCTV feed to enable real time monitoring and AI-based hazard detection.
                </p>
                <button
                  onClick={() => setActiveTab("camera-input")}
                  className="mt-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition shadow-xs"
                >
                  Connect Camera Feed Now
                </button>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-2 bg-white/90 p-4 rounded-xl border border-slate-200 backdrop-blur-xs">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Video className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-xs text-slate-900">LIVE FEED ACTIVE ({streamSource.name})</h3>
                <p className="text-[11px] text-slate-600 font-mono">
                  {Number.isFinite(personCount) ? personCount : 0} Person(s) Detected • AI Scanning Active
                </p>
                <button
                  onClick={() => setActiveTab("live-monitoring")}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 transition"
                >
                  View Live Video Overlay
                </button>
              </div>
            )}

            {/* 4 Floating Zone Overlay Cards */}
            <div className="absolute top-4 left-4 bg-white/90 border border-slate-200 backdrop-blur-xs p-2.5 rounded-lg shadow-2xs w-44">
              <div className="text-[11px] font-bold text-slate-800">Production Zone</div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                <span>Status:</span>
                <span className="font-bold text-slate-700">—</span>
              </div>
            </div>

            <div className="absolute top-4 right-4 bg-white/90 border border-slate-200 backdrop-blur-xs p-2.5 rounded-lg shadow-2xs w-44">
              <div className="text-[11px] font-bold text-slate-800">Utilities Zone</div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                <span>Status:</span>
                <span className="font-bold text-slate-700">—</span>
              </div>
            </div>

            <div className="absolute bottom-4 left-4 bg-white/90 border border-slate-200 backdrop-blur-xs p-2.5 rounded-lg shadow-2xs w-44">
              <div className="text-[11px] font-bold text-slate-800">Storage Zone</div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                <span>Status:</span>
                <span className="font-bold text-slate-700">—</span>
              </div>
            </div>

            <div className="absolute bottom-4 right-4 bg-white/90 border border-slate-200 backdrop-blur-xs p-2.5 rounded-lg shadow-2xs w-44">
              <div className="text-[11px] font-bold text-slate-800">Loading / Unloading Zone</div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                <span>Status:</span>
                <span className="font-bold text-slate-700">—</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel (1/3): Priority Alerts */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Priority Alerts</h2>
            <p className="text-xs text-slate-500">Real-time safety alerts and critical events</p>
          </div>

          {activeAlertsList.length === 0 ? (
            <div className="my-auto py-12 flex flex-col items-center justify-center text-center p-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                <ShieldCheck className="w-6 h-6 text-slate-500" />
              </div>
              <h3 className="font-bold text-xs text-slate-800">No validated plant events available</h3>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1 leading-relaxed font-medium">
                Once AI detects any safety event, it will appear here with priority and actionable details.
              </p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[300px]">
              {activeAlertsList.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => setSelectedEvidence(alert)}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition cursor-pointer flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-900">{alert.event_type.replace(/_/g, " ")}</div>
                      <div className="text-[10px] text-slate-500">{alert.zone_name} • {alert.detected_at}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">
                    {alert.severity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Grid (Recent Verified Events + Camera / AI Health) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel (2/3): Recent Verified Events */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Verified Events</h2>
            <p className="text-xs text-slate-500">Latest safety events from AI analysis and manual verification</p>
          </div>

          <div className="py-12 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-2">
              <ClipboardCheck className="w-5 h-5 text-slate-400" />
            </div>
            <h3 className="font-bold text-xs text-slate-800">No events available</h3>
            <p className="text-[11px] text-slate-400 max-w-sm mt-1 leading-relaxed font-medium">
              Verified events will appear here once the system receives plant feed and AI analysis is completed.
            </p>
          </div>
        </div>

        {/* Right Panel (1/3): Camera / AI Health */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Camera / AI Health</h2>
            <p className="text-xs text-slate-500">System health and operational status</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Sub-card 1: Camera Online */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <Video className="w-4 h-4" />
                </div>
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800 uppercase">
                  CAMERA ONLINE
                </span>
              </div>
              <div>
                <div className="font-bold text-slate-900 text-[11px]">CCTV system status</div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                  {streamSource ? "Live stream active" : "Waiting for plant feed"}
                </div>
              </div>
            </div>

            {/* Sub-card 2: AI Active */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <Brain className="w-4 h-4" />
                </div>
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800 uppercase">
                  AI ACTIVE
                </span>
              </div>
              <div>
                <div className="font-bold text-slate-900 text-[11px]">AI inference services</div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">All services operational</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
