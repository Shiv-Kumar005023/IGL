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
  registerCameraApi,
  fetchPersonnelRulesApi,
  createPersonnelRuleApi,
  updatePersonnelRuleApi,
  deletePersonnelRuleApi,
  fetchPersonnelEventsApi,
  postPersonnelEventApi,
  acknowledgePersonnelEventApi,
  resolvePersonnelEventApi,
  fetchExpectedPersonnelRulesApi,
  createExpectedPersonnelRuleApi,
  updateExpectedPersonnelRuleApi,
  deleteExpectedPersonnelRuleApi,
  fetchWhatsAppStatusApi,
  testWhatsAppAlertApi,
  sendUnknownPersonAlertApi,
  fetchNotificationLogsApi,
  fetchRegisteredPersonnelApi,
  createRegisteredPersonnelApi,
  updateRegisteredPersonnelApi,
  deleteRegisteredPersonnelApi
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

  // Personnel Monitoring DB States
  const [personnelRules, setPersonnelRules] = useState([
    {
      id: 1,
      camera_id: "Gate Camera 01",
      camera_name: "Gate Camera 01 (Main Entry)",
      area_id: "Main Entry Area",
      schedule_date: "ALL",
      start_time: "00:00",
      end_time: "23:59",
      expected_person_count: 2,
      verification_duration: 10,
      cooldown: 60,
      enabled: 1
    }
  ]);
  const [personnelEvents, setPersonnelEvents] = useState([]);

  // Registered Personnel Identity DB State
  const [registeredPersonnel, setRegisteredPersonnel] = useState([
    { id: "EMP-101", track_id: "TRK-P101", name: "Shiv Kumar", designation: "Senior Field Engineer", department: "Refinery Operations" },
    { id: "EMP-102", track_id: "TRK-P102", name: "Rajesh Sharma", designation: "Plant Safety Officer", department: "HSE Department" }
  ]);

  // Expected Personnel & WhatsApp Notification States
  const [expectedPersonnelRules, setExpectedPersonnelRules] = useState([]);
  const [whatsappStatus, setWhatsappStatus] = useState({
    status: "MOCK MODE",
    mode: "MOCK",
    is_configured: false,
    controller_number: ""
  });
  const [notificationLogs, setNotificationLogs] = useState([]);

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

  // Synchronize state with SQLite backend (Parallel Async Processing for Maximum Speed)
  const refreshBackendData = useCallback(async () => {
    try {
      const [
        newStats,
        newAlerts,
        newCams,
        newObs,
        newZones,
        rules,
        pEvents,
        expRules,
        waStatus,
        logs,
        regPersonnel
      ] = await Promise.all([
        fetchStats(),
        fetchAlerts(),
        fetchCameras(),
        fetchObservations(),
        fetchRestrictedZones(),
        fetchPersonnelRulesApi(),
        fetchPersonnelEventsApi(),
        fetchExpectedPersonnelRulesApi(),
        fetchWhatsAppStatusApi(),
        fetchNotificationLogsApi(),
        fetchRegisteredPersonnelApi()
      ]);

      if (newStats) setStats(newStats);
      if (newAlerts) setAlerts(newAlerts);
      if (newCams) setCameras(newCams);
      if (newObs) setObservations(newObs);
      if (newZones) setRestrictedZones(newZones);
      if (rules !== null && Array.isArray(rules)) setPersonnelRules(rules);
      if (pEvents !== null && Array.isArray(pEvents)) setPersonnelEvents(pEvents);
      if (expRules) setExpectedPersonnelRules(expRules);
      if (waStatus) setWhatsappStatus(waStatus);
      if (logs) setNotificationLogs(logs);
      if (regPersonnel && regPersonnel.length > 0) setRegisteredPersonnel(regPersonnel);
    } catch (err) {
      console.warn("Backend sync warning:", err);
    }
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

  // Connect Image File Upload (JPG, JPEG, PNG)
  const connectImageFile = async (file) => {
    const fileUrl = URL.createObjectURL(file);
    const camConfig = { type: "image", name: `Image: ${file.name}`, url: fileUrl };
    setStreamSource(camConfig);
    await registerCameraApi({ name: camConfig.name, source_type: "image", source_url: file.name });
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

  // Personnel Monitoring Schedule Actions
  const addPersonnelRule = async (ruleData) => {
    const tempRule = {
      id: Date.now(),
      camera_id: ruleData.camera_id || "Gate Camera 01",
      camera_name: ruleData.camera_id || "Gate Camera 01",
      area_id: ruleData.area_id || "Main Entry Area",
      schedule_date: ruleData.schedule_date || "ALL",
      start_time: ruleData.start_time || "00:00",
      end_time: ruleData.end_time || "23:59",
      expected_person_count: Number(ruleData.expected_person_count) ?? 2,
      verification_duration: Number(ruleData.verification_duration) ?? 10,
      cooldown: 60,
      enabled: 1
    };
    setPersonnelRules((prev) => [tempRule, ...prev.filter((r) => r.id !== tempRule.id)]);
    const res = await createPersonnelRuleApi(ruleData);
    if (res && res.rule_id) {
      tempRule.id = res.rule_id;
      setPersonnelRules((prev) => [
        tempRule,
        ...prev.filter((r) => r.id !== tempRule.id && r.id !== res.rule_id)
      ]);
    }
    await refreshBackendData();
    return res || tempRule;
  };

  const updatePersonnelRule = async (ruleId, ruleData) => {
    setPersonnelRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, ...ruleData } : r))
    );
    const res = await updatePersonnelRuleApi(ruleId, ruleData);
    await refreshBackendData();
    return res;
  };

  const removePersonnelRule = async (ruleId) => {
    setPersonnelRules((prev) => prev.filter((r) => r.id !== ruleId));
    const res = await deletePersonnelRuleApi(ruleId);
    await refreshBackendData();
    return res;
  };

  const dispatchPersonnelEvent = async (eventData) => {
    playAlertSound();
    const res = await postPersonnelEventApi(eventData);
    refreshBackendData();
    return res;
  };

  const acknowledgePersonnelEvent = async (eventId, user = "Controller") => {
    setPersonnelEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, status: "ACKNOWLEDGED" } : e))
    );
    await acknowledgePersonnelEventApi(eventId, user);
    refreshBackendData();
  };

  const resolvePersonnelEvent = async (eventId, notes = "Verified", user = "Safety Manager") => {
    setPersonnelEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, status: "RESOLVED" } : e))
    );
    await resolvePersonnelEventApi(eventId, notes, user);
    refreshBackendData();
  };

  // Expected Personnel Rule Actions
  const addExpectedPersonnelRule = async (ruleData) => {
    const tempRule = { id: Date.now(), ...ruleData, enabled: 1 };
    setExpectedPersonnelRules((prev) => [tempRule, ...prev]);
    const res = await createExpectedPersonnelRuleApi(ruleData);
    refreshBackendData();
    return res;
  };

  const updateExpectedPersonnelRule = async (ruleId, ruleData) => {
    setExpectedPersonnelRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, ...ruleData } : r))
    );
    const res = await updateExpectedPersonnelRuleApi(ruleId, ruleData);
    refreshBackendData();
    return res;
  };

  const removeExpectedPersonnelRule = async (ruleId) => {
    setExpectedPersonnelRules((prev) => prev.filter((r) => r.id !== ruleId));
    const res = await deleteExpectedPersonnelRuleApi(ruleId);
    refreshBackendData();
    return res;
  };

  // WhatsApp Alert Testing and Dispatch
  const triggerTestWhatsApp = async (controllerWhatsapp = null) => {
    const res = await testWhatsAppAlertApi(controllerWhatsapp);
    await refreshBackendData();
    return res;
  };

  const triggerUnknownPersonWhatsAppAlert = async (eventData) => {
    playAlertSound();
    const res = await sendUnknownPersonAlertApi(eventData);
    await refreshBackendData();
    return res;
  };

  // Registered Personnel Identity Registration Handlers
  const registerPerson = async (personData) => {
    setRegisteredPersonnel((prev) => [
      ...prev.filter((p) => p.id !== personData.id && p.track_id !== personData.track_id),
      personData
    ]);
    const res = await createRegisteredPersonnelApi(personData);
    await refreshBackendData();
    return res;
  };

  const updatePersonRegistration = async (personId, personData) => {
    setRegisteredPersonnel((prev) =>
      prev.map((p) => (p.id === personId ? { ...p, ...personData } : p))
    );
    const res = await updateRegisteredPersonnelApi(personId, personData);
    await refreshBackendData();
    return res;
  };

  const removePersonRegistration = async (personId) => {
    setRegisteredPersonnel((prev) => prev.filter((p) => p.id !== personId));
    const res = await deleteRegisteredPersonnelApi(personId);
    await refreshBackendData();
    return res;
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
        connectImageFile,
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
        personnelRules,
        personnelEvents,
        addPersonnelRule,
        updatePersonnelRule,
        removePersonnelRule,
        dispatchPersonnelEvent,
        acknowledgePersonnelEvent,
        resolvePersonnelEvent,
        registeredPersonnel,
        registerPerson,
        updatePersonRegistration,
        removePersonRegistration,
        expectedPersonnelRules,
        whatsappStatus,
        notificationLogs,
        addExpectedPersonnelRule,
        updateExpectedPersonnelRule,
        removeExpectedPersonnelRule,
        triggerTestWhatsApp,
        triggerUnknownPersonWhatsAppAlert,
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
