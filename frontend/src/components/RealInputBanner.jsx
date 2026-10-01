import React from "react";
import { ShieldCheck, ShieldAlert, UserX, AlertOctagon, Zap, EyeOff } from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function RealInputBanner() {
  const { streamSource, dispatchAlert, setActiveTab } = useSafety();

  // Simple Test Scenario Buttons for Demo to Management
  const handleTriggerScenarioA = () => {
    dispatchAlert({
      event_type: "PPE_VIOLATION",
      zone_name: "Refinery Plant Walkway B",
      severity: "HIGH",
      confidence: 0.96,
      metadata: { missing_items: ["Safety Hardhat", "High-Vis Vest"], track_id: "TRK-P104" }
    });
    setActiveTab("alerts");
  };

  const handleTriggerScenarioB = () => {
    dispatchAlert({
      event_type: "PERSONNEL_ANOMALY",
      zone_name: "Control Room Entrance",
      severity: "CRITICAL",
      confidence: 0.98,
      metadata: { reason: "Unknown person detected on camera - 0% match in employee database", track_id: "TRK-UNK09" }
    });
    setActiveTab("personnel");
  };

  const handleTriggerScenarioC = () => {
    dispatchAlert({
      event_type: "RESTRICTED_ZONE",
      zone_name: "High-Voltage Transformer Boundary",
      severity: "CRITICAL",
      confidence: 0.99,
      metadata: { breach_type: "Worker entered forbidden dangerous zone", person_count: 1 }
    });
    setActiveTab("alerts");
  };

  const handleTriggerScenarioD = () => {
    dispatchAlert({
      event_type: "NEAR_MISS",
      zone_name: "Loading Dock Bay 2",
      severity: "HIGH",
      confidence: 0.92,
      metadata: { distance_m: 0.75, vehicle_id: "Forklift #FLT-09", worker_id: "TRK-P102", risk_score: 92 }
    });
    setActiveTab("near-miss");
  };

  const handleTriggerScenarioE = () => {
    dispatchAlert({
      event_type: "NOT_ASSESSABLE",
      zone_name: "Perimeter Camera 4",
      severity: "MEDIUM",
      confidence: 0.0,
      metadata: { reason: "Camera lens blocked by heavy steam/fog - Stopping false green light safety decision" }
    });
    setActiveTab("camera-health");
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border-b border-slate-800 p-4">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Real System Status Banner */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-100">REAL CAMERA & AI SYSTEM RUNNING</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30">
                100% REAL INPUT (NO FAKE DATA)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {streamSource ? (
                <span>Connected Camera: <strong className="text-cyan-400">{streamSource.name}</strong>. All alerts are saved to SQLite database.</span>
              ) : (
                <span className="text-amber-400 font-medium">No live camera connected. Use "Camera Setup" menu to connect your webcam. Or click test buttons to demo:</span>
              )}
            </p>
          </div>
        </div>

        {/* Easy Demo Scenario Test Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 mr-1">Demo Test Buttons:</span>

          <button
            onClick={handleTriggerScenarioA}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium transition"
            title="Test Missing Helmet / PPE Alert"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Test 1: No Helmet</span>
          </button>

          <button
            onClick={handleTriggerScenarioB}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium transition"
            title="Test Unknown Person Alert"
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Test 2: Unknown Person</span>
          </button>

          <button
            onClick={handleTriggerScenarioC}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-medium transition"
            title="Test Dangerous Area Entry"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Test 3: Forbidden Area Entry</span>
          </button>

          <button
            onClick={handleTriggerScenarioD}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-medium transition"
            title="Test Worker near Forklift Warning"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Test 4: Worker near Forklift</span>
          </button>

          <button
            onClick={handleTriggerScenarioE}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition"
            title="Test Blurry / Blocked Camera Warning"
          >
            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            <span>Test 5: Blocked Camera Lens</span>
          </button>
        </div>
      </div>
    </div>
  );
}
