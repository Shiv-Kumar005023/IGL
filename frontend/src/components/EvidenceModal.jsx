import React from "react";
import { X, ShieldAlert, CheckCircle, Clock, UserCheck, AlertTriangle } from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function EvidenceModal() {
  const { selectedEvidence, setSelectedEvidence, acknowledgeAlert, resolveAlert } = useSafety();

  if (!selectedEvidence) return null;

  const handleAcknowledge = () => {
    acknowledgeAlert(selectedEvidence.id, "Safety Controller");
    setSelectedEvidence(null);
  };

  const handleResolve = () => {
    const notes = prompt("Enter resolution notes:", "On-site safety inspection completed. Issue resolved.");
    if (notes) {
      resolveAlert(selectedEvidence.id, notes, "Plant Safety Manager");
      setSelectedEvidence(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${selectedEvidence.severity === "CRITICAL" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{selectedEvidence.event_type.replace(/_/g, " ")}</span>
                <span className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                  selectedEvidence.status === "RESOLVED" ? "bg-emerald-500/20 text-emerald-400" :
                  selectedEvidence.status === "ACKNOWLEDGED" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {selectedEvidence.status}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Camera Location: {selectedEvidence.camera_name} ({selectedEvidence.zone_name})
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedEvidence(null)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Frame Photo Evidence */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Captured Camera Evidence Photo
            </h4>
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-black relative aspect-video flex items-center justify-center">
              {selectedEvidence.evidence_image_base64 ? (
                <img
                  src={selectedEvidence.evidence_image_base64}
                  alt="Captured Evidence Photo"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <ShieldAlert className="w-12 h-12 mx-auto mb-2 text-slate-700" />
                  NO PHOTO CAPTURED IN DATABASE
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-slate-500 text-[10px] uppercase">Location / Zone</span>
              <p className="text-slate-200 font-semibold">{selectedEvidence.zone_name}</p>

              <span className="text-slate-500 text-[10px] uppercase block pt-2">AI Confidence Score</span>
              <p className="text-cyan-400 font-bold">{Math.round((selectedEvidence.confidence || 0.95) * 100)}% Match</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-slate-500 text-[10px] uppercase">Detected Time</span>
              <p className="text-slate-200 font-semibold">{selectedEvidence.detected_at}</p>

              <span className="text-slate-500 text-[10px] uppercase block pt-2">Danger Level</span>
              <p className={`font-bold ${selectedEvidence.severity === "CRITICAL" ? "text-red-400" : "text-amber-400"}`}>
                {selectedEvidence.severity}
              </p>
            </div>
          </div>

          {/* History */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs">
            <h5 className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              Alert History & Actions
            </h5>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Detected at: <strong>{selectedEvidence.detected_at}</strong></span>
              </div>

              {selectedEvidence.acknowledged_at && (
                <div className="flex items-center gap-2 text-blue-400">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Acknowledged by {selectedEvidence.acknowledged_by} at {selectedEvidence.acknowledged_at}</span>
                </div>
              )}

              {selectedEvidence.resolved_at && (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Resolved by {selectedEvidence.resolved_by} at {selectedEvidence.resolved_at}</span>
                </div>
              )}

              {selectedEvidence.resolution_notes && (
                <div className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                  <span className="text-slate-500 text-[10px] uppercase block mb-1">Resolution Notes:</span>
                  <p>{selectedEvidence.resolution_notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-950/50">
          {selectedEvidence.status === "DETECTED" && (
            <button
              onClick={handleAcknowledge}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-lg shadow-blue-500/20"
            >
              Acknowledge Alert
            </button>
          )}

          {selectedEvidence.status !== "RESOLVED" && (
            <button
              onClick={handleResolve}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-lg shadow-emerald-500/20"
            >
              Mark Fixed / Resolve
            </button>
          )}

          <button
            onClick={() => setSelectedEvidence(null)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
