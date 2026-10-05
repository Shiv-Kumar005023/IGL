from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import sqlite3
import json
import uuid
import base64
from datetime import datetime
import os

from database import init_db, get_db_connection
from ai_engine import assess_frame_quality, is_point_in_polygon, calculate_distance
from whatsapp_service import get_whatsapp_status_info, send_whatsapp_test, send_whatsapp_alert

app = FastAPI(title="IGL Industrial AI Safety Intelligence API", version="1.0.0")

# Enable CORS for frontend Vite application
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Database on Startup
@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/")
def read_root():
    return {
        "system": "IGL Industrial AI Safety Server",
        "status": "ONLINE",
        "database": "SQLite (igl_safety.db)",
        "mode": "REAL-TIME PRODUCTION PIPELINE"
    }

@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    """
    Returns statistics strictly calculated from actual SQLite database entries.
    If 0 cameras or 0 alerts exist, returns exact 0 values.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Active cameras
    cursor.execute("SELECT COUNT(*) FROM cameras WHERE status = 'ONLINE'")
    cameras_online = cursor.fetchone()[0]

    # Active (unresolved) alerts
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE status IN ('DETECTED', 'ACKNOWLEDGED', 'ESCALATED')")
    active_alerts = cursor.fetchone()[0]

    # Specific event counts (unresolved)
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE event_type = 'PPE_VIOLATION' AND status != 'RESOLVED'")
    ppe_violations = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM alerts WHERE event_type = 'RESTRICTED_ZONE' AND status != 'RESOLVED'")
    restricted_breaches = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM alerts WHERE event_type = 'NEAR_MISS' AND status != 'RESOLVED'")
    near_misses = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM alerts WHERE event_type = 'PERSONNEL_ANOMALY' AND status != 'RESOLVED'")
    unrecognized_personnel = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM alerts WHERE event_type = 'MOBILE_PHONE_USAGE' AND status != 'RESOLVED'")
    mobile_violations = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM alerts WHERE event_type IN ('SLEEPING_ON_DUTY', 'PERSONNEL_SLEEPING_ON_DUTY') AND status != 'RESOLVED'")
    sleeping_violations = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM observations")
    total_observations = cursor.fetchone()[0]

    conn.close()

    return {
        "cameras_online": cameras_online,
        "active_alerts": active_alerts,
        "ppe_violations": ppe_violations,
        "restricted_breaches": restricted_breaches,
        "near_misses": near_misses,
        "unrecognized_personnel": unrecognized_personnel,
        "mobile_violations": mobile_violations,
        "sleeping_violations": sleeping_violations,
        "total_observations": total_observations,
        "has_live_input": cameras_online > 0
    }

# ----------------------------------------------------
# CAMERA ENDPOINTS
# ----------------------------------------------------
@app.get("/api/cameras")
def list_cameras():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cameras ORDER BY last_seen DESC")
    rows = cursor.fetchall()
    conn.close()

    cameras = [dict(row) for row in rows]
    return cameras

@app.post("/api/cameras")
def register_camera(payload: dict = Body(...)):
    name = payload.get("name", "Camera Input")
    source_type = payload.get("source_type", "webcam") # 'webcam', 'rtsp', 'file'
    source_url = payload.get("source_url", "")
    
    conn = get_db_connection()
    cursor = conn.cursor()

    cam_id = f"CAM-{uuid.uuid4().hex[:6].upper()}"
    now = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO cameras (id, name, source_type, source_url, status, resolution, last_seen)
    VALUES (?, ?, ?, ?, 'ONLINE', '1920x1080', ?)
    """, (cam_id, name, source_type, source_url, now))

    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "camera": {"id": cam_id, "name": name, "source_type": source_type, "status": "ONLINE"}}

@app.put("/api/cameras/{camera_id}/status")
def update_camera_status(camera_id: str, payload: dict = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()

    status = payload.get("status", "ONLINE")
    reason = payload.get("not_assessable_reason", None)
    fps = payload.get("fps", 0.0)
    latency_ms = payload.get("latency_ms", 0.0)
    brightness = payload.get("brightness", 0.0)
    blur_score = payload.get("blur_score", 0.0)
    now = datetime.now().isoformat()

    cursor.execute("""
    UPDATE cameras 
    SET status = ?, not_assessable_reason = ?, fps = ?, latency_ms = ?, brightness = ?, blur_score = ?, last_seen = ?
    WHERE id = ?
    """, (status, reason, fps, latency_ms, brightness, blur_score, now, camera_id))

    conn.commit()
    conn.close()

    return {"status": "UPDATED", "camera_id": camera_id}

# ----------------------------------------------------
# FRAME QUALITY API (Real OpenCV Frame Inspection)
# ----------------------------------------------------
@app.post("/api/process-frame")
def process_frame(payload: dict = Body(...)):
    """
    Receives base64 frame from frontend video element, decodes bytes, runs actual brightness & blur check.
    """
    image_base64 = payload.get("image_base64", "")
    if not image_base64:
        return {"is_assessable": False, "reason": "No image data provided"}

    # Strip header if present
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]

    try:
        image_bytes = base64.b64decode(image_base64)
        quality = assess_frame_quality(image_bytes)
        return quality
    except Exception as e:
        return {"is_assessable": False, "reason": f"Frame decoding error: {str(e)}"}

# ----------------------------------------------------
# REAL BACKEND YOLO PHONE DETECTION ENGINE API
# ----------------------------------------------------
yolo_model_handle = None

def get_yolo_model():
    global yolo_model_handle
    if yolo_model_handle is None:
        try:
            from ultralytics import YOLO
            yolo_model_handle = YOLO('yolov8n.pt')
            print(f"✅ Backend PyTorch YOLO Model Loaded: {getattr(yolo_model_handle, 'ckpt_path', 'yolov8n.pt')}")
            print(f"   Model Classes: {len(yolo_model_handle.names)} classes. Cell phone class ID 67: {yolo_model_handle.names.get(67)}")
        except Exception as e:
            print(f"❌ Failed to load Ultralytics YOLO: {e}")
            yolo_model_handle = False
    return yolo_model_handle if yolo_model_handle is not False else None

@app.post("/api/yolo/detect")
def detect_yolo_objects(payload: dict = Body(...)):
    """
    Runs PyTorch YOLO model directly on frame image bytes.
    Accepts conf (default 0.10) and imgsz (default 1280).
    Returns raw YOLO detections with class_name, class_id, confidence, and normalized bounding box [norm_x, norm_y, norm_w, norm_h].
    """
    image_base64 = payload.get("image_base64", "")
    conf_thresh = float(payload.get("conf", 0.10))
    img_size = int(payload.get("imgsz", 1280))

    if not image_base64:
        return {"status": "ERROR", "message": "No image data provided", "detections": []}

    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]

    try:
        import numpy as np
        import cv2

        model = get_yolo_model()
        if not model:
            return {"status": "OFFLINE", "message": "Backend YOLO Model Unavailable", "detections": []}

        image_bytes = base64.b64decode(image_base64)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"status": "ERROR", "message": "Invalid image payload", "detections": []}

        h, w, _ = img.shape

        # Run PyTorch YOLO Inference directly on image (Requirements 1-6)
        results = model.predict(source=img, conf=conf_thresh, imgsz=img_size, save=False)
        result = results[0]

        detections = []
        raw_summary = []

        boxes = result.boxes
        if boxes is not None and len(boxes) > 0:
            for i, box in enumerate(boxes):
                cls_id = int(box.cls[0].item())
                cls_name = model.names.get(cls_id, str(cls_id))
                score = float(box.conf[0].item())
                xywh = box.xywh[0].tolist()

                # Calculate normalized bbox [norm_x, norm_y, norm_w, norm_h] in range 0..1
                cx, cy, bw, bh = xywh
                norm_x = max(0.0, min(1.0, (cx - bw / 2.0) / w))
                norm_y = max(0.0, min(1.0, (cy - bh / 2.0) / h))
                norm_w = max(0.0, min(1.0 - norm_x, bw / w))
                norm_h = max(0.0, min(1.0 - norm_y, bh / h))

                det_obj = {
                    "idx": i,
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": round(score, 4),
                    "bbox": [round(norm_x, 4), round(norm_y, 4), round(norm_w, 4), round(norm_h, 4)],
                    "pixel_bbox": [round(cx - bw/2, 1), round(cy - bh/2, 1), round(bw, 1), round(bh, 1)]
                }
                detections.append(det_obj)
                raw_summary.append(f"{cls_name} ({round(score*100)}%)")

        print(f"[BACKEND YOLO INFERENCE API] Image Size: {w}x{h} | Detections Count: {len(detections)} | Summary: {raw_summary}")

        return {
            "status": "SUCCESS",
            "model_path": getattr(model, 'ckpt_path', 'yolov8n.pt'),
            "model_name": "PyTorch YOLOv8",
            "imgsz": img_size,
            "conf": conf_thresh,
            "detections_count": len(detections),
            "detections": detections,
            "model_classes_count": len(model.names)
        }

    except Exception as e:
        print(f"❌ Backend YOLO Inference Error: {e}")
        return {"status": "ERROR", "message": str(e), "detections": []}

# ----------------------------------------------------
# ALERTS & EVIDENCE ENDPOINTS
# ----------------------------------------------------
@app.get("/api/alerts")
def get_alerts():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts ORDER BY detected_at DESC")
    rows = cursor.fetchall()
    conn.close()

    alerts = []
    for row in rows:
        item = dict(row)
        if item.get("metadata_json"):
            try:
                item["metadata"] = json.loads(item["metadata_json"])
            except:
                item["metadata"] = {}
        alerts.append(item)

    return alerts

@app.post("/api/alerts")
def create_alert(payload: dict = Body(...)):
    """
    Ingests a real detection alert generated from actual camera input processing.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    alert_id = f"ALT-{uuid.uuid4().hex[:8].upper()}"
    event_type = payload.get("event_type")
    camera_id = payload.get("camera_id")
    camera_name = payload.get("camera_name", "Live Stream")
    zone_name = payload.get("zone_name", "General Area")
    severity = payload.get("severity", "HIGH")
    confidence = payload.get("confidence", 0.90)
    evidence_image_base64 = payload.get("evidence_image_base64", "")
    metadata = payload.get("metadata", {})
    now = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO alerts (
        id, event_type, camera_id, camera_name, zone_name, severity, status, 
        confidence, evidence_image_base64, metadata_json, detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'DETECTED', ?, ?, ?, ?)
    """, (
        alert_id, event_type, camera_id, camera_name, zone_name, severity,
        confidence, evidence_image_base64, json.dumps(metadata), now
    ))

    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "alert_id": alert_id, "detected_at": now}

@app.put("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, payload: dict = Body(...)):
    user = payload.get("user", "Controller / Safety Officer")
    now = datetime.now().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    UPDATE alerts 
    SET status = 'ACKNOWLEDGED', acknowledged_at = ?, acknowledged_by = ?
    WHERE id = ?
    """, (now, user, alert_id))

    conn.commit()
    conn.close()

    return {"status": "ACKNOWLEDGED", "alert_id": alert_id, "time": now}

@app.put("/api/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, payload: dict = Body(...)):
    user = payload.get("user", "Safety Manager")
    notes = payload.get("notes", "On-site verification complete. Risk mitigated.")
    now = datetime.now().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    UPDATE alerts 
    SET status = 'RESOLVED', resolved_at = ?, resolved_by = ?, resolution_notes = ?
    WHERE id = ?
    """, (now, user, notes, alert_id))

    conn.commit()
    conn.close()

    return {"status": "RESOLVED", "alert_id": alert_id, "time": now}

# ----------------------------------------------------
# OBSERVATIONS & PERSONNEL ANOMALY ENDPOINTS
# ----------------------------------------------------
@app.get("/api/observations")
def get_observations():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM observations ORDER BY timestamp DESC LIMIT 50")
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]

@app.post("/api/observations")
def record_observation(payload: dict = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()

    track_id = payload.get("track_id", f"TRK-{uuid.uuid4().hex[:4]}")
    camera_id = payload.get("camera_id", "CAM-01")
    zone_name = payload.get("zone_name", "Zone A")
    object_type = payload.get("object_type", "person")
    bounding_box = payload.get("bounding_box", [0, 0, 0, 0])
    feature_vector = payload.get("feature_vector", {})
    confidence = payload.get("confidence", 0.92)
    now = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO observations (track_id, camera_id, zone_name, object_type, bounding_box, feature_vector, confidence, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (track_id, camera_id, zone_name, object_type, json.dumps(bounding_box), json.dumps(feature_vector), confidence, now))

    conn.commit()
    conn.close()

    return {"status": "RECORDED", "track_id": track_id}

@app.post("/api/personnel/check-anomaly")
def check_personnel_anomaly(payload: dict = Body(...)):
    """
    Compares observed person feature signature against actual stored SQLite observation history.
    If 0 historical observations exist, returns INSUFFICIENT_HISTORICAL_DATA.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM observations WHERE object_type = 'person'")
    total_history = cursor.fetchone()[0]

    if total_history < 3:
        conn.close()
        return {
            "status": "INSUFFICIENT_HISTORICAL_DATA",
            "reason": f"Only {total_history} observations in database. Minimum 3 required for baseline comparison.",
            "is_anomaly": False
        }

    # Retrieve stored feature signatures
    cursor.execute("SELECT track_id, feature_vector, timestamp FROM observations WHERE object_type = 'person'")
    records = cursor.fetchall()
    conn.close()

    current_vector = payload.get("feature_vector", {})
    
    # Simple color/signature similarity matching against stored history
    # Returns matched identity or declares NEW / UNRECOGNIZED personnel
    matched_track = None
    min_dist = 999.0

    for r in records:
        try:
            vec = json.loads(r["feature_vector"])
            # Compare feature vectors
            if current_vector and vec:
                diff = abs(current_vector.get("r_avg", 0) - vec.get("r_avg", 0)) + \
                       abs(current_vector.get("g_avg", 0) - vec.get("g_avg", 0)) + \
                       abs(current_vector.get("b_avg", 0) - vec.get("b_avg", 0))
                if diff < min_dist:
                    min_dist = diff
                    matched_track = r["track_id"]
        except:
            continue

    if min_dist < 45.0 and matched_track:
        return {
            "status": "MATCH_FOUND",
            "matched_id": matched_track,
            "similarity_score": round(1.0 - (min_dist / 255.0), 3),
            "is_anomaly": False
        }
    else:
        return {
            "status": "UNRECOGNIZED_PERSONNEL",
            "reason": f"No historical match found in database (Closest signature diff: {round(min_dist, 1)})",
            "is_anomaly": True
        }

# ----------------------------------------------------
# RESTRICTED ZONES ENDPOINTS
# ----------------------------------------------------
@app.get("/api/restricted-zones")
def get_restricted_zones(camera_id: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if camera_id:
        cursor.execute("SELECT * FROM restricted_zones WHERE camera_id = ?", (camera_id,))
    else:
        cursor.execute("SELECT * FROM restricted_zones")
    rows = cursor.fetchall()
    conn.close()

    zones = []
    for row in rows:
        z = dict(row)
        try:
            z["polygon_coords"] = json.loads(z["polygon_coords"])
        except:
            z["polygon_coords"] = []
        zones.append(z)

    return zones

@app.post("/api/restricted-zones")
def create_restricted_zone(payload: dict = Body(...)):
    camera_id = payload.get("camera_id")
    zone_name = payload.get("zone_name", "Restricted Area")
    polygon_coords = payload.get("polygon_coords", []) # [[x, y], ...]

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO restricted_zones (camera_id, zone_name, polygon_coords)
    VALUES (?, ?, ?)
    """, (camera_id, zone_name, json.dumps(polygon_coords)))

    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "message": "Restricted zone saved to SQLite database"}

# ----------------------------------------------------
# ANALYTICS ENDPOINT (Strictly calculated from DB)
# ----------------------------------------------------
@app.get("/api/analytics")
def get_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM alerts")
    total_alerts = cursor.fetchone()[0]

    if total_alerts == 0:
        conn.close()
        return {
            "has_data": False,
            "message": "No data available for analytics",
            "event_breakdown": [],
            "severity_breakdown": []
        }

    # Group by event type
    cursor.execute("SELECT event_type, COUNT(*) as count FROM alerts GROUP BY event_type")
    type_counts = [dict(r) for r in cursor.fetchall()]

    # Group by severity
    cursor.execute("SELECT severity, COUNT(*) as count FROM alerts GROUP BY severity")
    severity_counts = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "has_data": True,
        "total_alerts": total_alerts,
        "event_breakdown": type_counts,
        "severity_breakdown": severity_counts
    }

# ----------------------------------------------------
# PERSONNEL MONITORING ENDPOINTS
# ----------------------------------------------------
@app.get("/api/personnel-monitoring/rules")
def get_personnel_monitoring_rules():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM personnel_monitoring_rules ORDER BY start_time ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/personnel-monitoring/rules")
def create_personnel_monitoring_rule(payload: dict = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()

    camera_id = payload.get("camera_id", "Gate Camera 01")
    camera_name = payload.get("camera_name", payload.get("camera_id", "Gate Camera 01"))
    area_id = payload.get("area_id", "Main Entry Area")
    schedule_date = payload.get("schedule_date", "ALL")
    start_time = payload.get("start_time", "18:00")
    end_time = payload.get("end_time", "22:00")
    expected_person_count = int(payload.get("expected_person_count", 2))
    verification_duration = int(payload.get("verification_duration", 10))
    cooldown = int(payload.get("cooldown", 60))
    enabled = int(payload.get("enabled", 1))

    now = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO personnel_monitoring_rules (
        camera_id, camera_name, area_id, schedule_date, start_time, end_time,
        expected_person_count, verification_duration, cooldown, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        camera_id, camera_name, area_id, schedule_date, start_time, end_time,
        expected_person_count, verification_duration, cooldown, enabled, now, now
    ))

    rule_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "rule_id": rule_id, "message": "Personnel monitoring schedule rule created"}

@app.put("/api/personnel-monitoring/rules/{rule_id}")
def update_personnel_monitoring_rule(rule_id: int, payload: dict = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()

    camera_id = payload.get("camera_id", "Gate Camera 01")
    camera_name = payload.get("camera_name", camera_id)
    area_id = payload.get("area_id", "Main Entry Area")
    schedule_date = payload.get("schedule_date", "ALL")
    start_time = payload.get("start_time", "18:00")
    end_time = payload.get("end_time", "22:00")
    expected_person_count = int(payload.get("expected_person_count", 2))
    verification_duration = int(payload.get("verification_duration", 10))
    cooldown = int(payload.get("cooldown", 60))
    enabled = int(payload.get("enabled", 1))
    now = datetime.now().isoformat()

    cursor.execute("""
    UPDATE personnel_monitoring_rules
    SET camera_id = ?, camera_name = ?, area_id = ?, schedule_date = ?, start_time = ?, end_time = ?,
        expected_person_count = ?, verification_duration = ?, cooldown = ?, enabled = ?, updated_at = ?
    WHERE id = ?
    """, (
        camera_id, camera_name, area_id, schedule_date, start_time, end_time,
        expected_person_count, verification_duration, cooldown, enabled, now, rule_id
    ))

    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "rule_id": rule_id, "message": "Personnel monitoring rule updated"}

@app.delete("/api/personnel-monitoring/rules/{rule_id}")
def delete_personnel_monitoring_rule(rule_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM personnel_monitoring_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    return {"status": "SUCCESS", "rule_id": rule_id, "message": "Personnel monitoring rule deleted"}

@app.get("/api/personnel-monitoring/events")
def get_personnel_monitoring_events():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM personnel_monitoring_events ORDER BY timestamp DESC LIMIT 50")
    rows = cursor.fetchall()
    conn.close()

    events = []
    for row in rows:
        evt = dict(row)
        if evt.get("track_ids"):
            try:
                evt["track_ids"] = json.loads(evt["track_ids"])
            except:
                evt["track_ids"] = []
        events.append(evt)

    return events

@app.post("/api/personnel-monitoring/events")
def create_personnel_monitoring_event(payload: dict = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()

    event_id = f"PME-{uuid.uuid4().hex[:8].upper()}"
    rule_id = payload.get("rule_id", None)
    camera_id = payload.get("camera_id", "Gate Camera 01")
    camera_name = payload.get("camera_name", "Gate Camera 01")
    area_name = payload.get("area_name", "Configured Area")
    expected_count = int(payload.get("expected_count", 2))
    observed_count = int(payload.get("observed_count", 5))
    additional_count = int(payload.get("additional_count", max(0, observed_count - expected_count)))
    verification_duration = int(payload.get("verification_duration", 10))
    evidence_reference = payload.get("evidence_reference", "")
    track_ids = payload.get("track_ids", [])
    now = datetime.now().isoformat()

    # Record event in personnel_monitoring_events table
    cursor.execute("""
    INSERT INTO personnel_monitoring_events (
        id, rule_id, camera_id, camera_name, area_name, timestamp,
        expected_count, observed_count, additional_count, verification_duration,
        status, evidence_reference, track_ids
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DETECTED', ?, ?)
    """, (
        event_id, rule_id, camera_id, camera_name, area_name, now,
        expected_count, observed_count, additional_count, verification_duration,
        evidence_reference, json.dumps(track_ids)
    ))

    # Also register in central alerts table as PERSONNEL_ANOMALY
    alert_id = f"ALT-PME-{uuid.uuid4().hex[:6].upper()}"
    metadata = {
        "expected_count": expected_count,
        "observed_count": observed_count,
        "additional_count": additional_count,
        "verification_duration": verification_duration,
        "track_ids": track_ids,
        "pme_event_id": event_id
    }

    cursor.execute("""
    INSERT INTO alerts (
        id, event_type, camera_id, camera_name, zone_name, severity, status, 
        confidence, evidence_image_base64, metadata_json, detected_at
    ) VALUES (?, 'PERSONNEL_ANOMALY', ?, ?, ?, 'HIGH', 'DETECTED', 0.98, ?, ?, ?)
    """, (
        alert_id, camera_id, camera_name, area_name,
        evidence_reference, json.dumps(metadata), now
    ))

    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "event_id": event_id, "alert_id": alert_id, "timestamp": now}

@app.put("/api/personnel-monitoring/events/{event_id}/acknowledge")
def acknowledge_personnel_monitoring_event(event_id: str, payload: dict = Body(...)):
    user = payload.get("user", "Controller / Safety Officer")
    now = datetime.now().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    UPDATE personnel_monitoring_events 
    SET status = 'ACKNOWLEDGED', acknowledged_at = ?, acknowledged_by = ?
    WHERE id = ?
    """, (now, user, event_id))

    # Sync linked alert if present
    cursor.execute("""
    UPDATE alerts 
    SET status = 'ACKNOWLEDGED', acknowledged_at = ?, acknowledged_by = ?
    WHERE metadata_json LIKE ?
    """, (now, user, f'%"{event_id}"%'))

    conn.commit()
    conn.close()

    return {"status": "ACKNOWLEDGED", "event_id": event_id, "time": now}

@app.put("/api/personnel-monitoring/events/{event_id}/resolve")
def resolve_personnel_monitoring_event(event_id: str, payload: dict = Body(...)):
    user = payload.get("user", "Safety Manager")
    notes = payload.get("notes", "Personnel count verified and anomaly resolved.")
    now = datetime.now().isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    UPDATE personnel_monitoring_events 
    SET status = 'RESOLVED', resolved_at = ?, resolved_by = ?
    WHERE id = ?
    """, (now, user, event_id))

    # Sync linked alert if present
    cursor.execute("""
    UPDATE alerts 
    SET status = 'RESOLVED', resolved_at = ?, resolved_by = ?, resolution_notes = ?
    WHERE metadata_json LIKE ?
    """, (now, user, notes, f'%"{event_id}"%'))

    conn.commit()
    conn.close()

    return {"status": "RESOLVED", "event_id": event_id, "time": now}

# ----------------------------------------------------
# EXPECTED PERSONNEL & UNKNOWN PERSON ALERT ENDPOINTS
# ----------------------------------------------------
@app.get("/api/expected-personnel/rules")
def get_expected_personnel_rules():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expected_personnel_rules ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/expected-personnel/rules")
def create_expected_personnel_rule(payload: dict = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()

    rule_name = payload.get("rule_name", "Expected Personnel Rule")
    zone_name = payload.get("zone_name", "Main Plant Area")
    camera_id = payload.get("camera_id", "Gate Camera 01")
    start_time = payload.get("start_time", "19:00")
    end_time = payload.get("end_time", "06:00")
    expected_person_count = int(payload.get("expected_person_count", 2))
    verification_duration = int(payload.get("verification_duration", 10))
    cooldown = int(payload.get("cooldown", 300))
    controller_whatsapp = payload.get("controller_whatsapp", "")
    whatsapp_enabled = 1 if payload.get("whatsapp_enabled", True) else 0
    enabled = 1 if payload.get("enabled", True) else 0
    now = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO expected_personnel_rules (
        rule_name, zone_name, camera_id, start_time, end_time, expected_person_count,
        verification_duration, cooldown, controller_whatsapp, whatsapp_enabled, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        rule_name, zone_name, camera_id, start_time, end_time, expected_person_count,
        verification_duration, cooldown, controller_whatsapp, whatsapp_enabled, enabled, now, now
    ))

    rule_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "rule_id": rule_id, "message": "Expected Personnel Rule saved successfully"}

@app.put("/api/expected-personnel/rules/{rule_id}")
def update_expected_personnel_rule(rule_id: int, payload: dict = Body(...)):
    conn = get_db_connection()
    cursor = conn.cursor()

    rule_name = payload.get("rule_name", "Expected Personnel Rule")
    zone_name = payload.get("zone_name", "Main Plant Area")
    camera_id = payload.get("camera_id", "Gate Camera 01")
    start_time = payload.get("start_time", "19:00")
    end_time = payload.get("end_time", "06:00")
    expected_person_count = int(payload.get("expected_person_count", 2))
    verification_duration = int(payload.get("verification_duration", 10))
    cooldown = int(payload.get("cooldown", 300))
    controller_whatsapp = payload.get("controller_whatsapp", "")
    whatsapp_enabled = 1 if payload.get("whatsapp_enabled", True) else 0
    enabled = 1 if payload.get("enabled", True) else 0
    now = datetime.now().isoformat()

    cursor.execute("""
    UPDATE expected_personnel_rules
    SET rule_name = ?, zone_name = ?, camera_id = ?, start_time = ?, end_time = ?,
        expected_person_count = ?, verification_duration = ?, cooldown = ?,
        controller_whatsapp = ?, whatsapp_enabled = ?, enabled = ?, updated_at = ?
    WHERE id = ?
    """, (
        rule_name, zone_name, camera_id, start_time, end_time, expected_person_count,
        verification_duration, cooldown, controller_whatsapp, whatsapp_enabled, enabled, now, rule_id
    ))

    conn.commit()
    conn.close()

    return {"status": "SUCCESS", "rule_id": rule_id, "message": "Expected Personnel Rule updated successfully"}

@app.delete("/api/expected-personnel/rules/{rule_id}")
def delete_expected_personnel_rule(rule_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expected_personnel_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    return {"status": "SUCCESS", "rule_id": rule_id, "message": "Expected Personnel Rule deleted successfully"}

# ----------------------------------------------------
# WHATSAPP NOTIFICATION ENDPOINTS
# ----------------------------------------------------
@app.get("/api/notifications/whatsapp/status")
def get_whatsapp_status():
    """
    Returns WhatsApp API connection status, mode (MOCK/LIVE), and last notification log.
    Never exposes secrets or API access tokens.
    """
    return get_whatsapp_status_info()

@app.post("/api/notifications/whatsapp/test")
def test_whatsapp_notification(payload: dict = Body({})):
    """
    Triggered by [Test WhatsApp Alert] button in settings.
    In mock mode: logs message to terminal and returns SIMULATED status.
    In live mode: executes WhatsApp Cloud API call securely.
    """
    recipient = payload.get("controller_whatsapp", None)
    result = send_whatsapp_test(recipient_override=recipient)
    return result

@app.post("/api/notifications/whatsapp/send")
def send_unknown_person_whatsapp_alert(payload: dict = Body(...)):
    """
    Backend service endpoint triggered when an Unknown/Unaccounted Person Event passes temporal verification.
    Registers alert in central alerts DB table and sends WhatsApp notification.
    """
    event_id = payload.get("eventId", f"EVT-UNK-{uuid.uuid4().hex[:8].upper()}")
    zone = payload.get("zone", "Main Plant Area")
    camera = payload.get("camera", "Gate Camera 01")
    expected_count = int(payload.get("expectedCount", 2))
    detected_count = int(payload.get("detectedCount", 5))
    additional_count = int(payload.get("additionalCount", max(0, detected_count - expected_count)))
    track_ids = payload.get("involvedTrackIds", ["TRK-P103", "TRK-P104", "TRK-P105"])
    evidence_image = payload.get("evidenceSnapshot", "")
    now = datetime.now().isoformat()

    # Register in central alerts table as UNKNOWN_PERSON
    conn = get_db_connection()
    cursor = conn.cursor()
    
    alert_id = f"ALT-UNK-{uuid.uuid4().hex[:6].upper()}"
    metadata = {
        "event_id": event_id,
        "expected_count": expected_count,
        "detected_count": detected_count,
        "additional_count": additional_count,
        "track_ids": track_ids,
        "source": "LIVE_CAMERA",
        "mode": "PROTOTYPE",
        "verification_status": "REVIEW REQUIRED"
    }

    cursor.execute("""
    INSERT INTO alerts (
        id, event_type, camera_id, camera_name, zone_name, severity, status, 
        confidence, evidence_image_base64, metadata_json, detected_at
    ) VALUES (?, 'UNKNOWN_PERSON', ?, ?, ?, 'HIGH', 'DETECTED', 0.96, ?, ?, ?)
    """, (
        alert_id, camera, camera, zone, evidence_image, json.dumps(metadata), now
    ))
    conn.commit()
    conn.close()

    # Send WhatsApp notification via whatsapp_service
    wa_result = send_whatsapp_alert(payload)

    return {
        "status": "SUCCESS",
        "event_id": event_id,
        "alert_id": alert_id,
        "whatsapp_result": wa_result
    }

@app.get("/api/notifications/logs")
def get_notification_logs():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notification_logs ORDER BY timestamp DESC LIMIT 50")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

# ----------------------------------------------------
# REGISTERED PERSONNEL IDENTITY ENDPOINTS
# ----------------------------------------------------
@app.get("/api/registered-personnel")
def list_registered_personnel():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM registered_personnel ORDER BY registered_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/registered-personnel")
def create_registered_person(payload: dict = Body(...)):
    person_id = payload.get("id") or f"EMP-{uuid.uuid4().hex[:4].upper()}"
    track_id = payload.get("track_id") or ""
    name = payload.get("name", "Registered Worker")
    designation = payload.get("designation", "Registered Worker")
    department = payload.get("department", "Operations")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO registered_personnel (id, track_id, name, designation, department)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        track_id = excluded.track_id,
        name = excluded.name,
        designation = excluded.designation,
        department = excluded.department,
        updated_at = CURRENT_TIMESTAMP
    """, (person_id, track_id, name, designation, department))

    conn.commit()
    conn.close()
    return {
        "status": "SUCCESS",
        "id": person_id,
        "track_id": track_id,
        "name": name,
        "designation": designation,
        "department": department
    }

@app.put("/api/registered-personnel/{person_id}")
def update_registered_person(person_id: str, payload: dict = Body(...)):
    name = payload.get("name")
    track_id = payload.get("track_id")
    designation = payload.get("designation")
    department = payload.get("department")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    UPDATE registered_personnel
    SET name = COALESCE(?, name),
        track_id = COALESCE(?, track_id),
        designation = COALESCE(?, designation),
        department = COALESCE(?, department),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    """, (name, track_id, designation, department, person_id))

    conn.commit()
    conn.close()
    return {"status": "SUCCESS", "id": person_id}

@app.delete("/api/registered-personnel/{person_id}")
def delete_registered_person(person_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM registered_personnel WHERE id = ?", (person_id,))
    conn.commit()
    conn.close()
    return {"status": "SUCCESS", "id": person_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

