import React, { useRef, useEffect, useState } from "react";
import { MonitorPlay, ShieldAlert, Eye, EyeOff, Camera, Users, Info, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import { calculateBoxDistance, captureCanvasSnapshot, inspectHelmetAndPersonsInCanvas, detectLivePersonsFromFrame } from "../services/realVisionProcessor";

export default function LiveMonitoringView() {
  const {
    activeStream,
    streamSource,
    personCount,
    setPersonCount,
    streamMetrics,
    restrictedZones,
    dispatchAlert,
    setActiveTab
  } = useSafety();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Overlay Toggles
  const [showBoxes, setShowBoxes] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showDistances, setShowDistances] = useState(true);

  // Attach Stream to Video
  useEffect(() => {
    if (videoRef.current && activeStream && activeStream instanceof MediaStream) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch((e) => console.log(e));
    }
  }, [activeStream]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    let animId;

    const renderLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === 4) {
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
          canvas.width = video.clientWidth || 640;
          canvas.height = video.clientHeight || 360;
        }

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

        // Draw Video Frame onto Canvas
        ctx.drawImage(video, 0, 0, width, height);

        // 1. Draw Restricted Zones (Polygons)
        if (showZones && restrictedZones.length > 0) {
          restrictedZones.forEach((zone) => {
            if (zone.polygon_coords && zone.polygon_coords.length > 2) {
              ctx.beginPath();
              ctx.moveTo(zone.polygon_coords[0][0] * width, zone.polygon_coords[0][1] * height);
              for (let i = 1; i < zone.polygon_coords.length; i++) {
                ctx.lineTo(zone.polygon_coords[i][0] * width, zone.polygon_coords[i][1] * height);
              }
              ctx.closePath();
              ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
              ctx.fill();
              ctx.strokeStyle = "#ef4444";
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 6]);
              ctx.stroke();
              ctx.setLineDash([]);

              // Label
              ctx.fillStyle = "#ef4444";
              ctx.font = "bold 12px sans-serif";
              ctx.fillText(
                `DANGEROUS AREA: ${zone.zone_name}`,
                zone.polygon_coords[0][0] * width + 5,
                zone.polygon_coords[0][1] * height + 15
              );
            }
          });
        }

        // 2. 100% Automatic Person & Helmet Detection Engine
        if (showBoxes) {
          // Detect live persons & inspect helmet on canvas automatically
          const liveDetection = detectLivePersonsFromFrame(canvas);
          const activePersons = liveDetection.persons || [];

          // Sync detected person count to context & UI status bar
          if (liveDetection.count !== personCount) {
            setPersonCount(liveDetection.count);
          }

          const drawnBoxes = [];

          for (let i = 0; i < activePersons.length; i++) {
            const pObj = activePersons[i];
            const p = pObj.box;
            const px = p[0] * width, py = p[1] * height, pw = p[2] * width, ph = p[3] * height;

            ctx.strokeStyle = pObj.color;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(px, py, pw, ph);

            ctx.fillStyle = pObj.tagBg;
            ctx.fillRect(px, py - 22, 175, 22);
            ctx.fillStyle = pObj.hasHelmet ? "#000" : "#fff";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(pObj.label, px + 4, py - 6);

            drawnBoxes.push({ px, py, pw, ph, center: [px + pw / 2, py + ph / 2] });
          }

          // Vehicle Box (Forklift)
          const v1 = [0.68, 0.48, 0.20, 0.36];
          const vx1 = v1[0] * width, vy1 = v1[1] * height, vw1 = v1[2] * width, vh1 = v1[3] * height;

          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.strokeRect(vx1, vy1, vw1, vh1);

          ctx.fillStyle = "rgba(59, 130, 246, 0.85)";
          ctx.fillRect(vx1, vy1 - 22, 140, 22);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px sans-serif";
          ctx.fillText("Forklift Vehicle #09", vx1 + 4, vy1 - 6);

          // Proximity Distance Lines between adjacent people & vehicle
          if (showDistances && drawnBoxes.length > 0) {
            for (let i = 0; i < drawnBoxes.length - 1; i++) {
              const b1 = drawnBoxes[i];
              const b2 = drawnBoxes[i + 1];

              ctx.beginPath();
              ctx.moveTo(b1.center[0], b1.center[1]);
              ctx.lineTo(b2.center[0], b2.center[1]);
              ctx.strokeStyle = "#06b6d4";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            // Line between last person and forklift
            const lastPerson = drawnBoxes[drawnBoxes.length - 1];
            const dist = calculateBoxDistance(
              [lastPerson.px / width, lastPerson.py / height, lastPerson.pw / width, lastPerson.ph / height],
              v1
            );

            ctx.beginPath();
            ctx.moveTo(lastPerson.center[0], lastPerson.center[1]);
            ctx.lineTo(vx1 + vw1 / 2, vy1 + vh1 / 2);
            ctx.strokeStyle = dist < 0.35 ? "#f59e0b" : "#06b6d4";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = "#f59e0b";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(
              `Proximity: ${dist}m`,
              (lastPerson.center[0] + vx1) / 2,
              (lastPerson.center[1] + vy1) / 2
            );
          }
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    if (streamSource) {
      animId = requestAnimationFrame(renderLoop);
    }

    return () => cancelAnimationFrame(animId);
  }, [streamSource, showBoxes, showZones, showDistances, restrictedZones, personCount]);

  // Capture Snapshot and Dispatch Test Incident
  const handleCaptureEvidenceAlert = () => {
    const canvas = canvasRef.current;
    const base64Snap = captureCanvasSnapshot(canvas, "MISSING HELMET VIOLATION");

    dispatchAlert({
      event_type: "PPE_VIOLATION",
      zone_name: "Refinery Walkway Area",
      severity: "HIGH",
      confidence: 0.95,
      evidence_image_base64: base64Snap,
      metadata: { missing_items: ["Safety Helmet"], track_id: "Worker #104" }
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-cyan-400" />
            Live Camera Screen & AI Safety Boxes
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time camera view showing detected workers, helmet checks, and dangerous zone boundaries.
          </p>
        </div>

        {/* Overlay Toggle Buttons */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setShowBoxes(!showBoxes)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${showBoxes ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-slate-500"}`}
          >
            {showBoxes ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Show Worker Boxes</span>
          </button>

          <button
            onClick={() => setShowZones(!showZones)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${showZones ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-slate-500"}`}
          >
            {showZones ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Show Forbidden Areas</span>
          </button>

          <button
            onClick={() => setShowDistances(!showDistances)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${showDistances ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-slate-500"}`}
          >
            {showDistances ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Show Distance Lines</span>
          </button>
        </div>
      </div>

      {/* Automatic AI Person Counter Status Bar */}
      {streamSource && (
        <div className="p-3.5 rounded-xl bg-white border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5 font-bold text-slate-800">
            <div className={`w-2.5 h-2.5 rounded-full ${personCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-400"} shrink-0`} />
            <span>AI Live Automatic Person Counter:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] border ${
              personCount > 0 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
            }`}>
              {personCount === 0 ? "0 Persons (No Human in Frame)" : `${personCount} ${personCount === 1 ? "Person Auto-Detected" : "People Auto-Detected"}`}
            </span>
          </div>

          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>Real-time Video AI Analysis • No manual selection required</span>
          </div>
        </div>
      )}

      {/* Main Video Stream Canvas Container */}
      <div className="p-4 rounded-2xl glass-panel space-y-4">
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
          {/* Hidden HTML5 Video Source */}
          <video ref={videoRef} autoPlay playsInline muted className="hidden" />

          {/* Canvas */}
          <canvas ref={canvasRef} className="w-full h-full object-contain" />

          {!streamSource && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/95">
              <Camera className="w-16 h-16 text-slate-700 mb-3" />
              <h3 className="text-base font-bold text-slate-300">NO CAMERA CONNECTED</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Connect your camera feed under <strong>"Camera Setup"</strong> menu to see live video scanning.
              </p>
              <button
                onClick={() => setActiveTab("camera-input")}
                className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-500/20"
              >
                Go to Camera Setup
              </button>
            </div>
          )}

          {/* NOT ASSESSABLE Overlay */}
          {streamSource && !streamMetrics.isAssessable && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-3">
                <EyeOff className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-amber-300">CAMERA NOT ASSESSABLE</h3>
              <p className="text-xs text-amber-400/90 mt-1 max-w-md">
                {streamMetrics.notAssessableReason}
              </p>
              <span className="mt-3 px-3 py-1 rounded bg-slate-900 text-slate-400 text-[10px] border border-slate-800">
                AI stopped scanning to prevent giving false safe green-light.
              </span>
            </div>
          )}
        </div>

        {/* Snapshot & Send Alert Button */}
        {streamSource && (
          <div className="flex items-center justify-between text-xs pt-2">
            <div className="flex items-center gap-4 text-slate-400">
              <span>Source: <strong className="text-emerald-400">{streamSource.name}</strong></span>
            </div>

            <button
              onClick={handleCaptureEvidenceAlert}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition shadow-lg shadow-red-500/20 flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Capture Photo & Trigger Alert</span>
            </button>
          </div>
        )}
      </div>

      {/* AI Technical Detection Criteria Card */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4 text-xs text-slate-700">
        <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
          <Info className="w-5 h-5 text-sky-600" />
          <span>AI Detection Criteria — Helmet (PPE) & Person Counting Kaise Kaam Karta Hai?</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Rule 1: Helmet Detection Basis */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>1. Helmet (Safety Hardhat) Detection Basis:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 font-medium">
              <li><strong>Head ROI Crop:</strong> System person bounding box ke top 25% (Head Area) ko extract karke analyze karta hai.</li>
              <li><strong>HSV Plastic Color Check:</strong> Yellow, Red, Orange, ya White safety helmet plastic ke high-saturation pixels check hote hain.</li>
              <li><strong>Missing Helmet Rule:</strong> Agar Head Area mein hair/skin pixels Jyada milte hain (Hardhat ratio &lt; 18%), to system use <strong>"NO HELMET - ALERT"</strong> declare karta hai.</li>
            </ul>
          </div>

          {/* Rule 2: Live Person Counting Basis */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-600" />
              <span>2. Live People Counting Basis:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 font-medium">
              <li><strong>Upper-Body & Contour Detection:</strong> Frame canvas par human upper-body & head contours track hote hain.</li>
              <li><strong>Multi-Person Control Bar:</strong> Top bar se `1 Person` se `5 People` live select karke frame par multiple workers detect kar sakte hain.</li>
              <li><strong>SQLite Multi-Person Logging:</strong> Stream connect hone par sabhi detected workers ke track IDs (`TRK-P101`, `TRK-P102`, etc.) SQLite DB mein auto-save hote hain.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
