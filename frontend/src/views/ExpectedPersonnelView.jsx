import React, { useState, useEffect, useRef } from "react";
import {
  UserCheck,
  Clock,
  Calendar,
  Camera,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Save,
  Send,
  RefreshCw,
  Bell,
  Smartphone,
  ShieldCheck,
  Users,
  Eye,
  Activity,
  Sliders,
  Check,
  AlertCircle,
  Video,
  Info
} from "lucide-react";
import { useSafety } from "../context/SafetyContext";
import { detectObjectsAndMobilePhone, captureCanvasSnapshot } from "../services/realVisionProcessor";

export default function ExpectedPersonnelView() {
  const {
    activeStream,
    streamSource,
    connectWebcam,
    expectedPersonnelRules,
    whatsappStatus,
    notificationLogs,
    addExpectedPersonnelRule,
    updateExpectedPersonnelRule,
    removeExpectedPersonnelRule,
    triggerTestWhatsApp,
    triggerUnknownPersonWhatsAppAlert,
    setSelectedEvidence,
    cameras,
    alerts
  } = useSafety();

  // Current System Time Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Form State for Expected Personnel Rule
  const [ruleForm, setRuleForm] = useState({
    rule_name: "Plant Safety Threshold Rule",
    zone_name: "Main Plant Area",
    camera_id: "Gate Camera 01",
    start_time: "00:00",
    end_time: "23:59",
    expected_person_count: 2,
    verification_duration: 10,
    cooldown: 300,
    controller_whatsapp: "",
    whatsapp_enabled: true,
    enabled: true
  });

  const [savingRule, setSavingRule] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Active Detection Mode: Live Camera vs Prototype Staged Simulator
  const [isDemoMode, setIsDemoMode] = useState(true);

  // Staged Test simulated person tracks (Track IDs only, NO fake employee names)
  const [simulatedPersonCount, setSimulatedPersonCount] = useState(5);
  const simulatedTrackIds = [
    "TRK-P101",
    "TRK-P102",
    "TRK-P103",
    "TRK-P104",
    "TRK-P105"
  ];

  // Live Camera AI State
  const [liveTracks, setLiveTracks] = useState([]);
  const liveObservedTracksRef = useRef([]);

  // Temporal Verification Timer State
  const [verificationProgress, setVerificationProgress] = useState(0); // 0 to 100%
  const [verifyingSeconds, setVerifyingSeconds] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const lastEventTimeRef = useRef(0);

  // Canvas & Video Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const isDetectingRef = useRef(false);
  const lastInferenceTimeRef = useRef(0);

  // Sync clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format current time HH:MM
  const currentHHMM = `${String(currentTime.getHours()).padStart(2, "0")}:${String(
    currentTime.getMinutes()
  ).padStart(2, "0")}`;

  // Time-based Rule Engine helper
  const isTimeInRuleWindow = (current, start, end) => {
    if (!start || !end) return true;
    if (start <= end) {
      return current >= start && current <= end;
    } else {
      // Overnight rule, e.g. 19:00 -> 06:00
      return current >= start || current <= end;
    }
  };

  // Active Rule derived directly from ruleForm for 100% instant live updates
  const activeRule = {
    id: expectedPersonnelRules?.[0]?.id || 1,
    rule_name: ruleForm.rule_name,
    zone_name: ruleForm.zone_name,
    camera_id: ruleForm.camera_id,
    start_time: ruleForm.start_time,
    end_time: ruleForm.end_time,
    expected_person_count: Number.isFinite(Number(ruleForm.expected_person_count))
      ? Number(ruleForm.expected_person_count)
      : 2,
    verification_duration: Number(ruleForm.verification_duration) || 10,
    cooldown: Number(ruleForm.cooldown) || 300,
    controller_whatsapp: ruleForm.controller_whatsapp,
    whatsapp_enabled: ruleForm.whatsapp_enabled,
    enabled: ruleForm.enabled
  };

  const isRuleActiveNow = isTimeInRuleWindow(
    currentHHMM,
    activeRule.start_time,
    activeRule.end_time
  );

  // Load existing database rule into form on initial mount only
  const isInitialLoadedRef = useRef(false);
  useEffect(() => {
    if (!isInitialLoadedRef.current && expectedPersonnelRules && expectedPersonnelRules.length > 0) {
      isInitialLoadedRef.current = true;
      const r = expectedPersonnelRules[0];
      setRuleForm({
        rule_name: r.rule_name || "Plant Safety Threshold Rule",
        zone_name: r.zone_name || "Main Plant Area",
        camera_id: r.camera_id || "Gate Camera 01",
        start_time: r.start_time || "00:00",
        end_time: r.end_time || "23:59",
        expected_person_count: r.expected_person_count ?? 2,
        verification_duration: r.verification_duration ?? 10,
        cooldown: r.cooldown ?? 300,
        controller_whatsapp: r.controller_whatsapp || "",
        whatsapp_enabled: r.whatsapp_enabled === 1 || r.whatsapp_enabled === true,
        enabled: r.enabled === 1 || r.enabled === true
      });
    }
  }, [expectedPersonnelRules]);

  // Handle Video Element attachment
  useEffect(() => {
    if (!isDemoMode) {
      if (!activeStream) {
        connectWebcam();
      } else if (videoRef.current && activeStream instanceof MediaStream) {
        if (videoRef.current.srcObject !== activeStream) {
          videoRef.current.srcObject = activeStream;
        }
        videoRef.current.play().catch((e) => console.log("Video play error:", e));
      }
    }
  }, [activeStream, isDemoMode, connectWebcam]);

  // Real-Time Canvas Render Loop & Non-Blocking AI Person Detection
  useEffect(() => {
    if (isDemoMode) return;
    let animId;

    const renderLoop = () => {
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

        // 1. Draw live Video frame smoothly onto canvas (60 FPS)
        ctx.drawImage(video, 0, 0, width, height);

        // 2. Trigger Non-Blocking Async AI Detection (~150ms interval)
        const now = Date.now();
        if (!isDetectingRef.current && now - lastInferenceTimeRef.current >= 150) {
          isDetectingRef.current = true;
          lastInferenceTimeRef.current = now;

          detectObjectsAndMobilePhone(video)
            .then((res) => {
              const persons = (res && res.persons) ? res.persons : [];
              liveObservedTracksRef.current = persons;

              setLiveTracks((prev) => {
                const prevIds = prev.map((p) => p.trackId).join(",");
                const nextIds = persons.map((p) => p.trackId).join(",");
                return prevIds === nextIds ? prev : persons;
              });
            })
            .catch((err) => {
              console.error("AI Person Detection error:", err);
            })
            .finally(() => {
              isDetectingRef.current = false;
            });
        }

        // 3. Overlay tracked person bounding boxes and IDs
        const currentPersons = liveObservedTracksRef.current || [];
        currentPersons.forEach((p) => {
          if (p.box) {
            const bx = p.box[0] * width;
            const by = p.box[1] * height;
            const bw = p.box[2] * width;
            const bh = p.box[3] * height;

            ctx.strokeStyle = "#0284c7"; // sky-600
            ctx.lineWidth = 3;
            ctx.strokeRect(bx, by, bw, bh);

            ctx.fillStyle = "rgba(2, 132, 199, 0.9)";
            ctx.fillRect(bx, Math.max(0, by - 24), Math.max(130, bw * 0.7), 22);

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px Inter, sans-serif";
            ctx.fillText(p.trackId || "TRK-P101", bx + 6, Math.max(14, by - 8));
          }
        });
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [isDemoMode]);

  // Compute active person counts
  const currentDetectedCount = isDemoMode ? simulatedPersonCount : liveTracks.length;
  const currentExpectedCount = activeRule.expected_person_count ?? 2;
  const additionalCount = Math.max(0, currentDetectedCount - currentExpectedCount);

  // Compute active track IDs
  const activeTrackIds = isDemoMode
    ? simulatedTrackIds.slice(0, currentDetectedCount)
    : liveTracks.map((t) => t.trackId || "TRK-P101");

  const unaccountedTrackIds = activeTrackIds.slice(currentExpectedCount);

  // Temporal Verification Logic (Timestamp-Based Persistent Timer)
  const verificationTimerRef = useRef(null);
  const verificationStartTimeRef = useRef(null);
  const prevDetectedCountRef = useRef(currentDetectedCount);

  useEffect(() => {
    const targetDuration = Number(activeRule.verification_duration) || 10;
    const cooldownMs = (Number(activeRule.cooldown) || 300) * 1000;
    const isRuleEnabled = activeRule.enabled !== false;
    const excessDetected = currentDetectedCount > currentExpectedCount;
    const conditionActive = isRuleEnabled && excessDetected;

    // Reset verification start time if person count increased
    if (conditionActive && currentDetectedCount > prevDetectedCountRef.current) {
      verificationStartTimeRef.current = Date.now();
      setVerifyingSeconds(0);
      setVerificationProgress(0);
    }
    prevDetectedCountRef.current = currentDetectedCount;

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
          const progress = Math.min(100, Math.round((elapsedSec / targetDuration) * 100));

          setVerifyingSeconds(elapsedSec);
          setVerificationProgress(progress);

          if (elapsedSec >= targetDuration) {
            const nowMs = Date.now();
            if (nowMs - lastEventTimeRef.current >= cooldownMs) {
              lastEventTimeRef.current = nowMs;
              triggerVerifiedEvent(currentExpectedCount, currentDetectedCount, unaccountedTrackIds);
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

      if (currentDetectedCount <= currentExpectedCount && activeEvent) {
        setActiveEvent(null);
      }
    }

    return () => {
      if (!conditionActive && verificationTimerRef.current) {
        clearInterval(verificationTimerRef.current);
        verificationTimerRef.current = null;
        verificationStartTimeRef.current = null;
      }
    };
  }, [
    currentDetectedCount,
    currentExpectedCount,
    activeRule.verification_duration,
    activeRule.cooldown,
    activeRule.enabled
  ]);

  // Trigger Verified Unknown Person Event
  const triggerVerifiedEvent = async (expected, detected, unaccountedTracks) => {
    // STRICT GUARD: Never trigger alert if detected count <= expected count or 0 persons observed
    if (!detected || detected <= expected || detected === 0) {
      setIsVerifying(false);
      setVerifyingSeconds(0);
      setVerificationProgress(0);
      return;
    }

    let snapshot = "";
    if (canvasRef.current) {
      snapshot = captureCanvasSnapshot(canvasRef.current);
    }

    const additional = Math.max(0, detected - expected);
    const eventPayload = {
      eventId: `EVT-UNK-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      eventType: "UNKNOWN_PERSON",
      zone: activeRule.zone_name || "Main Plant Area",
      camera: activeRule.camera_id || "Gate Camera 01",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      expectedCount: expected,
      detectedCount: detected,
      additionalCount: additional,
      involvedTrackIds: unaccountedTracks.length > 0 ? unaccountedTracks : ["TRK-P103", "TRK-P104", "TRK-P105"],
      persistenceDuration: activeRule.verification_duration || 10,
      verificationStatus: "REVIEW REQUIRED",
      evidenceSnapshot: snapshot,
      source: "LIVE_CAMERA",
      mode: "PROTOTYPE",
      recipient: activeRule.controller_whatsapp || "+919876543210"
    };

    setActiveEvent(eventPayload);

    // Call backend endpoint to register alert and send WhatsApp alert
    await triggerUnknownPersonWhatsAppAlert(eventPayload);
  };

  // Force restart Temporal Persistence Verification ONLY if excess persons detected
  const restartTemporalVerification = () => {
    if (verificationTimerRef.current) {
      clearInterval(verificationTimerRef.current);
      verificationTimerRef.current = null;
    }

    if (currentDetectedCount > currentExpectedCount && currentDetectedCount > 0) {
      verificationStartTimeRef.current = Date.now();
      lastEventTimeRef.current = 0; // Reset cooldown so new alert can fire
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

  // Form Save Handler
  const handleSaveRule = async (e) => {
    e.preventDefault();
    setSavingRule(true);
    setSaveSuccessMsg("");

    const payload = {
      rule_name: ruleForm.rule_name,
      zone_name: ruleForm.zone_name,
      camera_id: ruleForm.camera_id,
      start_time: ruleForm.start_time,
      end_time: ruleForm.end_time,
      expected_person_count: Number(ruleForm.expected_person_count),
      verification_duration: Number(ruleForm.verification_duration),
      cooldown: Number(ruleForm.cooldown),
      controller_whatsapp: ruleForm.controller_whatsapp,
      whatsapp_enabled: ruleForm.whatsapp_enabled ? 1 : 0,
      enabled: ruleForm.enabled ? 1 : 0
    };

    if (expectedPersonnelRules && expectedPersonnelRules.length > 0) {
      await updateExpectedPersonnelRule(expectedPersonnelRules[0].id, payload);
    } else {
      await addExpectedPersonnelRule(payload);
    }

    // Force restart temporal persistence verification immediately on save
    restartTemporalVerification();

    setSavingRule(false);
    setSaveSuccessMsg("Rule saved & Temporal Verification restarted from 0s!");
    setTimeout(() => setSaveSuccessMsg(""), 4000);
  };

  // Test WhatsApp Alert Button Handler
  const handleTestWhatsApp = async () => {
    setTestLoading(true);
    setTestResult(null);

    const res = await triggerTestWhatsApp(ruleForm.controller_whatsapp);
    setTestLoading(false);
    setTestResult(res);
  };

  // Format 24h string to 12h AM/PM for preview display
  const format12H = (hhmm) => {
    if (!hhmm) return "07:00 PM";
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${String(displayH).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-sky-700 font-semibold text-xs uppercase tracking-wider mb-1">
            <UserCheck className="w-4 h-4" />
            <span>Industrial Safety Intelligence</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Expected Personnel & Unknown Person Alert
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Time-based personnel threshold monitoring with temporal verification & official WhatsApp alerts.
          </p>
        </div>

        {/* Real-time System Status Pill & Mode Toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Current Time: {currentTime.toLocaleTimeString()}</span>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setIsDemoMode(true)}
              className={`px-3 py-1 rounded-md transition-all ${
                isDemoMode ? "bg-sky-700 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Staged Prototype Simulator
            </button>
            <button
              onClick={() => {
                setIsDemoMode(false);
                if (!activeStream) connectWebcam();
              }}
              className={`px-3 py-1 rounded-md transition-all ${
                !isDemoMode ? "bg-sky-700 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Live Camera AI Mode
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Rule Configuration Form */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-600" />
                <span>Rule Configuration</span>
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-sky-50 text-sky-700 border border-sky-200">
                Industrial Standard
              </span>
            </div>

            {saveSuccessMsg && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs rounded-lg flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveRule} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Rule Name</label>
                <input
                  type="text"
                  value={ruleForm.rule_name}
                  onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Area / Zone</label>
                  <input
                    type="text"
                    value={ruleForm.zone_name}
                    onChange={(e) => setRuleForm({ ...ruleForm, zone_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Target Camera</label>
                  <select
                    value={ruleForm.camera_id}
                    onChange={(e) => setRuleForm({ ...ruleForm, camera_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium bg-white"
                  >
                    <option value="Gate Camera 01">Gate Camera 01</option>
                    <option value="Main Plant Area">Main Plant Area</option>
                    <option value="Refinery Area A">Refinery Area A</option>
                    {cameras.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Start Time</label>
                  <input
                    type="time"
                    value={ruleForm.start_time}
                    onChange={(e) => setRuleForm({ ...ruleForm, start_time: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">End Time</label>
                  <input
                    type="time"
                    value={ruleForm.end_time}
                    onChange={(e) => setRuleForm({ ...ruleForm, end_time: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Expected Personnel</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={ruleForm.expected_person_count}
                    onChange={(e) => setRuleForm({ ...ruleForm, expected_person_count: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Min Persistence (s)</label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={ruleForm.verification_duration}
                    onChange={(e) => setRuleForm({ ...ruleForm, verification_duration: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Cooldown (s)</label>
                  <input
                    type="number"
                    min="30"
                    max="3600"
                    value={ruleForm.cooldown}
                    onChange={(e) => setRuleForm({ ...ruleForm, cooldown: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Controller WhatsApp Number
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ruleForm.controller_whatsapp}
                    onChange={(e) => setRuleForm({ ...ruleForm, controller_whatsapp: e.target.value })}
                    placeholder="+919876543210"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                    required
                  />
                  <span className="text-[10px] text-slate-400 font-semibold uppercase shrink-0">
                    Secure Env
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="wa_toggle"
                    checked={ruleForm.whatsapp_enabled}
                    onChange={(e) => setRuleForm({ ...ruleForm, whatsapp_enabled: e.target.checked })}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                  <label htmlFor="wa_toggle" className="text-slate-700 font-semibold cursor-pointer">
                    Enable WhatsApp Alerts
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rule_enabled"
                    checked={ruleForm.enabled}
                    onChange={(e) => setRuleForm({ ...ruleForm, enabled: e.target.checked })}
                    className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                  />
                  <label htmlFor="rule_enabled" className="text-slate-700 font-semibold cursor-pointer">
                    Rule Active
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="submit"
                  disabled={savingRule}
                  className="flex-1 bg-sky-700 hover:bg-sky-800 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingRule ? "Saving..." : "Save Rule"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  disabled={testLoading}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{testLoading ? "Testing..." : "Test WhatsApp Alert"}</span>
                </button>
              </div>
            </form>

            {/* Test Result Toast */}
            {testResult && (
              <div
                className={`p-3.5 rounded-lg border text-xs font-medium space-y-2.5 ${
                  testResult.success
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                    : "bg-red-50 border-red-300 text-red-950"
                }`}
              >
                <div className="flex items-center justify-between font-extrabold border-b border-emerald-200/60 pb-2">
                  <span className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>WhatsApp Notification: {testResult.status} ({testResult.mode || "MOCK"})</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{new Date().toLocaleTimeString()}</span>
                </div>

                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-900 font-bold text-[11px] flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>MOCK MODE — No real WhatsApp message is being sent</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                  <div>
                    <span className="text-slate-500 text-[10px] block font-bold uppercase">Recipient</span>
                    <span className="font-mono text-slate-800">{testResult.recipient || ruleForm.controller_whatsapp || "Configured Controller"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block font-bold uppercase">Status Code</span>
                    <span className="font-bold text-emerald-700">{testResult.status}</span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-700 font-medium">{testResult.message}</p>

                {testResult.alert_text && (
                  <div>
                    <span className="text-slate-500 text-[10px] block font-bold uppercase mb-1">Simulated Message Content</span>
                    <pre className="p-2.5 bg-white rounded-md text-[10px] whitespace-pre-wrap text-slate-800 font-mono border border-slate-200 shadow-2xs">
                      {testResult.alert_text}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clean Industrial Summary Card (As specified in requirement #1) */}
          <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 shadow-md space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-extrabold uppercase text-sky-400 tracking-wider">
                Expected Personnel Rule
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isRuleActiveNow
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-slate-700 text-slate-300"
                }`}
              >
                {isRuleActiveNow ? "ACTIVE NOW" : "INACTIVE NOW"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Zone:</span>
                <span className="font-semibold text-slate-100">{activeRule.zone_name}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Time Window:</span>
                <span className="font-semibold text-sky-300">
                  {format12H(activeRule.start_time)} → {format12H(activeRule.end_time)}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Expected Personnel:</span>
                <span className="font-bold text-amber-400">{activeRule.expected_person_count} persons</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Persistence Threshold:</span>
                <span className="font-semibold text-slate-100">{activeRule.verification_duration} seconds</span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Alert Cooldown:</span>
                <span className="font-semibold text-slate-100">
                  {Math.round((activeRule.cooldown || 300) / 60)} minutes
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">WhatsApp Alerts:</span>
                <span
                  className={`font-bold ${
                    activeRule.whatsapp_enabled ? "text-emerald-400" : "text-slate-400"
                  }`}
                >
                  {activeRule.whatsapp_enabled ? "ON" : "OFF"}
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-400">Controller Number:</span>
                <span className="font-mono text-slate-200">
                  {activeRule.controller_whatsapp ? activeRule.controller_whatsapp.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2") : "configured securely"}
                </span>
              </div>
            </div>
          </div>

          {/* Backend Status Widget */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-sky-600" />
                <span>Backend Notification Status</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {whatsappStatus.mode || "MOCK"} MODE
              </span>
            </div>

            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 font-bold text-[11px] flex items-center gap-1.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>MOCK MODE — No real WhatsApp message is being sent</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div className="text-slate-400 text-[10px] uppercase font-bold">WhatsApp Service</div>
                <div className="font-bold text-slate-800 mt-0.5">{whatsappStatus.status || "MOCK MODE"}</div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Notification Mode</div>
                <div className="font-bold text-sky-700 mt-0.5">{whatsappStatus.mode || "MOCK"}</div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Last Notification</div>
                <div className="font-bold text-slate-800 mt-0.5 truncate">
                  {whatsappStatus.last_notification
                    ? new Date(whatsappStatus.last_notification).toLocaleTimeString()
                    : "None"}
                </div>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Last Status</div>
                <div className="font-bold text-emerald-700 mt-0.5">
                  {whatsappStatus.last_status || "SIMULATED"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Live Stream & Temporal Verification Engine (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Live Monitor Canvas / Staged Simulator Screen */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-lg space-y-0">
            {/* Top Bar */}
            <div className="px-4 py-3 bg-slate-950 flex items-center justify-between border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-200 font-bold">
                <Video className="w-4 h-4 text-sky-400" />
                <span>{activeRule.camera_id}</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-sky-300">
                  {isDemoMode ? "PROTOTYPE SIMULATION" : "LIVE AI STREAM"}
                </span>
              </div>

              {isDemoMode && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Simulate Person Count:</span>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    value={simulatedPersonCount}
                    onChange={(e) => setSimulatedPersonCount(Number(e.target.value))}
                    className="w-24 accent-sky-500 cursor-pointer"
                  />
                  <span className="font-mono text-sky-400 font-bold w-4 text-center">
                    {simulatedPersonCount}
                  </span>
                </div>
              )}
            </div>

            {/* Video Viewport / Simulator Canvas */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {!isDemoMode ? (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover hidden"
                    playsInline
                    muted
                    autoPlay
                    onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
                  />
                  <canvas ref={canvasRef} className="w-full h-full object-contain" />
                </>
              ) : (
                <div className="w-full h-full bg-slate-950 relative flex flex-col justify-between p-6">
                  {/* Grid background simulation */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b15_1px,transparent_1px),linear-gradient(to_bottom,#1e293b15_1px,transparent_1px)] bg-[size:24px_24px]" />

                  {/* Simulated Detected Bounding Boxes */}
                  <div className="absolute inset-0 p-8 grid grid-cols-3 gap-6 items-center pointer-events-none">
                    {simulatedTrackIds.slice(0, simulatedPersonCount).map((trk, idx) => (
                      <div
                        key={trk}
                        className={`p-3 rounded-lg border-2 flex flex-col justify-between h-32 transition-all ${
                          idx >= activeRule.expected_person_count
                            ? "border-red-500 bg-red-950/20 text-red-400"
                            : "border-sky-500 bg-sky-950/20 text-sky-400"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              idx >= activeRule.expected_person_count
                                ? "bg-red-500 text-white"
                                : "bg-sky-600 text-white"
                            }`}
                          >
                            {trk}
                          </span>
                          <span>94% CONF</span>
                        </div>
                        <div className="text-center">
                          <Users className="w-8 h-8 mx-auto opacity-80" />
                          <span className="text-[10px] font-semibold block mt-1">
                            {idx >= activeRule.expected_person_count ? "UNACCOUNTED PERSON" : "EXPECTED PERSON"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Top Status Banner Overlay */}
                  <div className="relative z-10 flex items-center justify-between bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-lg border border-slate-800 text-xs">
                    <span className="text-slate-300 font-semibold">
                      Rule Active: {isRuleActiveNow ? "YES (19:00 → 06:00)" : "NO (Outside Schedule)"}
                    </span>
                    <span className="font-mono text-sky-300 font-bold">
                      Expected: {currentExpectedCount} | Detected: {currentDetectedCount} | Additional: {additionalCount}
                    </span>
                  </div>

                  {/* Bottom Disclaimer */}
                  <div className="relative z-10 text-[10px] text-slate-400 text-center font-medium bg-slate-900/80 py-1.5 px-3 rounded-md border border-slate-800">
                    ℹ️ Track IDs are persistent visual detection keys (TRK-P101...TRK-P105). System does NOT claim actual employee identities.
                  </div>
                </div>
              )}
            </div>

            {/* Live temporal progress bar */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-300 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span>Temporal Persistence Verification</span>
                </span>
                <span
                  className={`font-mono text-xs ${
                    additionalCount > 0 ? "text-amber-400 font-bold" : "text-slate-400"
                  }`}
                >
                  {isVerifying
                    ? `Verifying Persistence... (${verifyingSeconds}s / ${activeRule.verification_duration}s)`
                    : additionalCount > 0
                    ? "Condition Active - Awaiting Persistence Window"
                    : "Personnel Count Normal"}
                </span>
              </div>

              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    verificationProgress >= 100
                      ? "bg-red-500"
                      : isVerifying
                      ? "bg-gradient-to-r from-sky-500 to-amber-500"
                      : "bg-slate-700"
                  }`}
                  style={{ width: `${verificationProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Active Verified Event Card */}
          {activeEvent && (
            <div className="bg-red-50 border-2 border-red-300 p-5 rounded-xl shadow-md space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-red-200 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <span className="font-extrabold text-red-900 text-sm tracking-wide">
                    POTENTIAL UNKNOWN PERSON EVENT
                  </span>
                </div>
                <span className="px-2.5 py-1 bg-red-600 text-white font-extrabold text-[10px] rounded uppercase tracking-wider">
                  Status: {activeEvent.verificationStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-red-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Zone</span>
                  <span className="font-bold text-slate-800">{activeEvent.zone}</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-red-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Expected</span>
                  <span className="font-bold text-slate-800">{activeEvent.expectedCount} persons</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-red-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Detected</span>
                  <span className="font-bold text-slate-800">{activeEvent.detectedCount} persons</span>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-red-100">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Unaccounted</span>
                  <span className="font-extrabold text-red-600">{activeEvent.additionalCount} persons</span>
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-red-100 text-xs space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">
                  Involved Track IDs (No Identity Claimed)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {activeEvent.involvedTrackIds.map((tid) => (
                    <span key={tid} className="px-2 py-0.5 bg-red-100 text-red-800 font-mono font-bold rounded text-[11px]">
                      {tid}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs flex items-center justify-between text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">
                    WhatsApp Alert Dispatched to Controller ({activeEvent.recipient})
                  </span>
                </div>
                <span className="font-bold text-[10px] bg-emerald-200 px-2 py-0.5 rounded text-emerald-900">
                  SIMULATED / SUCCESS
                </span>
              </div>
            </div>
          )}

          {/* Audit Logs Table */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-sky-600" />
                <span>Notification Audit Log History</span>
              </h3>
              <span className="text-[10px] font-semibold text-slate-400">
                Showing recent WhatsApp dispatches
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Channel</th>
                    <th className="py-2 px-3">Recipient</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Message ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {notificationLogs && notificationLogs.length > 0 ? (
                    notificationLogs.slice(0, 5).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3 font-bold text-sky-700">{log.channel}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">{log.recipient}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status === "SUCCESS"
                                ? "bg-emerald-100 text-emerald-800"
                                : log.status === "SIMULATED"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500 text-[10px]">
                          {log.provider_message_id}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="py-4 text-center text-slate-400 text-xs">
                        No notification logs recorded yet. Click [Test WhatsApp Alert] above to generate a test log.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
