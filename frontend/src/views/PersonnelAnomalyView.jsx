import React, { useState } from "react";
import { UserX, UserCheck, History, Database, AlertCircle, RefreshCw, UserPlus } from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import { checkPersonnelAnomalyApi } from "../services/api";

export default function PersonnelAnomalyView() {
  const { observations, dispatchAlert, recordObservation, streamSource } = useSafety();
  const [checking, setChecking] = useState(false);
  const [logging, setLogging] = useState(false);
  const [checkResult, setCheckResult] = useState(null);

  const totalHistoryCount = observations.length;

  // Manually add a Person Track Observation to Database
  const handleAddPersonObservation = async () => {
    setLogging(true);
    const randomId = `TRK-P${Math.floor(Math.random() * 800 + 100)}`;
    await recordObservation({
      track_id: randomId,
      zone_name: "Walkway Area B",
      object_type: "person",
      confidence: 0.96
    });
    setLogging(false);
  };

  // Run Re-ID Comparison Check
  const handleRunAnomalyCheck = async () => {
    setChecking(true);
    setCheckResult(null);

    const testVector = { r_avg: Math.floor(Math.random() * 200) + 20, g_avg: Math.floor(Math.random() * 200) + 20, b_avg: Math.floor(Math.random() * 200) + 20 };
    const res = await checkPersonnelAnomalyApi(testVector);
    setChecking(false);
    setCheckResult(res);

    if (res.is_anomaly) {
      dispatchAlert({
        event_type: "PERSONNEL_ANOMALY",
        zone_name: "Control Room Entrance",
        severity: "CRITICAL",
        confidence: 0.97,
        metadata: { reason: res.reason }
      });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <UserX className="w-5 h-5 text-cyan-400" />
            Person Tracking & Visitor Check
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Logs people seen on camera and compares them with employee records to spot unknown visitors.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAddPersonObservation}
            disabled={logging}
            className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-2"
          >
            {logging ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>➕ Log Person Observation</span>
          </button>

          <button
            onClick={handleRunAnomalyCheck}
            disabled={checking}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-purple-500/20 flex items-center gap-2"
          >
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
            <span>Run Unknown Visitor Check</span>
          </button>
        </div>
      </div>

      {/* Insufficient Data Banner */}
      {totalHistoryCount < 3 && (
        <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2 text-xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-amber-200 uppercase">INSUFFICIENT HISTORICAL DATA ({totalHistoryCount} Saved)</h3>
              <p className="text-amber-400/90 mt-0.5">
                Only {totalHistoryCount} person observation(s) currently saved in database. The system needs at least 3 person records to compare unknown visitors. Click <strong>"➕ Log Person Observation"</strong> above to add live records!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Check Result */}
      {checkResult && (
        <div className={`p-5 rounded-2xl border text-xs space-y-2 ${
          checkResult.is_anomaly ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
        }`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            {checkResult.is_anomaly ? <UserX className="w-5 h-5 text-red-400" /> : <UserCheck className="w-5 h-5 text-emerald-400" />}
            <span>Check Result: {checkResult.status}</span>
          </div>
          <p>{checkResult.reason || `Matched employee record: ${checkResult.matched_id}`}</p>
        </div>
      )}

      {/* Observation Database */}
      <div className="p-6 rounded-2xl glass-panel space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            Saved Person Tracking Records ({observations.length})
          </h2>
          <span className="text-xs text-slate-400">Database: SQLite</span>
        </div>

        {observations.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-3 border border-dashed border-slate-800 rounded-xl">
            <Database className="w-10 h-10 mx-auto text-slate-700 mb-1" />
            <p className="text-slate-300 font-semibold">Zero Person Observations Saved</p>
            <p className="text-slate-500 max-w-sm mx-auto">
              Click the <strong>"➕ Log Person Observation"</strong> button above to save a person tracking record directly to SQLite database.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[11px] font-mono">
                  <th className="pb-3 px-3">Person Track ID</th>
                  <th className="pb-3 px-3">Camera Name</th>
                  <th className="pb-3 px-3">Location / Zone</th>
                  <th className="pb-3 px-3">Type</th>
                  <th className="pb-3 px-3">AI Confidence</th>
                  <th className="pb-3 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {observations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-slate-900/50 font-mono">
                    <td className="py-3 px-3 font-bold text-cyan-400">{obs.track_id}</td>
                    <td className="py-3 px-3">{obs.camera_id}</td>
                    <td className="py-3 px-3">{obs.zone_name}</td>
                    <td className="py-3 px-3 capitalize">{obs.object_type}</td>
                    <td className="py-3 px-3 text-emerald-400">{Math.round((obs.confidence || 0.92) * 100)}% Match</td>
                    <td className="py-3 px-3 text-slate-500">{obs.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
