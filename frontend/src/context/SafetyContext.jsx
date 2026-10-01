import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  fetchStats,
  fetchCameras,
  fetchAlerts,
  postAlertApi,
  acknowledgeAlertApi,
  resolveAlertApi,
  fetchObservations,
  recordObservationApi,
  checkPersonnelAnomalyApi,
  fetchRestrictedZones,
  postRestrictedZoneApi,
  fetchAnalyticsApi,
  registerCameraApi
} from "../services/api";

const SafetyContext = createContext(null);

export function SafetyProvider({ children }) {
  // Navigation State
  const [activeTab, setActiveTab] = useState("dashboard");

  // Live Camera Input State
  const [activeStream, setActiveStream] = useState(null);
  const [streamSource, setStreamSource] = useState(null);
  const [personCount, setPersonCount] = useState(0); // Detected people count (Default: 0 persons)
  const [streamMetrics, setStreamMetrics] = useState({
    fps: 0,
    width: 0,
    height: 0,
    brightness: 0,
    blurScore: 0,
    latencyMs: 12,
    isAssessable: true,
    notAssessableReason: ""
  });

  // DB Synced States
  const [stats, setStats] = useState({
    cameras_online: 0,
    active_alerts: 0,
    ppe_violations: 0,
    restricted_breaches: 0,
    near_misses: 0,
    unrecognized_personnel: 0,
    total_observations: 0,
    has_live_input: false
  });

  const [alerts, setAlerts] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [observations, setObservations] = useState([]);
  const [restrictedZones, setRestrictedZones] = useState([]);
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  // Audio alert trigger
  const playAlertSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  }, []);

  // Synchronize state with SQLite backend
  const refreshBackendData = useCallback(async () => {
    const newStats = await fetchStats();
    if (newStats) setStats(newStats);

    const newAlerts = await fetchAlerts();
    if (newAlerts) setAlerts(newAlerts);

    const newCams = await fetchCameras();
    if (newCams) setCameras(newCams);

    const newObs = await fetchObservations();
    if (newObs) setObservations(newObs);

    const newZones = await fetchRestrictedZones();
    if (newZones) setRestrictedZones(newZones);
  }, []);

  // Poll SQLite DB every 3 seconds for updates
  useEffect(() => {
    refreshBackendData();
    const interval = setInterval(refreshBackendData, 3000);
    return () => clearInterval(interval);
  }, [refreshBackendData]);

  // Connect Webcam Stream
  const connectWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
      });
      setActiveStream(stream);
      const camConfig = { type: "webcam", name: "Webcam Input (HD)", url: "local://webcam" };
      setStreamSource(camConfig);

      await registerCameraApi({ name: camConfig.name, source_type: "webcam", source_url: camConfig.url });
      await refreshBackendData();
      return { success: true, stream };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Connect RTSP URL
  const connectRtsp = async (rtspUrl, name = "IP Camera RTSP") => {
    const camConfig = { type: "rtsp", name: name || "IP RTSP Camera", url: rtspUrl };
    setStreamSource(camConfig);
    await registerCameraApi({ name: camConfig.name, source_type: "rtsp", source_url: rtspUrl });
    await refreshBackendData();
    return { success: true };
  };

  // Connect Video File Upload
  const connectVideoFile = async (file) => {
    const fileUrl = URL.createObjectURL(file);
    const camConfig = { type: "file", name: `File: ${file.name}`, url: fileUrl };
    setStreamSource(camConfig);
    await registerCameraApi({ name: camConfig.name, source_type: "file", source_url: file.name });
    await refreshBackendData();
    return { success: true, fileUrl };
  };

  // Disconnect Stream
  const disconnectStream = () => {
    if (activeStream && activeStream.getTracks) {
      activeStream.getTracks().forEach((track) => track.stop());
    }
    setActiveStream(null);
    setStreamSource(null);
    setPersonCount(0);
    setStreamMetrics({
      fps: 0,
      width: 0,
      height: 0,
      brightness: 0,
      blurScore: 0,
      latencyMs: 0,
      isAssessable: true,
      notAssessableReason: ""
    });
    refreshBackendData();
  };

  // Dispatch Real Event (Persists to SQLite Database)
  const dispatchAlert = async (eventData) => {
    playAlertSound();
    const payload = {
      event_type: eventData.event_type,
      camera_id: streamSource?.name || "CAM-LIVE",
      camera_name: streamSource?.name || "Live Stream",
      zone_name: eventData.zone_name || "Zone A",
      severity: eventData.severity || "HIGH",
      confidence: eventData.confidence || 0.94,
      evidence_image_base64: eventData.evidence_image_base64 || "",
      metadata: eventData.metadata || {}
    };

    const result = await postAlertApi(payload);
    await refreshBackendData();
    return result;
  };

  // Record Person Observation to SQLite DB (Only for actual detected persons)
  const recordObservation = async (obsData = {}) => {
    if (!obsData || !obsData.track_id) {
      return null;
    }

    const payload = {
      track_id: obsData.track_id,
      camera_id: streamSource?.name || "Refinery Cam 1",
      zone_name: obsData.zone_name || "Walkway Area A",
      object_type: obsData.object_type || "person",
      bounding_box: obsData.bounding_box || [0.22, 0.28, 0.15, 0.48],
      feature_vector: obsData.feature_vector || { r_avg: 120, g_avg: 140, b_avg: 160 },
      confidence: obsData.confidence || 0.95
    };

    const res = await recordObservationApi(payload);
    await refreshBackendData();
    return res;
  };

  // Acknowledge Alert
  const acknowledgeAlert = async (alertId, user = "Safety Controller") => {
    await acknowledgeAlertApi(alertId, user);
    await refreshBackendData();
  };

  // Resolve Alert
  const resolveAlert = async (alertId, notes, user = "Plant Safety Manager") => {
    await resolveAlertApi(alertId, notes, user);
    await refreshBackendData();
  };

  // Save Restricted Zone ROI to SQLite
  const addRestrictedZone = async (zoneName, polygonCoords) => {
    await postRestrictedZoneApi({
      camera_id: streamSource?.name || "CAM-LIVE",
      zone_name: zoneName,
      polygon_coords: polygonCoords
    });
    await refreshBackendData();
  };

  return (
    <SafetyContext.Provider
      value={{
        activeTab,
        setActiveTab,
        activeStream,
        streamSource,
        personCount,
        setPersonCount,
        streamMetrics,
        setStreamMetrics,
        connectWebcam,
        connectRtsp,
        connectVideoFile,
        disconnectStream,
        stats,
        alerts,
        cameras,
        observations,
        restrictedZones,
        dispatchAlert,
        recordObservation,
        acknowledgeAlert,
        resolveAlert,
        addRestrictedZone,
        selectedEvidence,
        setSelectedEvidence,
        refreshBackendData
      }}
    >
      {children}
    </SafetyContext.Provider>
  );
}

export function useSafety() {
  const ctx = useContext(SafetyContext);
  if (!ctx) throw new Error("useSafety must be used within SafetyProvider");
  return ctx;
}
