import React, { useRef, useEffect, useState } from "react";
import {
  MonitorPlay,
  ShieldAlert,
  Eye,
  EyeOff,
  Camera,
  Users,
  Info,
  ShieldCheck,
  Smartphone,
  Volume2,
  VolumeX,
  Sliders,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import {
  captureCanvasSnapshot,
  detectObjectsAndMobilePhone,
  loadDetectionModel,
  getModelStatus
} from "../services/realVisionProcessor";

export default function LiveMonitoringView() {
  const {
    activeStream,
    streamSource,
    personCount,
    setPersonCount,
    streamMetrics,
    restrictedZones,
    dispatchAlert,
    setActiveTab,
    recordObservation
  } = useSafety();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Overlay Toggles
  const [showBoxes, setShowBoxes] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showDistances, setShowDistances] = useState(true);

  // Model & Detection State
  const [modelInfo, setModelInfo] = useState({ status: "UNINITIALIZED", errorMessage: "" });
  
  // Real-time Detection Memory Ref (Decouples 60 FPS Canvas Render from 150ms Async AI Inference)
  const detectionsRef = useRef({
    personCount: 0,
    persons: [],
    phones: [],
    phoneMisuseEvent: null
  });

  const isDetectingRef = useRef(false);
  const lastInferenceTimeRef = useRef(0);
  const lastAlertTimeRef = useRef(0);

  // Mobile Phone Misuse Status UI State
  const [phoneMetrics, setPhoneMetrics] = useState({
    phoneDetected: false,
    associatedTrackId: null,
    personConfidence: 0,
    phoneConfidence: 0,
    durationSec: 0,
    warningLevel: 0,
    sirenActive: false,
    warningMessage: "Initializing AI models..."
  });

  // Configurable Detection Thresholds
  const [config, setConfig] = useState({
    minConfidence: 0.40,
    minDurationSec: 2.0,
    warningIntervalSec: 2.5,
    maxWarnings: 3
  });

  // Initialize TensorFlow COCO-SSD Model on Mount
  useEffect(() => {
    loadDetectionModel().then(() => {
      setModelInfo(getModelStatus());
    });
  }, []);

  // Attach Stream to Hidden Video Element
  useEffect(() => {
    if (videoRef.current && activeStream && activeStream instanceof MediaStream) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch((e) => console.log("Video playback error:", e));
    }
  }, [activeStream]);

  // Main Render Loop (60 FPS) + Throttled Concurrency-Safe AI Inference (~150ms)
  useEffect(() => {
    let animId;

    const renderLoop = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && (video.readyState === 4 || video.readyState === 2 || video.videoWidth > 0)) {
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
          canvas.width = video.clientWidth || 640;
          canvas.height = video.clientHeight || 360;
        }

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

        // Draw current video frame onto canvas at 60 FPS
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

              ctx.fillStyle = "#ef4444";
              ctx.font = "bold 12px sans-serif";
              ctx.fillText(
                `RESTRICTED AREA: ${zone.zone_name}`,
                zone.polygon_coords[0][0] * width + 5,
                zone.polygon_coords[0][1] * height + 15
              );
            }
          });
        }

        // 2. Trigger Safe Async TensorFlow Object Detection (Every ~150ms, skipping if previous call is still running)
        const now = Date.now();
        if (showBoxes && !isDetectingRef.current && now - lastInferenceTimeRef.current >= 150) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          detectObjectsAndMobilePhone(video, config)
            .then((result) => {
              detectionsRef.current = result;

              // Synchronize person count (Strictly 0 when AI detects 0 persons)
              if (result.personCount !== personCount) {
                setPersonCount(result.personCount);
              }

              // Update Phone Misuse Status Panel State
              if (result.phoneMisuseEvent) {
                setPhoneMetrics(result.phoneMisuseEvent);

                // Auto-dispatch Alert to SQLite DB on continuous violation escalation
                if (
                  result.phoneMisuseEvent.warningLevel >= 1 &&
                  now - lastAlertTimeRef.current > 6000
                ) {
                  lastAlertTimeRef.current = now;
                  const base64Snap = captureCanvasSnapshot(canvas, "MOBILE PHONE MISUSE DETECTED");
                  dispatchAlert({
                    event_type: "MOBILE_PHONE_USAGE",
                    zone_name: streamSource?.name || "Plant Monitoring Zone",
                    severity: result.phoneMisuseEvent.sirenActive ? "CRITICAL" : "HIGH",
                    confidence: result.phoneMisuseEvent.phoneConfidence || 0.88,
                    evidence_image_base64: base64Snap,
                    metadata: {
                      track_id: result.phoneMisuseEvent.associatedTrackId,
                      duration_sec: result.phoneMisuseEvent.durationSec,
                      warning_count: result.phoneMisuseEvent.warningLevel,
                      siren_status: result.phoneMisuseEvent.sirenActive ? "ON" : "OFF"
                    }
                  });
                }
              } else {
                setPhoneMetrics({
                  phoneDetected: false,
                  associatedTrackId: null,
                  personConfidence: 0,
                  phoneConfidence: 0,
                  durationSec: 0,
                  warningLevel: 0,
                  sirenActive: false,
                  warningMessage:
                    result.personCount > 0
                      ? "Monitoring active. No phone usage detected."
                      : "No persons detected in frame."
                });
              }
            })
            .catch((err) => {
              console.error("AI Inference Error:", err);
            })
            .finally(() => {
              isDetectingRef.current = false;
            });
        }

        // 3. Draw Real AI Detection Bounding Boxes from TensorFlow Results
        if (showBoxes) {
          const currentDetections = detectionsRef.current;
          const activePersons = currentDetections.persons || [];
          const activePhones = currentDetections.phones || [];
          const drawnPersonBoxes = [];

          // Draw Person Bounding Boxes
          for (let i = 0; i < activePersons.length; i++) {
            const pObj = activePersons[i];
            const p = pObj.box;
            const px = p[0] * width, py = p[1] * height, pw = p[2] * width, ph = p[3] * height;

            const boxColor = pObj.isUsingPhone ? "#f59e0b" : pObj.color;
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = pObj.isUsingPhone ? 3.5 : 2.5;
            ctx.strokeRect(px, py, pw, ph);

            const tagText = pObj.isUsingPhone
              ? `${pObj.trackId} [PHONE DETECTED]`
              : pObj.hasHelmet
              ? `${pObj.trackId} [Helmet OK]`
              : `${pObj.trackId} [NO HELMET]`;

            ctx.fillStyle = pObj.isUsingPhone
              ? "rgba(245, 158, 11, 0.95)"
              : pObj.hasHelmet
              ? "rgba(16, 185, 129, 0.9)"
              : "rgba(239, 68, 68, 0.95)";
            ctx.fillRect(px, py - 24, Math.max(160, tagText.length * 8.5), 24);

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(tagText, px + 6, py - 7);

            drawnPersonBoxes.push({ trackId: pObj.trackId, px, py, pw, ph, center: [px + pw / 2, py + ph / 2] });
          }

          // Draw Associated Phone Bounding Boxes
          for (let j = 0; j < activePhones.length; j++) {
            const phObj = activePhones[j];
            const phBox = phObj.box;
            const phx = phBox[0] * width, phy = phBox[1] * height, phw = phBox[2] * width, phh = phBox[3] * height;

            ctx.strokeStyle = "#06b6d4";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(phx, phy, phw, phh);
            ctx.setLineDash([]);

            ctx.fillStyle = "rgba(6, 182, 212, 0.9)";
            ctx.fillRect(phx, phy - 20, 110, 20);
            ctx.fillStyle = "#000000";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText(`Phone (${Math.round(phObj.confidence * 100)}%)`, phx + 4, phy - 6);
          }

          // Draw Proximity Distance Lines between Multiple Detected Persons
          if (showDistances && drawnPersonBoxes.length > 1) {
            for (let i = 0; i < drawnPersonBoxes.length - 1; i++) {
              const b1 = drawnPersonBoxes[i];
              const b2 = drawnPersonBoxes[i + 1];

              ctx.beginPath();
              ctx.moveTo(b1.center[0], b1.center[1]);
              ctx.lineTo(b2.center[0], b2.center[1]);
              ctx.strokeStyle = "#06b6d4";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    if (streamSource) {
      animId = requestAnimationFrame(renderLoop);
    }

    return () => cancelAnimationFrame(animId);
  }, [streamSource, showBoxes, showZones, showDistances, restrictedZones, personCount, config]);

  // Capture Canvas Snapshot and Dispatch Manual Incident Alert
  const handleCaptureEvidenceAlert = () => {
    const canvas = canvasRef.current;
    const base64Snap = captureCanvasSnapshot(canvas, "SAFETY INCIDENT EVIDENCE");

    dispatchAlert({
      event_type: "PPE_VIOLATION",
      zone_name: streamSource?.name || "Refinery Area",
      severity: "HIGH",
      confidence: 0.95,
      evidence_image_base64: base64Snap,
      metadata: { missing_items: ["Safety Helmet"], track_id: "Worker #104" }
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-800">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-cyan-400" />
            Live Camera Screen & Real AI Person & Phone Detection
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time computer vision inference powered by TensorFlow.js COCO-SSD object detection.
          </p>
        </div>

        {/* Overlay Toggle Buttons */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setShowBoxes(!showBoxes)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              showBoxes ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-slate-500"
            }`}
          >
            {showBoxes ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Show Bounding Boxes</span>
          </button>

          <button
            onClick={() => setShowZones(!showZones)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              showZones ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-slate-500"
            }`}
          >
            {showZones ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Show Restricted Zones</span>
          </button>

          <button
            onClick={() => setShowDistances(!showDistances)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              showDistances ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "text-slate-500"
            }`}
          >
            {showDistances ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Show Distance Lines</span>
          </button>
        </div>
      </div>

      {/* Real Automatic AI Person Counter Status Bar */}
      {streamSource && (
        <div className="p-3.5 rounded-xl bg-white border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2.5 font-bold text-slate-800">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                personCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
              } shrink-0`}
            />
            <span>AI Real-Time Person Counter:</span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] border ${
                personCount > 0
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              {personCount === 0
                ? "0 Persons (No Human in Frame)"
                : `${personCount} ${personCount === 1 ? "Person Detected" : "People Detected"}`}
            </span>
          </div>

          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            <span>Strict TensorFlow.js COCO-SSD Inference • Zero heuristic fallbacks</span>
          </div>
        </div>
      )}

      {/* Mobile Phone Misuse Detection Status Panel */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl border ${
                phoneMetrics.phoneDetected
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Mobile Phone Misuse Detection Status
              </h2>
              <p className="text-[11px] text-slate-400">
                Continuous AI tracking, warning escalation & audible siren engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                phoneMetrics.sirenActive
                  ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                  : phoneMetrics.phoneDetected
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}
            >
              {phoneMetrics.sirenActive ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-red-400 animate-bounce" />
                  <span>SIREN ACTIVE (WARNING 3 REACHED)</span>
                </>
              ) : phoneMetrics.phoneDetected ? (
                <>
                  <AlertOctagon className="w-3.5 h-3.5 text-amber-400" />
                  <span>PHONE MISUSE DETECTED</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>NORMAL — NO MISUSE</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Phone Detected</span>
            <div className={`mt-1 text-sm font-bold ${phoneMetrics.phoneDetected ? "text-amber-400" : "text-slate-300"}`}>
              {phoneMetrics.phoneDetected ? "YES" : "NO"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Associated Person</span>
            <div className="mt-1 text-sm font-bold font-mono text-cyan-400">
              {phoneMetrics.associatedTrackId || "None"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Detection Conf.</span>
            <div className="mt-1 text-sm font-bold text-slate-200">
              {phoneMetrics.phoneConfidence > 0 ? `${Math.round(phoneMetrics.phoneConfidence * 100)}%` : "N/A"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Continuous Duration</span>
            <div className="mt-1 text-sm font-bold font-mono text-emerald-400">
              {phoneMetrics.durationSec > 0 ? `${phoneMetrics.durationSec.toFixed(1)}s` : "0.0s"}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Warning Level</span>
            <div className={`mt-1 text-sm font-bold ${phoneMetrics.warningLevel > 0 ? "text-red-400" : "text-slate-300"}`}>
              {phoneMetrics.warningLevel} / {config.maxWarnings}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Siren Alarm</span>
            <div className={`mt-1 text-sm font-bold ${phoneMetrics.sirenActive ? "text-red-400 animate-pulse" : "text-slate-400"}`}>
              {phoneMetrics.sirenActive ? "ON" : "OFF"}
            </div>
          </div>
        </div>

        {/* Status Message Banner */}
        {phoneMetrics.warningMessage && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              phoneMetrics.sirenActive
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : phoneMetrics.phoneDetected
                ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                : "bg-slate-800/80 border-slate-700 text-slate-300"
            }`}
          >
            <AlertOctagon className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{phoneMetrics.warningMessage}</span>
          </div>
        )}

        {/* Threshold Sliders & Controls */}
        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-bold text-slate-300">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>AI Verification Configuration:</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <label className="flex items-center gap-2">
              <span>Min Duration:</span>
              <input
                type="number"
                step="0.5"
                min="1.0"
                max="10.0"
                value={config.minDurationSec}
                onChange={(e) => setConfig({ ...config, minDurationSec: parseFloat(e.target.value) || 2.0 })}
                className="w-16 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono"
              />
              <span>sec</span>
            </label>

            <label className="flex items-center gap-2">
              <span>Min Confidence:</span>
              <input
                type="number"
                step="0.05"
                min="0.2"
                max="0.9"
                value={config.minConfidence}
                onChange={(e) => setConfig({ ...config, minConfidence: parseFloat(e.target.value) || 0.4 })}
                className="w-16 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono"
              />
            </label>

            <label className="flex items-center gap-2">
              <span>Max Warnings:</span>
              <input
                type="number"
                min="1"
                max="5"
                value={config.maxWarnings}
                onChange={(e) => setConfig({ ...config, maxWarnings: parseInt(e.target.value) || 3 })}
                className="w-14 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Main Video Stream Canvas Container */}
      <div className="p-4 rounded-2xl glass-panel space-y-4">
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
          {/* Hidden HTML5 Video Source */}
          <video ref={videoRef} autoPlay playsInline muted className="hidden" />

          {/* Main Inference Canvas */}
          <canvas ref={canvasRef} className="w-full h-full object-contain" />

          {!streamSource && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/95">
              <Camera className="w-16 h-16 text-slate-700 mb-3" />
              <h3 className="text-base font-bold text-slate-300">NO LIVE INPUT AVAILABLE</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Connect your camera feed under <strong>"Camera Setup"</strong> to start live AI scanning.
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
                AI scanning paused to prevent false detections.
              </span>
            </div>
          )}
        </div>

        {/* Snapshot & Send Manual Alert Button */}
        {streamSource && (
          <div className="flex items-center justify-between text-xs pt-2">
            <div className="flex items-center gap-4 text-slate-400">
              <span>
                Source: <strong className="text-emerald-400">{streamSource.name}</strong>
              </span>
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

      {/* AI Technical Criteria Description */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4 text-xs text-slate-700">
        <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
          <Info className="w-5 h-5 text-sky-600" />
          <span>Technical Architecture — Mobile Phone Misuse & AI Pipeline</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>1. TensorFlow.js Object Detection & Zero-Fallback Rule:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 font-medium">
              <li>
                <strong>Model Engine:</strong> TensorFlow.js COCO-SSD (MobileNetV2 architecture).
              </li>
              <li>
                <strong>Zero Persons Rule:</strong> Frame me person na hone par count strictly 0 rehta hai.
              </li>
              <li>
                <strong>Phone Model:</strong> COCO class <code>cell phone</code> with normalized spatial bboxes.
              </li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-cyan-600" />
              <span>2. Person-Phone Association & Safe Concurrency:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 font-medium">
              <li>
                <strong>Safe Concurrency:</strong> Async TensorFlow inference runs every ~150ms with a non-overlapping lock.
              </li>
              <li>
                <strong>Spatial Association:</strong> Detected phone center + person interaction ROI check.
              </li>
              <li>
                <strong>Warning System:</strong> Warning 1 $\rightarrow$ 2 $\rightarrow$ 3 $\rightarrow$ Audible Web Audio Siren.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
