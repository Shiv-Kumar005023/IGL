import React, { useRef, useEffect, useState } from "react";
import {
  Camera,
  Upload,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldAlert,
  CheckCircle2,
  FlipHorizontal,
  Users,
  Smartphone,
  Activity,
  Sliders,
  ShieldCheck,
  AlertOctagon,
  FileImage,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Layers,
  Box,
  Laptop,
  Briefcase,
  Pipette,
  Radio,
  Clock,
  Shield,
  Car,
  Droplets,
  Volume2,
  VolumeX
} from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import {
  captureCanvasSnapshot,
  detectObjectsAndMobilePhone,
  detectPipeLeakage,
  startSirenAlarm,
  stopSirenAlarm,
  loadDetectionModel,
  getModelStatus
} from "../services/realVisionProcessor";

export default function PipeInspectionView() {
  const {
    activeStream,
    streamSource,
    personCount,
    setPersonCount,
    streamMetrics,
    restrictedZones,
    dispatchAlert,
    alerts,
    personnelEvents,
    connectWebcam,
    connectImageFile,
    disconnectStream
  } = useSafety();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  // Input Mode: "camera" (Live Camera Feed) vs "image" (Upload Pipe Image)
  const [inputMode, setInputMode] = useState("camera");
  const [cameraError, setCameraError] = useState(null);
  const [isConnectingCam, setIsConnectingCam] = useState(false);
  const [uploadedImageSrc, setUploadedImageSrc] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");

  // Overlay Toggles
  const [showBoxes, setShowBoxes] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [showDetails, setShowDetails] = useState(true);

  // Threshold Configuration State
  const [config, setConfig] = useState({
    minConfidence: 0.35,
    phoneThreshold: 0.35
  });

  // Real Frame Counter & Timestamps
  const [framesAnalyzedCount, setFramesAnalyzedCount] = useState(0);
  const [lastAnalysisTimestamp, setLastAnalysisTimestamp] = useState("Awaiting Input");

  // Model & Detection State
  const [modelInfo, setModelInfo] = useState({ status: "UNINITIALIZED", errorMessage: "" });

  // Detection Memory & Metrics
  const isDetectingRef = useRef(false);
  const lastInferenceTimeRef = useRef(0);

  const [detectionSummary, setDetectionSummary] = useState({
    rawPredictionsCount: 0,
    totalObjectsDetected: 0,
    personsDetected: 0,
    rawDetectionsSummary: [],
    validPredictions: [],
    persons: [],
    phones: [],
    displayCards: [
      { rawKey: "person", name: "Person / Personnel", icon: "👤", count: 0, confidence: 0 },
      { rawKey: "cell phone", name: "Mobile Phone", icon: "📱", count: 0, confidence: 0 },
      { rawKey: "backpack", name: "Backpack", icon: "🎒", count: 0, confidence: 0 },
      { rawKey: "bottle", name: "Bottle", icon: "🍾", count: 0, confidence: 0 },
      { rawKey: "car", name: "Car", icon: "🚗", count: 0, confidence: 0 }
    ],
    objectCounts: {
      person: 0,
      phone: 0,
      bottle: 0,
      backpack: 0,
      car: 0,
      other: 0
    },
    detectionsDetailedList: []
  });

  // Pipe Leakage State & Emergency Siren Handles
  const [leakageResult, setLeakageResult] = useState({
    detected: false,
    confidence: 0,
    type: "VISIBLE_PIPE_LEAKAGE",
    evidence_region: null,
    source: "UPLOADED_IMAGE",
    status: "NO_LEAKAGE",
    qualityCheck: { passed: true, reason: "OK" },
    details: "Awaiting image inspection..."
  });

  const [isSirenSounding, setIsSirenSounding] = useState(false);
  const [isSirenSilenced, setIsSirenSilenced] = useState(false);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);

  const leakageAlertDispatchedRef = useRef(false);
  const isSirenSilencedRef = useRef(false);

  // Silence Siren Handler
  const handleSilenceSiren = () => {
    stopSirenAlarm();
    setIsSirenSounding(false);
    setIsSirenSilenced(true);
    isSirenSilencedRef.current = true;
  };

  // Pre-unlock Audio Permission Handler
  const handleEnableAudio = () => {
    setAudioPermissionGranted(true);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        ctx.resume();
      }
    } catch (e) { }
  };

  // Initialize TensorFlow COCO-SSD Model on Mount & Ensure Siren is Off
  useEffect(() => {
    stopSirenAlarm();
    loadDetectionModel().then(() => {
      setModelInfo(getModelStatus());
    });
    return () => {
      stopSirenAlarm();
    };
  }, []);

  // Attach Stream to Hidden Video Element whenever activeStream or inputMode changes
  useEffect(() => {
    if (videoRef.current && activeStream && activeStream instanceof MediaStream) {
      if (videoRef.current.srcObject !== activeStream) {
        videoRef.current.srcObject = activeStream;
      }
      videoRef.current.play().catch((e) => console.log("Video playback error:", e));
    }
  }, [activeStream, inputMode]);

  // Auto-connect webcam on component mount if camera mode active & no stream exists
  useEffect(() => {
    if (inputMode === "camera" && !activeStream && !isConnectingCam && !cameraError) {
      handleSelectLiveCamera();
    }
  }, [inputMode]);

  // Handle Mode Switch to Live Camera
  const handleSelectLiveCamera = async () => {
    setInputMode("camera");
    setCameraError(null);
    if (!activeStream) {
      setIsConnectingCam(true);
      const res = await connectWebcam();
      setIsConnectingCam(false);
      if (!res.success) {
        setCameraError(res.error || "Camera access denied or device missing. Please click 'Enable Camera'.");
      }
    }
  };

  // Re-try / Re-request Camera Permission
  const handleEnableCameraClick = async () => {
    setCameraError(null);
    setIsConnectingCam(true);
    const res = await connectWebcam();
    setIsConnectingCam(false);
    if (!res.success) {
      setCameraError(res.error || "Camera access denied. Please check browser camera permissions.");
    }
  };

  // Handle Image File Upload (JPG, JPEG, PNG)
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setInputMode("image");
      setCameraError(null);
      setUploadedFileName(file.name);
      const fileUrl = URL.createObjectURL(file);
      setUploadedImageSrc(fileUrl);
      await connectImageFile(file);
    }
  };

  // Main Render Loop (60 FPS) + Throttled Concurrency-Safe AI Inference (~150ms)
  useEffect(() => {
    let animId;

    const renderLoop = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const img = imageRef.current;

      const isImageSource = inputMode === "image" && img && (img.complete || img.naturalWidth > 0);
      const isVideoSource = inputMode === "camera" && video && (video.readyState >= 2 || video.videoWidth > 0);
      const sourceElem = isImageSource ? img : isVideoSource ? video : null;

      if (canvas) {
        // Ensure default canvas dimensions if container not sized yet
        const targetW = canvas.clientWidth || 640;
        const targetH = canvas.clientHeight || 360;

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

        if (sourceElem) {
          // Draw current frame onto canvas
          if (isMirrored && !isImageSource) {
            ctx.save();
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(sourceElem, 0, 0, width, height);
            ctx.restore();
          } else {
            ctx.drawImage(sourceElem, 0, 0, width, height);
          }

          // Draw Restricted Zones if enabled
          if (showZones && restrictedZones.length > 0) {
            restrictedZones.forEach((zone) => {
              if (zone.polygon_coords && zone.polygon_coords.length > 2) {
                ctx.beginPath();
                const startX = isMirrored && !isImageSource
                  ? (1 - zone.polygon_coords[0][0]) * width
                  : zone.polygon_coords[0][0] * width;
                ctx.moveTo(startX, zone.polygon_coords[0][1] * height);

                for (let i = 1; i < zone.polygon_coords.length; i++) {
                  const zx = isMirrored && !isImageSource
                    ? (1 - zone.polygon_coords[i][0]) * width
                    : zone.polygon_coords[i][0] * width;
                  ctx.lineTo(zx, zone.polygon_coords[i][1] * height);
                }
                ctx.closePath();
                ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
                ctx.fill();
                ctx.strokeStyle = "#ef4444";
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            });
          }

          // Trigger Async Pipe Leakage Analysis & TensorFlow COCO-SSD Detection (~150ms)
          const now = Date.now();
          if (showBoxes && !isDetectingRef.current && now - lastInferenceTimeRef.current >= 150) {
            isDetectingRef.current = true;
            lastInferenceTimeRef.current = now;

            // 1. Dedicated Computer Vision Pipe Leakage Analysis
            const leakRes = detectPipeLeakage(sourceElem, {
              source: inputMode === "image" ? "UPLOADED_IMAGE" : "LIVE_CAMERA"
            });
            setLeakageResult(leakRes);

            if (leakRes && leakRes.detected && leakRes.confidence >= 0.75) {
              if (!leakageAlertDispatchedRef.current) {
                leakageAlertDispatchedRef.current = true;
                const snapBase64 = captureCanvasSnapshot(canvas, "VISIBLE PIPE LEAKAGE DETECTED");
                dispatchAlert({
                  event_type: "VISIBLE_PIPE_LEAKAGE",
                  zone_name: inputMode === "image" ? `Uploaded Image (${uploadedFileName || "Pipe Scan"})` : "Live Pipe Scanner",
                  severity: "HIGH",
                  confidence: leakRes.confidence,
                  evidence_image_base64: snapBase64,
                  metadata: {
                    source: inputMode,
                    leakage_type: "VISIBLE_PIPE_LEAKAGE",
                    confidence: leakRes.confidence,
                    evidence_region: leakRes.evidence_region,
                    status: "REVIEW_REQUIRED",
                    description: "Visible liquid leakage detected from pipe/joint. Human verification required."
                  }
                });
              }
            } else if (!leakRes || !leakRes.detected) {
              leakageAlertDispatchedRef.current = false;
            }

            // 2. COCO-SSD Object Detection
            detectObjectsAndMobilePhone(sourceElem, config)
              .then((result) => {
                setFramesAnalyzedCount((prev) => prev + 1);
                setLastAnalysisTimestamp(new Date().toLocaleTimeString());

                const minConf = config.minConfidence || 0.35;
                const rawSummary = result.rawDetectionsSummary || result.rawPredictions || [];
                
                // Filter valid predictions meeting confidence threshold
                const validPredictions = rawSummary.filter((item) => (item.score || 0) >= minConf);

                // Featured standard classes mapping
                const FEATURED_CLASSES = [
                  { rawKey: "person", name: "Person / Personnel", icon: "👤" },
                  { rawKey: "cell phone", name: "Mobile Phone", icon: "📱" },
                  { rawKey: "backpack", name: "Backpack", icon: "🎒" },
                  { rawKey: "bottle", name: "Bottle", icon: "🍾" },
                  { rawKey: "car", name: "Car", icon: "🚗" }
                ];

                const classCounts = {};
                const maxConfidences = {};

                validPredictions.forEach((item) => {
                  let c = (item.class || "").toLowerCase().trim();
                  if (c === "phone" || c === "mobile phone" || c.includes("phone") || c.includes("mobile")) c = "cell phone";
                  else if (c === "bag" || c === "handbag") c = "backpack";

                  classCounts[c] = (classCounts[c] || 0) + 1;
                  const scorePct = Math.round((item.score || 0) * 100);
                  if (!maxConfidences[c] || scorePct > maxConfidences[c]) {
                    maxConfidences[c] = scorePct;
                  }
                });

                const displayCards = FEATURED_CLASSES.map((feat) => ({
                  rawKey: feat.rawKey,
                  name: feat.name,
                  icon: feat.icon,
                  count: classCounts[feat.rawKey] || 0,
                  confidence: maxConfidences[feat.rawKey] || 0
                }));

                // Append any extra non-featured COCO class detected in current frame
                Object.keys(classCounts).forEach((k) => {
                  if (!FEATURED_CLASSES.some((f) => f.rawKey === k)) {
                    const capitalized = k.charAt(0).toUpperCase() + k.slice(1);
                    displayCards.push({
                      rawKey: k,
                      name: capitalized,
                      icon: "📦",
                      count: classCounts[k],
                      confidence: maxConfidences[k] || 0
                    });
                  }
                });

                const totalObjectsDetected = validPredictions.length;
                const personsDetected = classCounts["person"] || 0;

                const detailedList = validPredictions.map((item, idx) => ({
                  id: `DET-${idx + 1}`,
                  class: item.class,
                  score: item.score,
                  bbox: item.bbox || [0, 0, 0, 0],
                  timestamp: new Date().toLocaleTimeString()
                }));

                setDetectionSummary({
                  rawPredictionsCount: validPredictions.length,
                  totalObjectsDetected,
                  personsDetected,
                  rawDetectionsSummary: rawSummary,
                  validPredictions,
                  displayCards,
                  persons: result.persons || [],
                  phones: result.phones || [],
                  objectCounts: {
                    person: personsDetected,
                    phone: classCounts["cell phone"] || 0,
                    bottle: classCounts["bottle"] || 0,
                    backpack: classCounts["backpack"] || 0,
                    car: classCounts["car"] || 0,
                    other: Math.max(0, totalObjectsDetected - (personsDetected + (classCounts["cell phone"] || 0) + (classCounts["bottle"] || 0) + (classCounts["backpack"] || 0) + (classCounts["car"] || 0)))
                  },
                  detectionsDetailedList: detailedList
                });

                if (result.personCount !== personCount) {
                  setPersonCount(result.personCount);
                }

                // Synchronized Bounding Boxes Rendering on Canvas
                if (showBoxes && validPredictions.length > 0) {
                  const sourceW = sourceElem.videoWidth || sourceElem.width || sourceElem.naturalWidth || 640;
                  const sourceH = sourceElem.videoHeight || sourceElem.height || sourceElem.naturalHeight || 360;

                  validPredictions.forEach((item, idx) => {
                    let box = item.bbox;
                    const c = (item.class || "").toLowerCase().trim();
                    const scorePct = Math.round((item.score || 0) * 100);
                    let color = "#06b6d4";
                    let labelText = "";

                    if (c === "person") {
                      color = "#06b6d4";
                      const matchedPerson = (result.persons || [])[idx] || (result.persons || [])[0];
                      const trackId = matchedPerson?.trackId || `TRK-P0${idx + 1}`;
                      labelText = `${trackId} (Person: ${scorePct}%)`;
                      if (matchedPerson?.box) box = matchedPerson.box;
                    } else if (c === "cell phone" || c === "phone" || c === "mobile phone" || c.includes("phone")) {
                      color = "#f59e0b";
                      labelText = `Mobile Phone: ${scorePct}%`;
                      const matchedPhone = (result.phones || [])[idx] || (result.phones || [])[0];
                      if (matchedPhone?.box) box = matchedPhone.box;
                    } else if (c === "backpack" || c === "bag" || c === "handbag") {
                      color = "#818cf8";
                      labelText = `Backpack: ${scorePct}%`;
                    } else if (c === "bottle") {
                      color = "#10b981";
                      labelText = `Bottle: ${scorePct}%`;
                    } else if (c === "car") {
                      color = "#f43f5e";
                      labelText = `Car: ${scorePct}%`;
                    } else {
                      color = "#38bdf8";
                      const capitalized = c.charAt(0).toUpperCase() + c.slice(1);
                      labelText = `${capitalized}: ${scorePct}%`;
                    }

                    if (box && box.length === 4) {
                      let bx, by, bw, bh;
                      if (box[0] <= 1.0 && box[1] <= 1.0 && box[2] <= 1.0 && box[3] <= 1.0) {
                        bx = box[0] * width;
                        by = box[1] * height;
                        bw = box[2] * width;
                        bh = box[3] * height;
                      } else {
                        bx = (box[0] / sourceW) * width;
                        by = (box[1] / sourceH) * height;
                        bw = (box[2] / sourceW) * width;
                        bh = (box[3] / sourceH) * height;
                      }

                      ctx.strokeStyle = color;
                      ctx.lineWidth = 3;
                      ctx.strokeRect(bx, by, bw, bh);

                      ctx.fillStyle = color;
                      const pillWidth = Math.max(120, labelText.length * 7.5 + 16);
                      ctx.fillRect(bx, Math.max(0, by - 22), pillWidth, 20);

                      ctx.fillStyle = "#ffffff";
                      ctx.font = "bold 11px sans-serif";
                      ctx.fillText(labelText, bx + 5, Math.max(14, by - 7));
                    }
                  });
                }

                // Draw Pipe Leakage Evidence Region Highlight on Canvas
                if (leakRes && leakRes.detected && leakRes.evidence_region) {
                  const [normX, normY, normW, normH] = leakRes.evidence_region;
                  const lx = normX * width;
                  const ly = normY * height;
                  const lw = normW * width;
                  const lh = normH * height;

                  ctx.save();
                  ctx.strokeStyle = "#ef4444";
                  ctx.lineWidth = 3.5;
                  ctx.setLineDash([8, 4]);
                  ctx.strokeRect(lx, ly, lw, lh);

                  ctx.fillStyle = "rgba(239, 68, 68, 0.22)";
                  ctx.fillRect(lx, ly, lw, lh);

                  ctx.fillStyle = "#ef4444";
                  const pillW = Math.max(220, Math.round(lw * 0.75));
                  ctx.fillRect(lx, Math.max(0, ly - 24), pillW, 22);

                  ctx.fillStyle = "#ffffff";
                  ctx.font = "bold 11px sans-serif";
                  ctx.fillText(`🔴 VISIBLE PIPE LEAKAGE (${Math.round(leakRes.confidence * 100)}%)`, lx + 6, Math.max(14, ly - 8));
                  ctx.restore();
                }
              })
              .catch((err) => {
                console.error("AI Object Detection Error:", err);
              })
              .finally(() => {
                isDetectingRef.current = false;
              });
          }
        }
      }

      animId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [streamSource, inputMode, showBoxes, showZones, isMirrored, restrictedZones, personCount, config]);

  // Capture Canvas Snapshot and Dispatch Alert
  const handleCaptureEvidenceAlert = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base64Snap = captureCanvasSnapshot(canvas, "PIPE INSPECTION EVIDENCE");

    dispatchAlert({
      event_type: "PPE_VIOLATION",
      zone_name: inputMode === "image" ? `Pipe Image (${uploadedFileName})` : "Pipe Camera Feed",
      severity: "HIGH",
      confidence: 0.95,
      evidence_image_base64: base64Snap,
      metadata: { source: inputMode, file_name: uploadedFileName, detected_persons: personCount }
    });
  };

  // Derive Real Safety Verdict Status
  const activeUnresolvedAlerts = (alerts || []).filter((a) => a.status !== "RESOLVED").length;
  const activePersonnelAlerts = (personnelEvents || []).filter((e) => e.status !== "RESOLVED").length;
  const isPhoneDetected = detectionSummary.objectCounts.phone > 0;

  let safetyResult = {
    status: "NORMAL",
    color: "emerald",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    title: "🟢 Pipe Inspection Status: Normal Operation",
    sub: "All pipe inspection parameters, surrounding personnel and safety limits are operating normally."
  };

  if (leakageResult && leakageResult.detected) {
    safetyResult = {
      status: "LEAKAGE_DETECTED",
      color: "red",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
      title: "🔴 VISIBLE PIPE LEAKAGE DETECTED",
      sub: "Active liquid spray escaping from pipe/joint. Human verification required."
    };
  } else if (isPhoneDetected) {
    safetyResult = {
      status: "WARNING",
      color: "amber",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      title: "🟠 Caution — Mobile Phone Misuse Near Pipe Line",
      sub: "Mobile device detected in pipe operational bay. Tracking for compliance."
    };
  } else if (personCount > 0) {
    safetyResult = {
      status: "PERSONNEL_ACTIVE",
      color: "cyan",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
      text: "text-cyan-400",
      title: "👤 Personnel Active in Inspection Zone",
      sub: `${personCount} personnel detected in pipe inspection area.`
    };
  } else if (activeUnresolvedAlerts > 0) {
    safetyResult = {
      status: "INCIDENT",
      color: "amber",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
      title: "⚠️ Safety Event Logged — Review Required",
      sub: `${activeUnresolvedAlerts} active unresolved safety event(s) logged in system.`
    };
  }

  const isModelReady = modelInfo.status === "READY";
  const isInputActive = (inputMode === "camera" && activeStream !== null) || (inputMode === "image" && uploadedImageSrc !== null);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* 🚨 PROMINENT EMERGENCY LEAKAGE ALERT BANNER */}
      {leakageResult && leakageResult.detected && (
        <div className="p-4 rounded-2xl bg-red-950/90 border-2 border-red-500 text-red-100 shadow-2xl space-y-3 animate-pulse">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-600 text-white shrink-0 animate-bounce">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white uppercase tracking-wider font-mono">
                    🚨 SAFETY ALERT
                  </span>
                  <span className="text-xs font-mono text-red-300">
                    STATUS: {leakageResult.status || "REVIEW REQUIRED"}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                  🔴 VISIBLE PIPE LEAKAGE DETECTED
                </h2>
                <p className="text-xs text-red-200 font-mono mt-0.5">
                  {leakageResult.details} • Confidence: <strong className="text-white font-bold">{Math.round((leakageResult.confidence || 0.94) * 100)}%</strong> • Source: <span className="text-cyan-300 font-bold">{inputMode === "image" ? "Uploaded Image" : "Live Camera"}</span>
                </p>
              </div>
            </div>

            {/* Alert Controls */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              {isSirenSounding ? (
                <button
                  onClick={handleSilenceSiren}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow-lg flex items-center gap-1.5"
                >
                  <VolumeX className="w-4 h-4" />
                  <span>Silence Siren</span>
                </button>
              ) : (
                <button
                  onClick={handleEnableAudio}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{audioPermissionGranted ? "Siren Ready" : "Enable Audio"}</span>
                </button>
              )}

              <button
                onClick={handleCaptureEvidenceAlert}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-red-500/50 text-white font-bold transition flex items-center gap-1.5"
              >
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>View Evidence</span>
              </button>

              <button
                onClick={() => {
                  handleSilenceSiren();
                  setLeakageResult((prev) => ({ ...prev, status: "REVIEWED" }));
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Reviewed</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP HEADER BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                PIPE INSPECTION & COMPUTER VISION SCANNER
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time industrial pipe visual inspection, object detection and AI safety compliance scanning.
              </p>
            </div>
          </div>
        </div>

        {/* Top Badges & Dual Mode Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                isModelReady
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isModelReady ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span>{isModelReady ? "🟢 AI SCANNER ONLINE" : "🔴 AI OFFLINE"}</span>
            </span>

            <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-400 font-bold">
              {inputMode === "camera" ? "📹 LIVE PIPE CAMERA" : "🖼️ UPLOADED PIPE IMAGE"}
            </span>
          </div>

          {/* Dual Input Mode Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            <button
              onClick={handleSelectLiveCamera}
              disabled={isConnectingCam}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                inputMode === "camera"
                  ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {isConnectingCam ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              <span>Live Camera</span>
            </button>

            <label
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                inputMode === "image"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Pipe Image</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 2. PROMINENT LIVE PIPE INSPECTION STATUS BAR */}
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-lg transition-all ${
          isInputActive
            ? "bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border-emerald-500/40 text-emerald-300"
            : "bg-slate-900 border-slate-800 text-slate-400"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border shrink-0 ${
              isInputActive
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            }`}
          >
            {isInputActive ? <Activity className="w-5 h-5 animate-pulse" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-100 tracking-tight">
                {isInputActive ? "🟢 PIPE INSPECTION RUNNING" : "🟠 PIPE SCANNER IDLE — AWAITING INPUT"}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 font-mono text-cyan-400">
                ● {inputMode === "camera" ? "Live Camera Pipe Scan" : "Image Inspection Active"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isInputActive
                ? "Continuous industrial pipe visual scanning, spatial bounding box detection & real-time safety evaluation"
                : "Click 'Live Camera' to start webcam feed or 'Upload Pipe Image' to scan a pipe photo."}
            </p>
          </div>
        </div>

        {/* Real Dynamic Metrics */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-4">
          <div>
            <span className="text-slate-500 uppercase block text-[9px]">Frames Analyzed</span>
            <span className="text-slate-100 font-bold text-sm">{framesAnalyzedCount}</span>
          </div>
          <div>
            <span className="text-slate-500 uppercase block text-[9px]">Last Analysis</span>
            <span className="text-cyan-400 font-bold">{lastAnalysisTimestamp}</span>
          </div>
          <div>
            <span className="text-slate-500 uppercase block text-[9px]">Engine Model</span>
            <span className="text-emerald-400 font-bold">TensorFlow COCO-SSD (v2.2)</span>
          </div>
        </div>
      </div>

      {/* Permission Denied Alert Banner & Enable Camera Button */}
      {inputMode === "camera" && cameraError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <div>
              <strong className="block font-bold text-red-300">Camera Permission Required:</strong>
              <span>{cameraError}</span>
            </div>
          </div>
          <button
            onClick={handleEnableCameraClick}
            disabled={isConnectingCam}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow-lg shrink-0 flex items-center gap-1.5"
          >
            {isConnectingCam ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span>Enable Camera</span>
          </button>
        </div>
      )}

      {/* 3. AI PIPE INSPECTION PIPELINE STAGES */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-cyan-400" />
            Pipe Inspection Pipeline Stages
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Real-Time Computer Vision Engine</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-[11px] font-mono font-bold">
          <div
            className={`p-2.5 rounded-xl border transition ${
              isInputActive
                ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/40 shadow-xs"
                : "bg-slate-950 text-slate-500 border-slate-800"
            }`}
          >
            <span className="block text-[9px] text-slate-500 uppercase font-sans">STAGE 1</span>
            <span>PIPE INPUT</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border transition ${
              framesAnalyzedCount > 0
                ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/40 shadow-xs"
                : "bg-slate-950 text-slate-500 border-slate-800"
            }`}
          >
            <span className="block text-[9px] text-slate-500 uppercase font-sans">STAGE 2</span>
            <span>FRAME ANALYSIS</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border transition ${
              detectionSummary.rawPredictionsCount > 0
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40 shadow-xs"
                : "bg-slate-950 text-slate-500 border-slate-800"
            }`}
          >
            <span className="block text-[9px] text-slate-500 uppercase font-sans">STAGE 3</span>
            <span>OBJECT DETECT</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border transition ${
              personCount > 0
                ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/40 shadow-xs"
                : "bg-slate-950 text-slate-500 border-slate-800"
            }`}
          >
            <span className="block text-[9px] text-slate-500 uppercase font-sans">STAGE 4</span>
            <span>PERSON TRACK</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border transition ${
              isInputActive
                ? "bg-amber-500/10 text-amber-300 border-amber-500/40 shadow-xs"
                : "bg-slate-950 text-slate-500 border-slate-800"
            }`}
          >
            <span className="block text-[9px] text-slate-500 uppercase font-sans">STAGE 5</span>
            <span>SAFETY RULES</span>
          </div>

          <div
            className={`p-2.5 rounded-xl border transition ${
              isInputActive
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40 shadow-xs"
                : "bg-slate-950 text-slate-500 border-slate-800"
            }`}
          >
            <span className="block text-[9px] text-slate-500 uppercase font-sans">STAGE 6</span>
            <span>PIPE VERDICT</span>
          </div>
        </div>
      </div>

      {/* 4. MAIN GRID: VIEWPORT (LEFT 2 COLS) + "WHAT AI IS DETECTING" PANEL (RIGHT 1 COL) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Pipe Inspection Viewport */}
        <div className="lg:col-span-2 p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isInputActive ? "bg-emerald-500 animate-ping" : "bg-slate-600"}`} />
              <h2 className="text-sm font-bold text-slate-100">
                Pipe Inspection Viewport ({inputMode === "image" ? `Image: ${uploadedFileName || "Pipe File"}` : "Live Pipe Camera"})
              </h2>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setShowBoxes(!showBoxes)}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                  showBoxes ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-slate-500"
                }`}
              >
                {showBoxes ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>Bounding Boxes</span>
              </button>

              {inputMode === "camera" && (
                <button
                  onClick={() => setIsMirrored(!isMirrored)}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                    isMirrored ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-slate-500"
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>Mirror View</span>
                </button>
              )}
            </div>
          </div>

          {/* Viewport Box */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center min-h-[320px]">
            {/* Upper-Left LIVE & AI Scanning Indicator */}
            {isInputActive && (
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-md">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-100 font-mono">LIVE SCAN</span>
                <span className="text-[10px] text-cyan-400 font-medium pl-1 border-l border-slate-700 animate-pulse">
                  Analyzing pipe frames & safety...
                </span>
              </div>
            )}

            {/* Hidden HTML5 Video & Image Sources */}
            <video ref={videoRef} autoPlay playsInline muted className="hidden" />
            {uploadedImageSrc && (
              <img
                ref={imageRef}
                src={uploadedImageSrc}
                alt="Uploaded pipe inspection"
                className="hidden"
                crossOrigin="anonymous"
              />
            )}

            {/* Main Canvas Overlay */}
            <canvas ref={canvasRef} className="w-full h-full object-contain" />

            {/* No Input Overlay - Camera */}
            {!activeStream && inputMode === "camera" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/95 z-20">
                <Camera className="w-16 h-16 text-slate-700 mb-3" />
                <h3 className="text-base font-bold text-slate-300">LIVE PIPE CAMERA NOT CONNECTED</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Click <strong>"Start Live Camera"</strong> below to connect your webcam feed or click <strong>"Upload Pipe Image"</strong> to scan a photo.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                  <button
                    onClick={handleSelectLiveCamera}
                    disabled={isConnectingCam}
                    className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-2"
                  >
                    {isConnectingCam ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    <span>Start Live Camera</span>
                  </button>

                  <label className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition border border-slate-700 cursor-pointer flex items-center gap-2">
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Upload Pipe Image</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/jpg"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* No Input Overlay - Image */}
            {!uploadedImageSrc && inputMode === "image" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/95 z-20">
                <FileImage className="w-16 h-16 text-slate-700 mb-3" />
                <h3 className="text-base font-bold text-slate-300">NO PIPE IMAGE UPLOADED YET</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Please select a JPG, JPEG, or PNG pipe image file from your computer to run computer vision inspection.
                </p>
                <label className="mt-4 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span>Select Pipe Image (JPG / PNG)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Action Bar & Evidence Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
            <div className="text-slate-400 flex items-center gap-2 font-mono">
              <span>Source:</span>
              <span className="text-cyan-400 font-bold">
                {inputMode === "camera" ? (streamSource?.name || "Webcam Input") : (uploadedFileName || "Uploaded Pipe Image")}
              </span>
            </div>

            <button
              onClick={handleCaptureEvidenceAlert}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Capture Photo & Trigger Incident Alert</span>
            </button>
          </div>
        </div>

        {/* Right 1 Col: "WHAT AI IS DETECTING" Panel */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 space-y-4 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 tracking-tight uppercase">
                <Activity className="w-4 h-4 text-cyan-400" />
                WHAT AI IS DETECTING
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                Real-time objects detected in the current camera frame
              </p>
            </div>

            {/* Dedicated Pipe Leakage Module Status Card */}
            <div
              className={`p-3 rounded-xl border transition-all flex items-center justify-between font-mono text-xs ${
                leakageResult?.detected
                  ? "bg-red-950/80 border-red-500/60 text-red-200 shadow-lg shadow-red-950/50 animate-pulse"
                  : "bg-slate-950/40 border-slate-800/40 text-slate-400"
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <Droplets className={`w-4 h-4 ${leakageResult?.detected ? "text-red-400 animate-bounce" : "text-cyan-400"}`} />
                  <span>💧 Visible Pipe Leakage</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>Detected: <strong className={leakageResult?.detected ? "text-red-400 font-bold" : "text-slate-400"}>{leakageResult?.detected ? "YES" : "NO"}</strong></span>
                  {leakageResult?.detected && (
                    <span>Confidence: <strong className="text-red-400">{Math.round((leakageResult.confidence || 0.94) * 100)}%</strong></span>
                  )}
                </div>
              </div>

              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                  leakageResult?.detected
                    ? "bg-red-500/20 text-red-300 border border-red-500/40"
                    : "bg-slate-800/40 text-slate-500 border border-slate-700/30"
                }`}
              >
                {leakageResult?.detected ? "LEAK DETECTED" : "NO LEAK"}
              </span>
            </div>

            {/* Model Predictions Breakdown */}
            {!detectionSummary.validPredictions || detectionSummary.validPredictions.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 text-center space-y-1.5 py-6">
                <EyeOff className="w-5 h-5 text-slate-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">
                  No objects detected in current frame
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  COCO-SSD model active • Scanning feed...
                </p>
              </div>
            ) : (
              <div className="space-y-2 font-mono text-xs max-h-[340px] overflow-y-auto pr-1">
                {(detectionSummary.displayCards || []).map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                      item.count > 0
                        ? "bg-slate-950 border-cyan-500/30 shadow-2xs"
                        : "bg-slate-950/40 border-slate-800/40 opacity-50"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-semibold text-slate-200 text-xs">
                        <span className="text-sm">{item.icon}</span>
                        <span>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span>Detected: <strong className={item.count > 0 ? "text-cyan-300" : "text-slate-400"}>{item.count}</strong></span>
                        {item.count > 0 && item.confidence > 0 && (
                          <span>Confidence: <strong className="text-emerald-400">{item.confidence}%</strong></span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        item.count > 0
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          : "bg-slate-800/40 text-slate-500 border border-slate-700/30"
                      }`}
                    >
                      {item.count > 0 ? `Detected: ${item.count}` : "Detected: 0"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel Footer: Metadata & Real-time Metrics */}
          <div className="pt-4 border-t border-slate-800 space-y-3 font-mono">
            {/* Model Info Grid */}
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-500 uppercase block font-semibold tracking-wider text-[9px]">MODEL</span>
                <span className="text-slate-200 font-bold text-xs mt-0.5 block">COCO-SSD</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-500 uppercase block font-semibold tracking-wider text-[9px]">SOURCE</span>
                <span className="text-cyan-400 font-bold text-xs mt-0.5 block truncate">
                  {inputMode === "image" ? "UPLOADED IMAGE" : "LIVE CAMERA"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-500 uppercase block font-semibold tracking-wider text-[9px]">STATUS</span>
                <span className={`font-bold text-xs mt-0.5 flex items-center gap-1 truncate ${isModelReady ? "text-emerald-400" : "text-red-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isModelReady ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                  {isModelReady ? "🟢 ACTIVE" : "🔴 OFFLINE"}
                </span>
              </div>
            </div>

            {/* Real-Time Live Counters */}
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Objects Detected</span>
                <span className="text-sm font-bold text-cyan-400 mt-0.5 block">
                  {detectionSummary.totalObjectsDetected || 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Persons Detected</span>
                <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                  {detectionSummary.personsDetected || 0}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <span className="text-slate-400 block text-[9px] uppercase tracking-wider">Frames Analyzed</span>
                <span className="text-sm font-bold text-amber-400 mt-0.5 block">
                  {framesAnalyzedCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. INSPECTION RESULT CARD & SUMMARY METRICS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Inspection Result Card */}
        <div className="lg:col-span-2 space-y-4">
          <div className={`p-5 rounded-2xl border ${safetyResult.bg} ${safetyResult.border} ${safetyResult.text} shadow-xl space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">
                PIPE INSPECTION VERDICT RESULT
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-950/80 border border-slate-800">
                {safetyResult.status}
              </span>
            </div>
            <h2 className="text-base font-bold tracking-tight">{safetyResult.title}</h2>
            <p className="text-xs text-slate-300">{safetyResult.sub}</p>
          </div>

          {/* Real Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Personnel</span>
              <div className="mt-1 text-sm font-bold text-emerald-400">{personCount}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Objects</span>
              <div className="mt-1 text-sm font-bold text-cyan-400">{detectionSummary.rawPredictionsCount}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Safety Events</span>
              <div className="mt-1 text-sm font-bold text-amber-400">{activeUnresolvedAlerts + activePersonnelAlerts}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Phones</span>
              <div className="mt-1 text-sm font-bold text-amber-400">{detectionSummary.objectCounts.phone}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Frames Analyzed</span>
              <div className="mt-1 text-sm font-bold text-slate-100">{framesAnalyzedCount}</div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Quick Configuration info */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-xs space-y-3 shadow-xl">
          <h3 className="font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Detection Threshold Controls
          </h3>

          <div className="space-y-3 font-mono text-[11px]">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Min Confidence:</span>
                <span className="text-cyan-400 font-bold">{Math.round(config.minConfidence * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={config.minConfidence}
                onChange={(e) => setConfig({ ...config, minConfidence: parseFloat(e.target.value) || 0.35 })}
                className="w-full accent-cyan-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Phone Threshold:</span>
                <span className="text-amber-400 font-bold">{Math.round(config.phoneThreshold * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.50"
                step="0.05"
                value={config.phoneThreshold}
                onChange={(e) => setConfig({ ...config, phoneThreshold: parseFloat(e.target.value) || 0.15 })}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 6. EXPANDABLE "DETECTION DETAILS" TABLE SECTION */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-200 space-y-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 font-bold text-slate-100 text-sm hover:text-cyan-400 transition"
          >
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Detection Details & Active Spatial Bounds ({detectionSummary.detectionsDetailedList.length})</span>
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <span className="text-[10px] text-slate-500 font-mono">
            {showDetails ? "Click to collapse" : "Click to expand"}
          </span>
        </div>

        {showDetails && (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                  <th className="py-2.5 px-3">Object</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3">Track ID</th>
                  <th className="py-2.5 px-3">Spatial BBox [X, Y, W, H]</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {detectionSummary.detectionsDetailedList.length > 0 ? (
                  detectionSummary.detectionsDetailedList.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-950/60 transition">
                      <td className="py-2.5 px-3 font-bold text-slate-200 capitalize flex items-center gap-2">
                        {item.class === "person" ? (
                          <Users className="w-3.5 h-3.5 text-cyan-400" />
                        ) : item.class === "cell phone" ? (
                          <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Box className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>{item.class}</span>
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400 font-bold">
                        {Math.round(item.score * 100)}%
                      </td>
                      <td className="py-2.5 px-3 text-cyan-400 font-bold">
                        {item.trackId || "N/A"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                        [{item.bbox.map((n) => Math.round(n)).join(", ")}]
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            item.status === "TRACKING"
                              ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                        {item.timestamp}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                      No detections in current pipe frame or image.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
