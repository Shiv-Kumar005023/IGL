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
