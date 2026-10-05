const API_BASE = "http://127.0.0.1:8000/api";

export async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    if (!res.ok) throw new Error("Failed to fetch dashboard stats");
    return await res.json();
  } catch (err) {
    console.warn("Backend offline or unreachable:", err);
    return null;
  }
}

export async function detectYoloObjectsApi(imageBase64, conf = 0.10, imgsz = 1280) {
  try {
    const res = await fetch(`${API_BASE}/yolo/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64, conf, imgsz })
    });
    if (!res.ok) throw new Error("YOLO API error");
    return await res.json();
  } catch (err) {
    console.warn("Backend YOLO API unreachable:", err);
    return null;
  }
}

export async function fetchCameras() {
  try {
    const res = await fetch(`${API_BASE}/cameras`);
    if (!res.ok) throw new Error("Failed to fetch cameras");
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function registerCameraApi(cameraData) {
  try {
    const res = await fetch(`${API_BASE}/cameras`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cameraData)
    });
    return await res.json();
  } catch (err) {
    console.error("Camera registration failed:", err);
    return null;
  }
}

export async function updateCameraStatusApi(cameraId, statusData) {
  try {
    const res = await fetch(`${API_BASE}/cameras/${cameraId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(statusData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchAlerts() {
  try {
    const res = await fetch(`${API_BASE}/alerts`);
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function postAlertApi(alertData) {
  try {
    const res = await fetch(`${API_BASE}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alertData)
    });
    return await res.json();
  } catch (err) {
    console.error("Failed to store alert in backend:", err);
    return null;
  }
}

export async function acknowledgeAlertApi(alertId, user = "Controller") {
  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function resolveAlertApi(alertId, notes, user = "Safety Manager") {
  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, user })
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchObservations() {
  try {
    const res = await fetch(`${API_BASE}/observations`);
    if (!res.ok) throw new Error("Failed to fetch observations");
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function recordObservationApi(observationData) {
  try {
    const res = await fetch(`${API_BASE}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(observationData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function checkPersonnelAnomalyApi(featureVector) {
  try {
    const res = await fetch(`${API_BASE}/personnel/check-anomaly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature_vector: featureVector })
    });
    return await res.json();
  } catch (err) {
    return { status: "INSUFFICIENT_HISTORICAL_DATA", reason: "Backend connection error" };
  }
}

export async function fetchRestrictedZones(cameraId = null) {
  try {
    const url = cameraId ? `${API_BASE}/restricted-zones?camera_id=${cameraId}` : `${API_BASE}/restricted-zones`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch zones");
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function postRestrictedZoneApi(zoneData) {
  try {
    const res = await fetch(`${API_BASE}/restricted-zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(zoneData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchAnalyticsApi() {
  try {
    const res = await fetch(`${API_BASE}/analytics`);
    if (!res.ok) throw new Error("Failed to fetch analytics");
    return await res.json();
  } catch (err) {
    return { has_data: false, message: "No data available for analytics" };
  }
}

export async function processFrameQualityApi(imageBase64) {
  try {
    const res = await fetch(`${API_BASE}/process-frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 })
    });
    return await res.json();
  } catch (err) {
    return { is_assessable: false, reason: "Unable to inspect frame via server" };
  }
}

// ----------------------------------------------------
// PERSONNEL MONITORING API HELPERS
// ----------------------------------------------------
export async function fetchPersonnelRulesApi() {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/rules`);
    if (!res.ok) throw new Error("Failed to fetch rules");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function createPersonnelRuleApi(ruleData) {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function updatePersonnelRuleApi(ruleId, ruleData) {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function deletePersonnelRuleApi(ruleId) {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/rules/${ruleId}`, {
      method: "DELETE"
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchPersonnelEventsApi() {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/events`);
    if (!res.ok) throw new Error("Failed to fetch events");
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function postPersonnelEventApi(eventData) {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function acknowledgePersonnelEventApi(eventId, user = "Controller") {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/events/${eventId}/acknowledge`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function resolvePersonnelEventApi(eventId, notes = "Verified", user = "Safety Manager") {
  try {
    const res = await fetch(`${API_BASE}/personnel-monitoring/events/${eventId}/resolve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes, user })
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

// ----------------------------------------------------
// EXPECTED PERSONNEL & WHATSAPP NOTIFICATION API HELPERS
// ----------------------------------------------------
export async function fetchExpectedPersonnelRulesApi() {
  try {
    const res = await fetch(`${API_BASE}/expected-personnel/rules`);
    if (!res.ok) throw new Error("Failed to fetch expected personnel rules");
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function createExpectedPersonnelRuleApi(ruleData) {
  try {
    const res = await fetch(`${API_BASE}/expected-personnel/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function updateExpectedPersonnelRuleApi(ruleId, ruleData) {
  try {
    const res = await fetch(`${API_BASE}/expected-personnel/rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ruleData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function deleteExpectedPersonnelRuleApi(ruleId) {
  try {
    const res = await fetch(`${API_BASE}/expected-personnel/rules/${ruleId}`, {
      method: "DELETE"
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchWhatsAppStatusApi() {
  try {
    const res = await fetch(`${API_BASE}/notifications/whatsapp/status`);
    if (!res.ok) throw new Error("Failed to fetch WhatsApp status");
    return await res.json();
  } catch (err) {
    return { status: "MOCK MODE", mode: "MOCK", is_configured: false, controller_number: "" };
  }
}

export async function testWhatsAppAlertApi(controllerWhatsapp = null) {
  try {
    const res = await fetch(`${API_BASE}/notifications/whatsapp/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controller_whatsapp: controllerWhatsapp })
    });
    return await res.json();
  } catch (err) {
    return { success: false, status: "FAILED", message: "Failed to connect to backend service" };
  }
}

export async function sendUnknownPersonAlertApi(eventData) {
  try {
    const res = await fetch(`${API_BASE}/notifications/whatsapp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function fetchNotificationLogsApi() {
  try {
    const res = await fetch(`${API_BASE}/notifications/logs`);
    if (!res.ok) throw new Error("Failed to fetch notification logs");
    return await res.json();
  } catch (err) {
    return [];
  }
}

// ----------------------------------------------------
// REGISTERED PERSONNEL IDENTITY API HELPERS
// ----------------------------------------------------
export async function fetchRegisteredPersonnelApi() {
  try {
    const res = await fetch(`${API_BASE}/registered-personnel`);
    if (!res.ok) throw new Error("Failed to fetch registered personnel");
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function createRegisteredPersonnelApi(personData) {
  try {
    const res = await fetch(`${API_BASE}/registered-personnel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function updateRegisteredPersonnelApi(personId, personData) {
  try {
    const res = await fetch(`${API_BASE}/registered-personnel/${personId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personData)
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function deleteRegisteredPersonnelApi(personId) {
  try {
    const res = await fetch(`${API_BASE}/registered-personnel/${personId}`, {
      method: "DELETE"
    });
    return await res.json();
  } catch (err) {
    return null;
  }
}

