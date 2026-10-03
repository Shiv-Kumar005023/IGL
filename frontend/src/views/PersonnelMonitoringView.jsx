import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Clock,
  Calendar,
  Camera,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  Play,
  Pause,
  RefreshCw,
  Eye,
  Sliders,
  Bell,
  ShieldCheck,
  UserCheck,
  UserX,
  Info,
  ChevronRight,
  Video,
  VideoOff
} from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import {
  captureCanvasSnapshot,
  detectObjectsAndMobilePhone,
  loadDetectionModel,
  getModelStatus
} from "../services/realVisionProcessor";

export default function PersonnelMonitoringView() {
  const {
    activeStream,
    streamSource,
    connectWebcam,
    setActiveTab,
    personnelRules,
    personnelEvents,
    addPersonnelRule,
    updatePersonnelRule,
    removePersonnelRule,
    dispatchPersonnelEvent,
    acknowledgePersonnelEvent,
    resolvePersonnelEvent,
    setSelectedEvidence,
    cameras
  } = useSafety();

  // Current system clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Active Selected Camera Name
  const [selectedCamera, setSelectedCamera] = useState("Gate Camera 01");

  // Mode: Live Camera AI Mode vs. Staged Test Simulator
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Save Success Notification Banner
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

  // Live Camera AI Detected Tracks State
  const [liveTracks, setLiveTracks] = useState([]);
  const liveObservedTracksRef = useRef([]);

  // Staged Test simulated person tracks (Track IDs only, NO employee names/identities)
  const [simulatedTracks, setSimulatedTracks] = useState([
    { trackId: "TRK-P101", confidence: 0.96 },
    { trackId: "TRK-P102", confidence: 0.94 },
    { trackId: "TRK-P103", confidence: 0.91 },
    { trackId: "TRK-P104", confidence: 0.95 },
    { trackId: "TRK-P105", confidence: 0.92 }
  ]);

  // Rule Form State (Create / Edit)
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [ruleForm, setRuleForm] = useState({
    schedule_date: "2026-10-02",
    start_time: "00:00",
    end_time: "23:59",
    expected_person_count: 2,
    verification_duration: 10,
    camera_id: "Gate Camera 01",
    area_id: "Main Entry Area"
  });

  // Temporal Verification State
  const [verificationProgress, setVerificationProgress] = useState(0); // 0 to 100%
  const [verifyingSeconds, setVerifyingSeconds] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const lastEventTimeRef = useRef(0); // For alert deduplication / cooldown

  // Canvas & Video Refs for Live AI Mode
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const isDetectingRef = useRef(false);
  const lastInferenceTimeRef = useRef(0);

  // Keep system clock updated
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format HH:MM string from Date
  const currentHHMM = `${String(currentTime.getHours()).padStart(2, "0")}:${String(
    currentTime.getMinutes()
  ).padStart(2, "0")}`;

  // Find active saved rule for current camera from DB context
  const savedRuleForCam = (personnelRules || []).find(
    (r) => r.camera_id === selectedCamera
  ) || personnelRules?.[0];

  // Active Rule derived dynamically from saved DB rule or current form state
  const activeRule = {
    id: editingRuleId || savedRuleForCam?.id || 1,
    camera_id: selectedCamera,
    camera_name: selectedCamera,
    area_id: ruleForm.area_id || savedRuleForCam?.area_id || "Main Entry Area",
    start_time: ruleForm.start_time || savedRuleForCam?.start_time || "00:00",
    end_time: ruleForm.end_time || savedRuleForCam?.end_time || "23:59",
    expected_person_count: Number.isFinite(Number(ruleForm.expected_person_count))
      ? Number(ruleForm.expected_person_count)
      : (savedRuleForCam?.expected_person_count ?? 2),
    verification_duration: Number(ruleForm.verification_duration) || savedRuleForCam?.verification_duration || 10,
    cooldown: 60,
    enabled: true
  };

  // Sync saved DB rule into form state whenever camera selection changes or rules refresh
  useEffect(() => {
    if (personnelRules && personnelRules.length > 0 && !editingRuleId) {
      const r = (personnelRules || []).find(rule => rule.camera_id === selectedCamera) || personnelRules[0];
      if (r) {
        setRuleForm({
          schedule_date: r.schedule_date || "ALL",
          start_time: r.start_time || "00:00",
          end_time: r.end_time || "23:59",
          expected_person_count: r.expected_person_count ?? 2,
          verification_duration: r.verification_duration ?? 10,
          camera_id: r.camera_id || selectedCamera,
          area_id: r.area_id || "Main Entry Area"
        });
      }
    }
  }, [personnelRules, selectedCamera]);

  // Attach Stream to Hidden Video Element
  useEffect(() => {
    if (videoRef.current && activeStream && activeStream instanceof MediaStream) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch((e) => console.log("Video playback error:", e));
    }
  }, [activeStream]);

  // Real-Time Canvas Render Loop & AI Person Detection
  useEffect(() => {
    if (isDemoMode) return;
    let animId;

    const renderLoop = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && (video.readyState >= 2 || video.videoWidth > 0)) {
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
          canvas.width = video.clientWidth || 640;
          canvas.height = video.clientHeight || 360;
        }

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

        // Draw Video Frame onto Canvas
        ctx.drawImage(video, 0, 0, width, height);

        // Run AI Object Detection periodically (~150ms)
        const now = Date.now();
        if (!isDetectingRef.current && now - lastInferenceTimeRef.current >= 150) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          try {
            const res = await detectObjectsAndMobilePhone(video);
            if (res && res.persons) {
              setLiveTracks(res.persons);
              liveObservedTracksRef.current = res.persons;
            } else {
              setLiveTracks([]);
              liveObservedTracksRef.current = [];
            }
          } catch (err) {
            console.error("AI Person Detection error:", err);
          } finally {
            isDetectingRef.current = false;
          }
        }

        // Overlay Bounding Boxes & Persistent Track IDs on Canvas
        const currentPersons = liveObservedTracksRef.current || [];
        currentPersons.forEach((p) => {
          if (p.box) {
            const bx = p.box[0] * width;
            const by = p.box[1] * height;
            const bw = p.box[2] * width;
            const bh = p.box[3] * height;

            ctx.strokeStyle = "#06b6d4"; // cyan-500
            ctx.lineWidth = 3;
            ctx.strokeRect(bx, by, bw, bh);

            ctx.fillStyle = "rgba(6, 182, 212, 0.88)";
            ctx.fillRect(bx, Math.max(0, by - 24), Math.max(130, bw * 0.7), 22);

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 12px sans-serif";
            ctx.fillText(`${p.trackId || "TRK-P"} (Person)`, bx + 6, Math.max(14, by - 8));
          }
        });
      }

      animId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isDemoMode, activeStream]);

  // Determine Observed Count (Real live camera count or simulated count)
  const observedCount = isDemoMode
    ? simulatedTracks.length
    : liveTracks.length;

  const expectedCount = activeRule.expected_person_count;
  const additionalCount = Math.max(0, observedCount - expectedCount);
  const verificationDuration = activeRule.verification_duration || 10;

  const verificationTimerRef = useRef(null);
  const verificationStartTimeRef = useRef(null);
  const prevObservedCountRef = useRef(observedCount);

  // Temporal Verification Effect (Timestamp-Based Persistent Timer)
  useEffect(() => {
    const conditionActive = observedCount > expectedCount;

    // Reset verification start time if person count increased
    if (conditionActive && observedCount > prevObservedCountRef.current) {
      verificationStartTimeRef.current = Date.now();
      setVerifyingSeconds(0);
      setVerificationProgress(0);
    }
    prevObservedCountRef.current = observedCount;

    if (conditionActive) {
      setIsVerifying(true);

      if (!verificationStartTimeRef.current) {
        verificationStartTimeRef.current = Date.now();
      }

      if (!verificationTimerRef.current) {
        verificationTimerRef.current = setInterval(() => {
          if (!verificationStartTimeRef.current) return;

          const elapsedMs = Date.now() - verificationStartTimeRef.current;
          const elapsedSec = Math.floor(elapsedMs / 1000);
          const pct = Math.min(100, Math.round((elapsedSec / verificationDuration) * 100));

          setVerifyingSeconds(elapsedSec);
          setVerificationProgress(pct);

          if (elapsedSec >= verificationDuration) {
            const now = Date.now();
            const cooldownMs = 60000; // 60s cooldown for alert deduplication

            if (now - lastEventTimeRef.current > cooldownMs) {
              lastEventTimeRef.current = now;
              triggerPersonnelAnomalyEvent();
            }
          }
        }, 200);
      }
    } else {
      if (verificationTimerRef.current) {
        clearInterval(verificationTimerRef.current);
        verificationTimerRef.current = null;
      }
      verificationStartTimeRef.current = null;

      setIsVerifying(false);
      setVerifyingSeconds(0);
      setVerificationProgress(0);
    }

    return () => {
      if (!conditionActive && verificationTimerRef.current) {
        clearInterval(verificationTimerRef.current);
        verificationTimerRef.current = null;
        verificationStartTimeRef.current = null;
      }
    };
  }, [additionalCount, verificationDuration]);

  // Trigger Verified Personnel Count Anomaly Event
  const triggerPersonnelAnomalyEvent = async () => {
    // STRICT GUARD: Never trigger alert if observed count <= expected count or 0 persons observed
    if (!observedCount || observedCount <= expectedCount || observedCount === 0) {
      setIsVerifying(false);
      setVerifyingSeconds(0);
      setVerificationProgress(0);
      return;
    }

    const trackIds = isDemoMode
      ? simulatedTracks.map((t) => t.trackId)
      : liveObservedTracksRef.current.map((t) => t.trackId || t.id);

    // Capture Canvas Snapshot
    let evidenceSnap = "";
    if (canvasRef.current) {
      evidenceSnap = captureCanvasSnapshot(
        canvasRef.current,
        `Personnel Count Anomaly | Expected: ${expectedCount} | Observed: ${observedCount}`
      );
    }

    const eventPayload = {
      rule_id: activeRule.id || null,
      camera_id: selectedCamera,
      camera_name: selectedCamera,
      area_name: activeRule.area_id || "Main Entry Area",
      expected_count: expectedCount,
      observed_count: observedCount,
      additional_count: additionalCount,
      verification_duration: verificationDuration,
      evidence_reference: evidenceSnap,
      track_ids: trackIds
    };

    await dispatchPersonnelEvent(eventPayload);
  };

  // Force restart Temporal Persistence Verification ONLY if excess persons observed
  const restartTemporalVerification = () => {
    if (verificationTimerRef.current) {
      clearInterval(verificationTimerRef.current);
      verificationTimerRef.current = null;
    }

    if (observedCount > expectedCount && observedCount > 0) {
      verificationStartTimeRef.current = Date.now();
      lastEventTimeRef.current = 0; // Reset cooldown
      setVerifyingSeconds(0);
      setVerificationProgress(0);
      setIsVerifying(true);
    } else {
      verificationStartTimeRef.current = null;
      setIsVerifying(false);
      setVerifyingSeconds(0);
      setVerificationProgress(0);
    }
  };

  // Form Handlers
  const handleSaveRule = async (e) => {
    e.preventDefault();
    const payload = {
      ...ruleForm,
      camera_id: selectedCamera,
      camera_name: selectedCamera,
      expected_person_count: Number(ruleForm.expected_person_count) ?? 2,
      verification_duration: Number(ruleForm.verification_duration) ?? 10
    };

    if (editingRuleId) {
      await updatePersonnelRule(editingRuleId, payload);
      setSaveSuccessMsg("Monitoring rule updated & synced to SQLite!");
    } else {
      await addPersonnelRule(payload);
      setSaveSuccessMsg("Monitoring rule saved & synced to SQLite!");
    }

    // Force restart temporal persistence verification immediately on save
    restartTemporalVerification();

    setEditingRuleId(null);
    setTimeout(() => {
      setSaveSuccessMsg("");
    }, 3500);
  };

  const handleEditRule = (rule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      schedule_date: rule.schedule_date || "2026-10-02",
      start_time: rule.start_time || "18:00",
      end_time: rule.end_time || "22:00",
      expected_person_count: rule.expected_person_count || 2,
      verification_duration: rule.verification_duration || 10,
      camera_id: rule.camera_id || selectedCamera,
      area_id: rule.area_id || "Main Entry Area"
    });
  };

  const handleAddSimulatedTrack = () => {
    const newId = `TRK-P${Math.floor(Math.random() * 800 + 100)}`;
    setSimulatedTracks((prev) => [...prev, { trackId: newId, confidence: 0.94 }]);
  };

  const handleRemoveSimulatedTrack = () => {
    setSimulatedTracks((prev) => (prev.length > 0 ? prev.slice(0, -1) : []));
  };

  // Unacknowledged Controller Alert
  const latestActiveAlert = (personnelEvents || []).find(
    (e) => e.status === "DETECTED" || e.status === "ACKNOWLEDGED"
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* 1. HEADER & STATUS BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                Personnel Monitoring & Count Verification
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Anonymous persistent Track ID verification • Schedule-based expected vs. observed personnel anomaly tracking
              </p>
            </div>
          </div>
        </div>

        {/* Live Clock & Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <Clock className="w-4 h-4 text-cyan-400" />
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase font-mono block">System Clock</span>
              <span className="text-xs font-bold text-slate-200 font-mono">
                {currentTime.toLocaleTimeString()}
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsDemoMode(!isDemoMode)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${
              isDemoMode
                ? "bg-purple-600/20 border-purple-500/40 text-purple-300 hover:bg-purple-600/30"
                : "bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30"
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>{isDemoMode ? "Switch to Live Camera AI" : "Switch to Staged Test"}</span>
          </button>
        </div>
      </div>

      {/* 2. IN-APP CONTROLLER ALERT NOTIFICATION CENTER (If Anomaly Active) */}
      {latestActiveAlert && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-red-950/90 via-slate-900 to-slate-900 border-2 border-red-500/60 shadow-2xl shadow-red-950/50 space-y-4 animate-pulse-subtle">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 animate-bounce">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-red-500 text-white uppercase tracking-wider">
                    🔴 CONTROLLER ALERT
                  </span>
                  <span className="text-xs font-mono text-red-300 font-bold">
                    Event #{latestActiveAlert.id}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-100 mt-1">
                  Personnel Count Anomaly Detected
                </h2>
                <p className="text-xs text-slate-300">
                  Personnel count exceeded expected level at <strong>{latestActiveAlert.camera_name}</strong> ({latestActiveAlert.area_name}).
                </p>
              </div>
            </div>

            {/* Alert Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedEvidence(latestActiveAlert)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
              >
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>Review Event</span>
              </button>
              {latestActiveAlert.status === "DETECTED" && (
                <button
                  onClick={() => acknowledgePersonnelEvent(latestActiveAlert.id)}
                  className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Acknowledge</span>
                </button>
              )}
            </div>
          </div>

          {/* Anomaly Metrics Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs">
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Expected</span>
              <span className="text-slate-200 font-bold text-sm">{latestActiveAlert.expected_count}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Observed</span>
              <span className="text-amber-400 font-bold text-sm">{latestActiveAlert.observed_count}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Additional Persons</span>
              <span className="text-red-400 font-extrabold text-sm">+{latestActiveAlert.additional_count}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Verification Time</span>
              <span className="text-cyan-400 font-bold text-sm">{latestActiveAlert.verification_duration || 10} seconds</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. METRICS DASHBOARD (5 CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Monitoring Status */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Monitoring Status
          </span>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-lg font-black text-emerald-400 tracking-wide">ACTIVE</span>
          </div>
          <span className="text-[10px] text-slate-500 block">AI Rule Engine Online</span>
        </div>

        {/* Card 2: Expected Personnel */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            EXPECTED PERSONNEL
          </span>
          <div className="text-2xl font-black text-sky-400">{expectedCount}</div>
          <span className="text-[10px] text-slate-500 block">
            Active Schedule Slot ({activeRule.start_time} – {activeRule.end_time})
          </span>
        </div>

        {/* Card 3: Observed Personnel */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            OBSERVED PERSONNEL
          </span>
          <div className="text-2xl font-black text-slate-100">{observedCount}</div>
          <span className="text-[10px] text-slate-500 block">Unique Persistent Track IDs</span>
        </div>

        {/* Card 4: Additional / Unaccounted */}
        <div
          className={`p-4 rounded-2xl border shadow-md space-y-2 transition-all ${
            additionalCount > 0
              ? "bg-red-500/10 border-red-500/40 text-red-300"
              : "bg-slate-900/80 border-slate-800 text-slate-400"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider block">
            ADDITIONAL / UNACCOUNTED
          </span>
          <div className={`text-2xl font-black ${additionalCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {additionalCount > 0 ? `+${additionalCount}` : "0"}
          </div>
          <span className="text-[10px] block opacity-80">
            {additionalCount > 0 ? "Personnel count exceeded!" : "Personnel level nominal"}
          </span>
        </div>

        {/* Card 5: Current Schedule & Camera */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md space-y-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            CURRENT SCHEDULE
          </span>
          <div className="text-xs font-bold text-slate-200 truncate">{streamSource?.name || selectedCamera}</div>
          <span className="text-[10px] text-cyan-400 font-mono block">
            {activeRule.start_time} – {activeRule.end_time} | Exp: {expectedCount}
          </span>
        </div>
      </div>

      {/* 4. VISUAL TIMELINE / SCHEDULE SECTION */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              PERSONNEL SCHEDULE TIMELINE
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">Camera: {selectedCamera}</span>
        </div>

        {/* Schedule Visual Bar */}
        <div className="relative pt-2 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(personnelRules || []).map((rule, idx) => {
              const isCurrent = rule.id === activeRule.id;
              return (
                <div
                  key={rule.id || idx}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrent
                      ? "bg-sky-950/80 border-sky-500 shadow-lg shadow-sky-950/50 text-sky-100 ring-2 ring-sky-500/30"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-slate-300">
                      {rule.start_time} ───────────── {rule.end_time}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-sky-500 text-white uppercase tracking-wider">
                        ACTIVE NOW
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400">Expected Personnel:</span>
                    <span className="font-extrabold text-sm text-sky-400">{rule.expected_person_count} persons</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. LIVE VISION ENGINE & STAGED TEST INTERACTIVE SIMULATOR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: AI Vision Display & Temporal Verification Timer */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Camera className="w-5 h-5 text-cyan-400" />
              AI Person Detection & Verification Feed ({streamSource?.name || selectedCamera})
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded font-mono ${
                activeStream
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold"
                  : "bg-slate-800 text-slate-300"
              }`}>
                {isDemoMode ? "SIMULATED STAGED TEST" : activeStream ? "LIVE CAMERA ACCESS ACTIVE" : "CAMERA DISCONNECTED"}
              </span>
            </div>
          </div>

          {/* Verification Timer Overlay Progress Bar */}
          {isVerifying && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  TEMPORAL VERIFICATION IN PROGRESS ({verifyingSeconds}s / {verificationDuration}s)
                </span>
                <span className="font-mono text-amber-400 font-bold">{verificationProgress}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-red-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${verificationProgress}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-amber-300/80">
                Evaluating persistent track IDs over {verificationDuration} seconds to eliminate transient frame detection errors.
              </p>
            </div>
          )}

          {/* Video Stream Canvas Render */}
          <div className="relative aspect-video rounded-xl bg-black overflow-hidden border border-slate-800 flex items-center justify-center">
            {isDemoMode ? (
              <div className="w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 flex flex-col justify-between relative">
                {/* Simulated Camera Overlay Header */}
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                    <span className="text-slate-200 font-bold">{selectedCamera}</span>
                    <span>| Main Gate Area</span>
                  </div>
                  <span className="font-mono text-cyan-400">FPS: 30.0 | Res: 1920x1080</span>
                </div>

                {/* Simulated Bounding Boxes Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-auto py-4">
                  {simulatedTracks.map((t) => (
                    <div
                      key={t.trackId}
                      className="p-3 rounded-xl bg-slate-900/90 border-2 border-cyan-500/60 shadow-lg text-xs space-y-1 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-cyan-300 text-xs">{t.trackId}</span>
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">
                          {Math.round(t.confidence * 100)}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">Object: Person</div>
                      <div className="text-[10px] text-slate-500">Status: Tracking Active</div>
                    </div>
                  ))}
                </div>

                {/* Bottom Overlay Info */}
                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-3">
                  <span className="font-mono text-slate-300">
                    Tracked Persons: <strong>{simulatedTracks.length}</strong> | Expected: <strong>{expectedCount}</strong>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    AI Pipeline: COCO-SSD + Persistent Track Memory
                  </span>
                </div>
              </div>
            ) : activeStream ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video ref={videoRef} className="hidden" playsInline muted />
                <canvas ref={canvasRef} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>LIVE CAMERA ACCESS CAPTURING ({streamSource?.name || "Webcam Input"})</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs space-y-4 max-w-md mx-auto">
                <div className="p-4 rounded-full bg-slate-900 border border-slate-800 inline-block text-cyan-400">
                  <VideoOff className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-200">Camera Feed Disconnected</h3>
                  <p className="text-slate-400 mt-1">
                    Grant camera access to capture live video frames and run real-time AI person detection.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={connectWebcam}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition shadow-lg shadow-cyan-600/30 flex items-center gap-2"
                  >
                    <Video className="w-4 h-4" />
                    <span>🎥 Grant Webcam Access</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("camera-input")}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
                  >
                    ⚙️ Camera Setup
                  </button>
                  <button
                    onClick={() => setIsDemoMode(true)}
                    className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 font-semibold transition"
                  >
                    🧪 Staged Test Mode
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Staged Test Controller Panel */}
          {isDemoMode && (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  Staged Test Controller (Interactive Anomaly Generator)
                </span>
                <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Testing Mode Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Click buttons below to add or remove persistent Person Track IDs to simulate personnel anomalies and test verification logic in real-time.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={handleAddSimulatedTrack}
                  className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-600/20 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>➕ Add Person Track (Observed: {simulatedTracks.length + 1})</span>
                </button>
                <button
                  onClick={handleRemoveSimulatedTrack}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-1.5"
                >
                  <span>➖ Remove Person Track</span>
                </button>
                <button
                  onClick={() => setSimulatedTracks([
                    { trackId: "TRK-P101", confidence: 0.96 },
                    { trackId: "TRK-P102", confidence: 0.94 }
                  ])}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
                >
                  Reset to Expected (2)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Col: Rule Configuration Panel */}
        <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-sky-400" />
              Expected Personnel Schedule
            </h2>
          </div>

          <form onSubmit={handleSaveRule} className="space-y-3 text-xs">
            {/* Camera Selection */}
            <div>
              <label className="text-slate-400 font-semibold mb-1 block">Camera / Area Selection</label>
              <select
                value={ruleForm.camera_id}
                onChange={(e) => setRuleForm({ ...ruleForm, camera_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="Gate Camera 01">Gate Camera 01 (Main Entry)</option>
                <option value="Refinery Cam 01">Refinery Cam 01 (Process Area)</option>
                <option value="Control Room Gate">Control Room Gate</option>
              </select>
            </div>

            {/* Monitoring Date */}
            <div>
              <label className="text-slate-400 font-semibold mb-1 block">Monitoring Date</label>
              <input
                type="text"
                value={ruleForm.schedule_date}
                onChange={(e) => setRuleForm({ ...ruleForm, schedule_date: e.target.value })}
                placeholder="YYYY-MM-DD or ALL"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none"
              />
            </div>

            {/* Start & End Time */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">Start Time</label>
                <input
                  type="text"
                  value={ruleForm.start_time}
                  onChange={(e) => setRuleForm({ ...ruleForm, start_time: e.target.value })}
                  placeholder="18:00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">End Time</label>
                <input
                  type="text"
                  value={ruleForm.end_time}
                  onChange={(e) => setRuleForm({ ...ruleForm, end_time: e.target.value })}
                  placeholder="22:00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Expected Count & Verification Duration */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">Expected Personnel</label>
                <input
                  type="number"
                  min="0"
                  value={ruleForm.expected_person_count}
                  onChange={(e) => setRuleForm({ ...ruleForm, expected_person_count: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none font-bold"
                />
              </div>
              <div>
                <label className="text-slate-400 font-semibold mb-1 block">Verification Duration</label>
                <input
                  type="number"
                  min="1"
                  value={ruleForm.verification_duration}
                  onChange={(e) => setRuleForm({ ...ruleForm, verification_duration: parseInt(e.target.value) || 10 })}
                  placeholder="Seconds"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Save Success Feedback Banner */}
            {saveSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-xs flex items-center justify-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* Save Button */}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition shadow-lg shadow-sky-600/20 mt-2 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{editingRuleId ? "Update Monitoring Rule" : "Save Monitoring Rule"}</span>
            </button>
          </form>

          {/* Configured Rules List */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Configured Schedule Rules ({personnelRules.length})
            </span>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {(personnelRules || []).map((rule) => (
                <div
                  key={rule.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-bold text-slate-200">
                      {rule.start_time} – {rule.end_time}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Expected: <strong className="text-sky-400">{rule.expected_person_count}</strong> | Grace: {rule.verification_duration}s
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="p-1 text-slate-400 hover:text-sky-400 rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removePersonnelRule(rule.id)}
                      className="p-1 text-slate-400 hover:text-red-400 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 6. RECENT PERSONNEL EVENTS TABLE */}
      <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Recent Personnel Monitoring Events ({personnelEvents.length})
          </h2>
          <span className="text-xs text-slate-400">Synced to SQLite Database</span>
        </div>

        {personnelEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/40" />
            <p className="font-semibold text-slate-300">Zero Personnel Count Anomalies</p>
            <p className="text-slate-500">All camera areas are operating strictly within expected personnel limits.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[11px] font-mono">
                  <th className="pb-3 px-3">Event ID</th>
                  <th className="pb-3 px-3">Timestamp</th>
                  <th className="pb-3 px-3">Camera / Area</th>
                  <th className="pb-3 px-3">Expected</th>
                  <th className="pb-3 px-3">Observed</th>
                  <th className="pb-3 px-3">Additional</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {personnelEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-950/40 font-mono">
                    <td className="py-3 px-3 font-bold text-cyan-400">{evt.id}</td>
                    <td className="py-3 px-3 text-slate-400">{evt.timestamp}</td>
                    <td className="py-3 px-3">{evt.camera_name} ({evt.area_name})</td>
                    <td className="py-3 px-3 text-sky-400 font-bold">{evt.expected_count}</td>
                    <td className="py-3 px-3 text-amber-400 font-bold">{evt.observed_count}</td>
                    <td className="py-3 px-3 text-red-400 font-extrabold">+{evt.additional_count}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          evt.status === "RESOLVED"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : evt.status === "ACKNOWLEDGED"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedEvidence(evt)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition"
                      >
                        Review
                      </button>
                      {evt.status === "DETECTED" && (
                        <button
                          onClick={() => acknowledgePersonnelEvent(evt.id)}
                          className="px-2.5 py-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-[11px] font-bold transition"
                        >
                          Ack
                        </button>
                      )}
                      {evt.status !== "RESOLVED" && (
                        <button
                          onClick={() => resolvePersonnelEvent(evt.id)}
                          className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white text-[11px] font-bold transition"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
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
