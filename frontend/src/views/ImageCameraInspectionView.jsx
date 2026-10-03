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
  Bug,
  FileImage,
  Sparkles
} from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import {
  captureCanvasSnapshot,
  detectObjectsAndMobilePhone,
  loadDetectionModel,
  getModelStatus
} from "../services/realVisionProcessor";

export default function ImageCameraInspectionView() {
  const {
    activeStream,
    streamSource,
    personCount,
    setPersonCount,
    streamMetrics,
    restrictedZones,
    dispatchAlert,
    connectWebcam,
    connectImageFile,
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
  const [uploadedFileName, setUploadedFileName] = useState("");

  // Overlay Toggles
  const [showBoxes, setShowBoxes] = useState(true);
  const [showZones, setShowZones] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);

  // Model & Detection State
  const [modelInfo, setModelInfo] = useState({ status: "UNINITIALIZED", errorMessage: "" });

  // Detection Memory & Metrics
  const isDetectingRef = useRef(false);
  const lastInferenceTimeRef = useRef(0);

  const [detectionSummary, setDetectionSummary] = useState({
    rawPredictionsCount: 0,
    rawDetectionsSummary: [],
    persons: [],
    phones: []
  });

  // Configurable Detection Thresholds
  const [config, setConfig] = useState({
    minConfidence: 0.35,
    phoneThreshold: 0.15,
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

  // Attach Stream to Hidden Video Element when in Camera Mode
  useEffect(() => {
    if (videoRef.current && activeStream && activeStream instanceof MediaStream) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch((e) => console.log("Video playback error:", e));
    }
  }, [activeStream]);

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
    const file = e.target.files[0];
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

      if (sourceElem && canvas) {
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
          canvas.width = canvas.clientWidth || 640;
          canvas.height = canvas.clientHeight || 360;
        }

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

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

        // Trigger Async TensorFlow Object Detection (~150ms)
        const now = Date.now();
        if (showBoxes && !isDetectingRef.current && now - lastInferenceTimeRef.current >= 150) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          detectObjectsAndMobilePhone(sourceElem, config)
            .then((result) => {
              setDetectionSummary({
                rawPredictionsCount: result.rawPredictionsCount || 0,
                rawDetectionsSummary: result.rawDetectionsSummary || [],
                persons: result.persons || [],
                phones: result.phones || []
              });

              if (result.personCount !== personCount) {
                setPersonCount(result.personCount);
              }

              // Draw Bounding Boxes on Canvas
              const currentPersons = result.persons || [];
              currentPersons.forEach((p) => {
                if (p.box) {
                  const bx = p.box[0] * width;
                  const by = p.box[1] * height;
                  const bw = p.box[2] * width;
                  const bh = p.box[3] * height;

                  ctx.strokeStyle = "#06b6d4";
                  ctx.lineWidth = 3;
                  ctx.strokeRect(bx, by, bw, bh);

                  ctx.fillStyle = "rgba(6, 182, 212, 0.9)";
                  ctx.fillRect(bx, Math.max(0, by - 24), Math.max(130, bw * 0.6), 22);

                  ctx.fillStyle = "#ffffff";
                  ctx.font = "bold 12px sans-serif";
                  ctx.fillText(`${p.trackId || "TRK-P"} (Person)`, bx + 6, Math.max(14, by - 8));
                }
              });

              const currentPhones = result.phones || [];
              currentPhones.forEach((ph) => {
                if (ph.box) {
                  const px = ph.box[0] * width;
                  const py = ph.box[1] * height;
                  const pw = ph.box[2] * width;
                  const phh = ph.box[3] * height;

                  ctx.strokeStyle = "#f59e0b";
                  ctx.lineWidth = 3;
                  ctx.strokeRect(px, py, pw, phh);

                  ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
                  ctx.fillRect(px, Math.max(0, py - 22), Math.max(140, pw * 0.8), 20);

                  ctx.fillStyle = "#ffffff";
                  ctx.font = "bold 11px sans-serif";
                  ctx.fillText(`Phone (${Math.round(ph.score * 100)}%)`, px + 6, Math.max(14, py - 7));
                }
              });
            })
            .catch((err) => {
              console.error("AI Object Detection Error:", err);
            })
            .finally(() => {
              isDetectingRef.current = false;
            });
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
    const base64Snap = captureCanvasSnapshot(canvas, "SAFETY INSPECTION EVIDENCE");

    dispatchAlert({
      event_type: "PPE_VIOLATION",
      zone_name: inputMode === "image" ? `Uploaded Image (${uploadedFileName})` : "Live Camera Stream",
      severity: "HIGH",
      confidence: 0.95,
      evidence_image_base64: base64Snap,
      metadata: { source: inputMode, file_name: uploadedFileName, detected_persons: personCount }
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Title Header & Dual Mode Control */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                AI Image & Camera Inspection Scanner
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Independent dual input mode: Real-time Live Camera streaming or Local Image Upload (JPG, JPEG, PNG) via TensorFlow.js AI.
              </p>
            </div>
          </div>
        </div>

        {/* Dual Input Mode Buttons */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs">
          <button
            onClick={handleSelectLiveCamera}
            disabled={isConnectingCam}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              inputMode === "camera"
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {isConnectingCam ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span>Live Camera</span>
          </button>

          <label
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
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

      {/* Live AI Detections Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[11px]">Active Input Mode</span>
              <span className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                {inputMode === "camera" ? "📹 Live Camera Feed" : "🖼️ Local Image Upload"}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[11px]">AI Persons Detected</span>
              <span className="text-sm font-bold text-emerald-400">
                {personCount} {personCount === 1 ? "Person" : "Persons"}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-slate-400 font-semibold block text-[11px]">Total Objects Tracked</span>
              <span className="text-sm font-bold text-amber-400">
                {detectionSummary.rawPredictionsCount} Objects
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Visual Inspection Canvas Viewport */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <h2 className="text-sm font-bold text-slate-100">
              AI Inspection Viewport ({inputMode === "image" ? `Image: ${uploadedFileName || "Local File"}` : "Live Camera Stream"})
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
                <span>Mirror ({isMirrored ? "ON" : "OFF"})</span>
              </button>
            )}
          </div>
        </div>

        {/* Canvas Display */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
          {/* Hidden HTML5 Video Source */}
          <video ref={videoRef} autoPlay playsInline muted className="hidden" />

          {/* Hidden HTML5 Image Source */}
          {uploadedImageSrc && (
            <img
              ref={imageRef}
              src={uploadedImageSrc}
              alt="Uploaded inspection"
              className="hidden"
              crossOrigin="anonymous"
            />
          )}

          {/* Main Inference Canvas */}
          <canvas ref={canvasRef} className="w-full h-full object-contain" />

          {/* No Input Overlay */}
          {!streamSource && inputMode === "camera" && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/95">
              <Camera className="w-16 h-16 text-slate-700 mb-3" />
              <h3 className="text-base font-bold text-slate-300">LIVE CAMERA NOT CONNECTED</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Click <strong>"Live Camera"</strong> above to allow camera access or click <strong>"Upload Image"</strong> to scan a local photo.
              </p>
              <button
                onClick={handleSelectLiveCamera}
                className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-500/20"
              >
                Start Live Camera
              </button>
            </div>
          )}

          {!uploadedImageSrc && inputMode === "image" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/95">
              <FileImage className="w-16 h-16 text-slate-700 mb-3" />
              <h3 className="text-base font-bold text-slate-300">NO IMAGE UPLOADED YET</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Please select a JPG, JPEG, or PNG image from your computer to run computer vision inspection.
              </p>
              <label className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-lg shadow-emerald-500/20 cursor-pointer">
                <span>Select JPG / PNG Image</span>
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

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
          <div className="text-slate-400 flex items-center gap-2 font-mono">
            <span>Input Source:</span>
            <span className="text-slate-200 font-bold">
              {inputMode === "camera" ? (streamSource?.name || "Webcam Input") : (uploadedFileName || "Uploaded Photo")}
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

      {/* AI Detections Log Breakdown */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-200 space-y-3">
        <h3 className="font-bold text-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Real-Time AI Detections & Confidence Log ({detectionSummary.rawPredictionsCount} Objects)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-[11px]">
          {detectionSummary.rawDetectionsSummary.length > 0 ? (
            detectionSummary.rawDetectionsSummary.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
              >
                <span className="font-bold text-slate-200 capitalize">{item.class}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  {Math.round(item.score * 100)}% Conf
                </span>
              </div>
            ))
          ) : (
            <div className="col-span-full p-4 text-center text-slate-500 italic bg-slate-950/50 rounded-xl border border-slate-800">
              No objects detected in current frame/image.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
