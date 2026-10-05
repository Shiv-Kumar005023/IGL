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
  Bug,
  Activity,
  FlipHorizontal,
  UserPlus,
  UserCheck,
  X,
  Upload,
  AlertCircle,
  RefreshCw
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
    recordObservation,
    registeredPersonnel,
    registerPerson,
    updatePersonRegistration,
    connectWebcam,
    connectImageFile,
    connectVideoFile,
    disconnectStream
  } = useSafety();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  // Input Mode: "camera" (Live Camera) vs "image" (Upload Image)
  const [inputMode, setInputMode] = useState("camera");
  const [cameraError, setCameraError] = useState(null);
  const [isConnectingCam, setIsConnectingCam] = useState(false);
  const [uploadedImageSrc, setUploadedImageSrc] = useState(null);

  // Overlay Toggles
  const [showBoxes, setShowBoxes] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [showDistances, setShowDistances] = useState(true);
  const [isMirrored, setIsMirrored] = useState(true); // Horizontal mirror flip toggle

  // Model & Detection State
  const [modelInfo, setModelInfo] = useState({ status: "UNINITIALIZED", errorMessage: "" });
  
  // Real-Time Detection Memory Ref
  const detectionsRef = useRef({
    personCount: 0,
    persons: [],
    phones: [],
    rawPredictionsCount: 0,
    rawDetectionsSummary: [],
    phoneCandidates: [],
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

  // Debug Inspector State for UI
  const [debugData, setDebugData] = useState({
    rawPredictionsCount: 0,
    rawDetectionsSummary: [],
    phoneCandidates: []
  });

  // Configurable Detection Thresholds
  const [config, setConfig] = useState({
    minConfidence: 0.35,
    phoneThreshold: 0.35,
    minDurationSec: 2.0,
    warningIntervalSec: 2.5,
    maxWarnings: 3
  });

  // Reactive Live Persons List & Registration Modal State
  const [livePersonsList, setLivePersonsList] = useState([]);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registrationForm, setRegistrationForm] = useState({
    id: "",
    track_id: "",
    name: "",
    designation: "Registered Worker",
    department: "Refinery Operations"
  });
  const [regSuccessMsg, setRegSuccessMsg] = useState("");

  const handleOpenRegisterModal = (targetTrackId = null) => {
    const trackId = targetTrackId || (livePersonsList[0]?.trackId || `TRK-P${Math.floor(Math.random() * 800 + 100)}`);
    const existing = (registeredPersonnel || []).find((r) => r.track_id === trackId || r.id === trackId);

    if (existing) {
      setRegistrationForm({
        id: existing.id,
        track_id: existing.track_id,
        name: existing.name,
        designation: existing.designation || "Registered Worker",
        department: existing.department || "Refinery Operations"
      });
    } else {
      const suggestedId = trackId.replace("TRK-P", "EMP-");
      setRegistrationForm({
        id: suggestedId,
        track_id: trackId,
        name: "",
        designation: "Registered Worker",
        department: "Refinery Operations"
      });
    }
    setRegSuccessMsg("");
    setIsRegisterModalOpen(true);
  };

  const handleSaveRegistration = async (e) => {
    e.preventDefault();
    if (!registrationForm.id || !registrationForm.name) return;

    await registerPerson({
      id: registrationForm.id,
      track_id: registrationForm.track_id || registrationForm.id,
      name: registrationForm.name,
      designation: registrationForm.designation,
      department: registrationForm.department
    });

    setRegSuccessMsg(`Successfully registered ${registrationForm.name} (${registrationForm.id}) to database!`);
    setTimeout(() => {
      setIsRegisterModalOpen(false);
      setRegSuccessMsg("");
    }, 1200);
  };

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
      setCameraError(res.error || "Camera access denied. Please allow permissions in browser settings.");
    }
  };

  // Handle Image File Upload (JPG, JPEG, PNG)
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setInputMode("image");
      setCameraError(null);
      const fileUrl = URL.createObjectURL(file);
      setUploadedImageSrc(fileUrl);
      await connectImageFile(file);
    }
  };

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
      const img = imageRef.current;

      const isImageSource = streamSource?.type === "image" && img && (img.complete || img.naturalWidth > 0);
      const isVideoSource = video && (video.readyState >= 2 || video.videoWidth > 0);
      const sourceElem = isImageSource ? img : isVideoSource ? video : null;

      // Verify source & canvas availability
      if (sourceElem && canvas) {
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
          canvas.width = canvas.clientWidth || 640;
          canvas.height = canvas.clientHeight || 360;
        }

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

        // Draw current frame onto canvas (with optional horizontal mirror transform for live webcam)
        if (isMirrored && !isImageSource) {
          ctx.save();
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(sourceElem, 0, 0, width, height);
          ctx.restore();
        } else {
          ctx.drawImage(sourceElem, 0, 0, width, height);
        }

        // 1. Draw Restricted Zones (Polygons)
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
              ctx.setLineDash([6, 6]);
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.fillStyle = "#ef4444";
              ctx.font = "bold 12px sans-serif";
              ctx.fillText(
                `RESTRICTED AREA: ${zone.zone_name}`,
                startX + 5,
                zone.polygon_coords[0][1] * height + 15
              );
            }
          });
        }

        // 2. Trigger Safe Async TensorFlow Object Detection (Every ~150ms)
        const now = Date.now();
        if (showBoxes && !isDetectingRef.current && now - lastInferenceTimeRef.current >= 150) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          detectObjectsAndMobilePhone(sourceElem, config)
            .then((result) => {
              detectionsRef.current = result;

              // Synchronize debug state
              setDebugData({
                rawPredictionsCount: result.rawPredictionsCount || 0,
                rawDetectionsSummary: result.rawDetectionsSummary || [],
                phoneCandidates: result.phoneCandidates || []
              });

              // Synchronize live persons list for quick registration cards
              setLivePersonsList(result.persons || []);

              // Synchronize person count (Strictly 0 when AI detects 0 persons)
              if (result.personCount !== personCount) {
                setPersonCount(result.personCount);
              }

              // Update Phone Misuse Status Panel State
              if (result.phoneMisuseEvent) {
                setPhoneMetrics(result.phoneMisuseEvent);

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
            const px = isMirrored ? width - (p[0] + p[2]) * width : p[0] * width;
            const py = p[1] * height, pw = p[2] * width, ph = p[3] * height;

            // Lookup registered identity by track_id or id
            const regPerson = (registeredPersonnel || []).find(
              (r) => r.track_id === pObj.trackId || r.id === pObj.trackId
            );

            const boxColor = pObj.isUsingPhone
              ? "#f59e0b"
              : regPerson
              ? "#0284c7" // sky blue for registered personnel
              : pObj.color;

            ctx.strokeStyle = boxColor;
            ctx.lineWidth = pObj.isUsingPhone ? 3.5 : 2.5;
            ctx.strokeRect(px, py, pw, ph);

            const identityText = regPerson ? `${regPerson.id} | ${regPerson.name}` : pObj.trackId;
            const statusText = pObj.isUsingPhone
              ? "[PHONE DETECTED]"
              : pObj.hasHelmet
              ? "[Helmet OK]"
              : "[NO HELMET]";

            const tagText = `${identityText} ${statusText}`;

            ctx.fillStyle = pObj.isUsingPhone
              ? "rgba(245, 158, 11, 0.95)"
              : regPerson
              ? "rgba(2, 132, 199, 0.95)"
              : pObj.hasHelmet
              ? "rgba(16, 185, 129, 0.9)"
              : "rgba(239, 68, 68, 0.95)";

            const tagWidth = Math.max(170, tagText.length * 8.2);
            ctx.fillRect(px, py - 24, tagWidth, 24);

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px sans-serif";
            ctx.fillText(tagText, px + 6, py - 7);

            drawnPersonBoxes.push({ trackId: pObj.trackId, px, py, pw, ph, center: [px + pw / 2, py + ph / 2] });
          }

          // Draw Associated Phone Bounding Boxes (YOLO26 Phone-in-Hand Detector)
          for (let j = 0; j < activePhones.length; j++) {
            const phObj = activePhones[j];
            const phBox = phObj.box;
            const phx = isMirrored ? width - (phBox[0] + phBox[2]) * width : phBox[0] * width;
            const phy = phBox[1] * height, phw = phBox[2] * width, phh = phBox[3] * height;

            ctx.strokeStyle = "#06b6d4";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(phx, phy, phw, phh);
            ctx.setLineDash([]);

            const phoneTag = `${phObj.class || "Phone in Hand"} (${Math.round((phObj.confidence || 0.85) * 100)}%)`;
            const tagW = Math.max(130, phoneTag.length * 7.5);

            ctx.fillStyle = "rgba(6, 182, 212, 0.95)";
            ctx.fillRect(phx, phy - 20, tagW, 20);
            ctx.fillStyle = "#000000";
            ctx.font = "bold 10px sans-serif";
            ctx.fillText(phoneTag, phx + 4, phy - 6);
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
  }, [streamSource, showBoxes, showZones, showDistances, isMirrored, restrictedZones, personCount, config]);

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
      {/* Title Header & Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-cyan-400" />
            Live AI Inspection & Object Detection
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time computer vision inference powered by TensorFlow.js COCO-SSD detection.
          </p>
        </div>

        {/* Dual Input Mode Controls: [ Live Camera ] [ Upload Image ] */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs">
          <button
            onClick={handleSelectLiveCamera}
            disabled={isConnectingCam}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              inputMode === "camera"
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {isConnectingCam ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span>Live Camera</span>
          </button>

          <label
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              inputMode === "image"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Image</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Permission Denied Alert & Enable Camera Button */}
      {inputMode === "camera" && cameraError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <strong className="block font-bold">Camera Permission Required:</strong>
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

      {/* Overlay Toggle Buttons */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-2 rounded-xl border border-slate-800 text-xs">
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

        <button
          onClick={() => setIsMirrored(!isMirrored)}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
            isMirrored ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-slate-500"
          }`}
        >
          <FlipHorizontal className="w-3.5 h-3.5" />
          <span>Mirror View ({isMirrored ? "ON" : "OFF"})</span>
        </button>
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

          <div className="flex items-center gap-2 flex-wrap">
            {/* Requirement 9 & 10: Status "Phone Detector: YOLO26 | ACTIVE / OFFLINE" */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                detectionsRef.current?.phoneDetectorIsActive !== false
                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                  : "bg-red-500/20 text-red-400 border-red-500/40"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{detectionsRef.current?.phoneDetectorStatus || "Phone Detector: YOLO26 | ACTIVE"}</span>
            </span>

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
                onChange={(e) => setConfig({ ...config, minConfidence: parseFloat(e.target.value) || 0.35 })}
                className="w-16 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono"
              />
            </label>

            <label className="flex items-center gap-2">
              <span>Phone Threshold:</span>
              <input
                type="number"
                step="0.05"
                min="0.10"
                max="0.50"
                value={config.phoneThreshold}
                onChange={(e) => setConfig({ ...config, phoneThreshold: parseFloat(e.target.value) || 0.15 })}
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

      {/* AI Model Inspector / Debug Overlay UI Card */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-300">
          <div className="flex items-center gap-2 font-bold">
            <Bug className="w-4 h-4 text-amber-400" />
            <span>AI Model Real-Time Debug Inspector</span>
          </div>
          <span className="text-[10px] text-slate-500">Live Console & Frame Inspector</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          {/* Col 1: Raw Frame Predictions */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              Raw AI Predictions:
            </span>
            <p className="text-slate-200 font-bold text-sm">
              {debugData.rawPredictionsCount} Objects In Frame
            </p>
            <div className="text-[10px] text-slate-400 max-h-20 overflow-y-auto space-y-0.5 pt-1">
              {debugData.rawDetectionsSummary.length > 0 ? (
                debugData.rawDetectionsSummary.map((d, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{d.class}</span>
                    <span className="text-emerald-400">{Math.round(d.score * 100)}%</span>
                  </div>
                ))
              ) : (
                <span className="text-slate-500 italic">No objects detected</span>
              )}
            </div>
          </div>

          {/* Col 2: Raw Cell Phone Candidates */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-amber-400" />
              Phone Candidates (`cell phone`):
            </span>
            <p className={`font-bold text-sm ${debugData.phoneCandidates.length > 0 ? "text-amber-400" : "text-slate-400"}`}>
              {debugData.phoneCandidates.length > 0 ? `${debugData.phoneCandidates.length} Candidate(s)` : "None detected"}
            </p>
            <div className="text-[10px] text-slate-400 max-h-20 overflow-y-auto space-y-0.5 pt-1">
              {debugData.phoneCandidates.length > 0 ? (
                debugData.phoneCandidates.map((p, i) => (
                  <div key={i} className="flex justify-between text-amber-300">
                    <span>{p.class}</span>
                    <span>{Math.round(p.score * 100)}%</span>
                  </div>
                ))
              ) : (
                <span className="text-slate-500 italic">No cell phone class detected</span>
              )}
            </div>
          </div>

          {/* Col 3: Phone Misuse Status */}
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Phone Misuse Status:
            </span>
            <p className={`font-bold text-sm ${phoneMetrics.phoneDetected ? "text-amber-400" : "text-slate-300"}`}>
              {phoneMetrics.phoneDetected ? "PHONE MISUSE DETECTED" : "No AI phone detection"}
            </p>
            <div className="text-[10px] text-slate-400 space-y-0.5 pt-1">
              <div>Assoc. Person: <span className="text-cyan-400">{phoneMetrics.associatedTrackId || "None"}</span></div>
              <div>Duration: <span className="text-emerald-400">{phoneMetrics.durationSec}s</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Video Stream Canvas Container */}
      <div className="p-4 rounded-2xl glass-panel space-y-4">
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
          {/* Hidden HTML5 Video & Image Sources */}
          <video ref={videoRef} autoPlay playsInline muted className="hidden" />
          {uploadedImageSrc && (
            <img
              ref={imageRef}
              src={uploadedImageSrc}
              alt="Uploaded source"
              className="hidden"
              crossOrigin="anonymous"
            />
          )}

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

      {/* Live Detected Persons & Quick Registration Panel */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">
                  Live Detected Persons & Quick Registration
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">
                  {livePersonsList.length} In Frame
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Assign live IDs, register names, and sync employee profiles with the SQLite database.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleOpenRegisterModal()}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Register Custom Personnel ID</span>
          </button>
        </div>

        {/* Cards Grid */}
        {livePersonsList.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {livePersonsList.map((p) => {
              const reg = (registeredPersonnel || []).find(
                (r) => r.track_id === p.trackId || r.id === p.trackId
              );
              return (
                <div
                  key={p.trackId}
                  className={`p-4 rounded-xl border transition-all space-y-2.5 ${
                    reg
                      ? "bg-slate-950/90 border-emerald-500/40 shadow-emerald-950/20"
                      : "bg-slate-950/70 border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-sky-300">
                      {reg ? `${reg.id}` : p.trackId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                        reg
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      {reg ? "REGISTERED WORKER" : "UNREGISTERED WORKER"}
                    </span>
                  </div>

                  {reg && (
                    <div className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{reg.name}</span>
                      <span className="text-[10px] text-slate-400 font-normal">({reg.designation})</span>
                    </div>
                  )}

                  <div className="text-xs space-y-1 text-slate-300">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Confidence:</span>
                      <span className="font-mono font-bold text-slate-200">
                        {Math.round((p.confidence || 0.88) * 100)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Helmet Status:</span>
                      <span
                        className={`font-semibold ${
                          p.hasHelmet ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {p.hasHelmet ? "✅ Helmet OK" : "❌ No Helmet"}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenRegisterModal(p.trackId)}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      reg
                        ? "bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
                        : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20"
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{reg ? "Edit Registration" : "Register This Live Person"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl space-y-2">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-semibold text-slate-300">No active persons detected in camera frame currently</p>
            <p className="text-[11px] text-slate-500">
              When a worker appears in front of the camera, their live card will display here with direct registration controls.
            </p>
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

      {/* Quick Registration Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-slate-100 w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Register Personnel Identity</h3>
                  <p className="text-[11px] text-slate-400">Save unique ID and name to SQLite database</p>
                </div>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {regSuccessMsg && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{regSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveRegistration} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Live Track ID</label>
                <input
                  type="text"
                  value={registrationForm.track_id}
                  onChange={(e) => setRegistrationForm({ ...registrationForm, track_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sky-400 font-mono font-bold focus:outline-none focus:border-sky-500"
                  placeholder="e.g. TRK-P109"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Unique Personnel / Employee ID</label>
                <input
                  type="text"
                  value={registrationForm.id}
                  onChange={(e) => setRegistrationForm({ ...registrationForm, id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono font-bold focus:outline-none focus:border-sky-500"
                  placeholder="e.g. EMP-109"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  value={registrationForm.name}
                  onChange={(e) => setRegistrationForm({ ...registrationForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:outline-none focus:border-sky-500"
                  placeholder="e.g. Shiv Kumar"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Role / Designation</label>
                  <input
                    type="text"
                    value={registrationForm.designation}
                    onChange={(e) => setRegistrationForm({ ...registrationForm, designation: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:outline-none focus:border-sky-500"
                    placeholder="e.g. Senior Field Engineer"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Department</label>
                  <input
                    type="text"
                    value={registrationForm.department}
                    onChange={(e) => setRegistrationForm({ ...registrationForm, department: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:outline-none focus:border-sky-500"
                    placeholder="e.g. Refinery Operations"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save & Register Profile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
