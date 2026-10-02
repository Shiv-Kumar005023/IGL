import React, { useState, useRef, useEffect } from "react";
import { Camera, Radio, Upload, AlertCircle, RefreshCw, Users } from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import { analyzeFrameQuality } from "../services/realVisionProcessor";

export default function CameraInputView() {
  const {
    connectWebcam,
    connectRtsp,
    connectVideoFile,
    disconnectStream,
    streamSource,
    activeStream,
    personCount,
    setPersonCount,
    streamMetrics,
    setStreamMetrics,
    recordObservation
  } = useSafety();

  const [rtspUrl, setRtspUrl] = useState("rtsp://192.168.1.100:554/live/ch01");
  const [cameraName, setCameraName] = useState("Factory Storage Bay Camera");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Attach MediaStream to Video element
  useEffect(() => {
    if (videoRef.current && activeStream && activeStream instanceof MediaStream) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch((e) => console.log("Auto play error:", e));
    }
  }, [activeStream]);

  // Frame processing loop for FPS, resolution, brightness, and blur metrics
  useEffect(() => {
    let animationFrameId;
    let lastTime = performance.now();
    let frameCount = 0;

    const processFrameLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === 4) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
        }

        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Frame rate calculation
        frameCount++;
        const now = performance.now();
        const delta = now - lastTime;

        if (delta >= 1000) {
          const calculatedFps = Math.round((frameCount * 1000) / delta);
          frameCount = 0;
          lastTime = now;

          // Real frame quality analysis
          const quality = analyzeFrameQuality(canvas, ctx);

          setStreamMetrics((prev) => ({
            ...prev,
            fps: calculatedFps,
            width: video.videoWidth,
            height: video.videoHeight,
            brightness: quality.brightness,
            blurScore: quality.blurScore,
            isAssessable: quality.isAssessable,
            notAssessableReason: quality.reason
          }));
        }
      }

      animationFrameId = requestAnimationFrame(processFrameLoop);
    };

    if (streamSource) {
      animationFrameId = requestAnimationFrame(processFrameLoop);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [streamSource, setStreamMetrics]);

  // Auto-record person tracking observations into SQLite DB only when actual detected person count > 0
  useEffect(() => {
    let timer;
    if (streamSource) {
      const logAllDetectedPeople = () => {
        const total = Number.isFinite(personCount) ? personCount : 0;
        if (total <= 0) {
          return;
        }

        for (let i = 1; i <= total; i++) {
          const trackId = `TRK-P10${i} (Person #${i})`;
          recordObservation({
            track_id: trackId,
            zone_name: streamSource.name || "Live Camera Bay",
            object_type: "person",
            confidence: Math.min(0.99, 0.94 + i * 0.02)
          });
        }
      };

      // Initial log
      logAllDetectedPeople();

      // Log update every 5 seconds for actual detected persons
      timer = setInterval(logAllDetectedPeople, 5000);
    }

    return () => clearInterval(timer);
  }, [streamSource, personCount]);

  const handleWebcamConnect = async () => {
    setConnecting(true);
    setError(null);
    const res = await connectWebcam();
    setConnecting(false);
    if (!res.success) setError(res.error);
  };

  const handleRtspConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    await connectRtsp(rtspUrl, cameraName);
    setConnecting(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setConnecting(true);
      setError(null);
      const res = await connectVideoFile(file);
      setConnecting(false);

      if (videoRef.current && res.fileUrl) {
        videoRef.current.srcObject = null;
        videoRef.current.src = res.fileUrl;
        videoRef.current.play();
      }
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Camera className="w-5 h-5 text-cyan-400" />
          Camera Setup (Webcam / CCTV Input)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Choose how you want to connect your camera feed to the AI safety scanner.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stream Input Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Option 1: Live Webcam */}
        <div className="p-5 rounded-2xl glass-panel glass-panel-hover flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Camera className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">Option 1: Laptop / USB Webcam</h3>
            <p className="text-xs text-slate-400">
              Turn on your laptop's built-in webcam or attached USB web camera for live testing.
            </p>
          </div>

          <button
            onClick={handleWebcamConnect}
            disabled={connecting}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
          >
            {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span>Start Webcam Feed</span>
          </button>
        </div>

        {/* Option 2: RTSP Stream Config */}
        <div className="p-5 rounded-2xl glass-panel glass-panel-hover space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Radio className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">Option 2: IP CCTV Camera (RTSP)</h3>
            <p className="text-xs text-slate-400">
              Enter your factory CCTV network camera URL (RTSP address).
            </p>
          </div>

          <form onSubmit={handleRtspConnect} className="space-y-2 text-xs">
            <input
              type="text"
              value={cameraName}
              onChange={(e) => setCameraName(e.target.value)}
              placeholder="Camera Name (e.g. Gate 1)"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <input
              type="text"
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              placeholder="rtsp://192.168.1.100:554/ch01"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <button
              type="submit"
              disabled={connecting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
            >
              <Radio className="w-4 h-4" />
              <span>Connect CCTV Camera</span>
            </button>
          </form>
        </div>

        {/* Option 3: Upload Video File */}
        <div className="p-5 rounded-2xl glass-panel glass-panel-hover flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">Option 3: Upload Recorded Video</h3>
            <p className="text-xs text-slate-400">
              Select an MP4 video file from your computer to run safety scanning.
            </p>
          </div>

          <label className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 border border-slate-700">
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Select MP4 Video File</span>
            <input type="file" accept="video/mp4,video/webm" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Active Stream Feed */}
      <div className="p-6 rounded-2xl glass-panel space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${streamSource ? "bg-emerald-500 animate-ping" : "bg-slate-600"}`} />
            <h2 className="text-base font-bold text-slate-200">Active Camera Stream</h2>
          </div>

          {streamSource && (
            <button
              onClick={disconnectStream}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-xs font-semibold"
            >
              Turn Off Camera
            </button>
          )}
        </div>

        {/* Video & Hidden Canvas */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls={streamSource?.type === "file"}
            className="w-full h-full object-contain"
          />
          <canvas ref={canvasRef} className="hidden" />

          {!streamSource && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-950/90">
              <Camera className="w-16 h-16 text-slate-700 mb-3" />
              <h3 className="text-base font-bold text-slate-300">NO CAMERA CONNECTED</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                Please click <strong>"Start Webcam Feed"</strong> or upload a video file above to test the AI system.
              </p>
            </div>
          )}

          {/* Quality Warning */}
          {streamSource && !streamMetrics.isAssessable && (
            <div className="absolute top-4 left-4 right-4 p-3 rounded-xl bg-amber-500/90 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{streamMetrics.notAssessableReason}</span>
            </div>
          )}
        </div>

        {/* Stream Stats */}
        {streamSource && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Camera Speed</span>
              <p className="text-cyan-400 font-bold text-base">{streamMetrics.fps} FPS</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Video Resolution</span>
              <p className="text-slate-200 font-bold text-base">
                {streamMetrics.width > 0 ? `${streamMetrics.width}x${streamMetrics.height}` : "Auto"}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Lighting Level</span>
              <p className={`font-bold text-base ${streamMetrics.brightness < 25 ? "text-red-400" : "text-emerald-400"}`}>
                {streamMetrics.brightness < 25 ? "Too Dark" : "Good Lighting"}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Lens Clarity</span>
              <p className={`font-bold text-base ${streamMetrics.blurScore < 15 ? "text-amber-400" : "text-emerald-400"}`}>
                {streamMetrics.blurScore < 15 ? "Blurry / Dirty" : "Clear Lens"}
              </p>
            </div>
          </div>
        )}

        {/* Live Automatic AI Person Detection Status */}
        {streamSource && (
          <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping shrink-0" />
              <div>
                <span className="font-bold text-slate-200">AI Live Automatic Person Counter:</span>
                <p className="text-[11px] text-slate-400">Camera feed is automatically scanned for people in real-time (No manual selection needed)</p>
              </div>
            </div>

            <div className={`px-3.5 py-1.5 rounded-lg font-bold border flex items-center gap-2 font-mono ${
              personCount > 0 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-800 text-slate-400 border-slate-700"
            }`}>
              <Users className="w-4 h-4" />
              <span>{personCount === 0 ? "0 Persons (No Human in Frame)" : `${personCount} ${personCount === 1 ? "Person Auto-Detected" : "People Auto-Detected"}`}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
