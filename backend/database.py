import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "igl_safety.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Cameras Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cameras (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL, -- 'webcam', 'rtsp', 'file'
        source_url TEXT,
        status TEXT DEFAULT 'DISCONNECTED', -- 'ONLINE', 'OFFLINE', 'NOT_ASSESSABLE'
        not_assessable_reason TEXT,
        fps REAL DEFAULT 0.0,
        latency_ms REAL DEFAULT 0.0,
        brightness REAL DEFAULT 0.0,
        blur_score REAL DEFAULT 0.0,
        resolution TEXT,
        last_seen TIMESTAMP
    )
    """)

    # Restricted Zones Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS restricted_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id TEXT NOT NULL,
        zone_name TEXT NOT NULL,
        polygon_coords TEXT NOT NULL, -- JSON array of [x, y] normalized coordinates
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(camera_id) REFERENCES cameras(id)
    )
    """)

    # Observations Table (Real tracked objects/persons from actual frames)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL,
        camera_id TEXT NOT NULL,
        zone_name TEXT,
        object_type TEXT NOT NULL, -- 'person', 'vehicle', 'hazmat'
        bounding_box TEXT NOT NULL, -- JSON [x, y, w, h]
        feature_vector TEXT, -- Color histogram / visual signature JSON
        confidence REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Alerts Table (Real alerts triggered by actual AI detections)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL, -- 'PPE_VIOLATION', 'RESTRICTED_ZONE', 'NEAR_MISS', 'PERSONNEL_ANOMALY', 'FIRE_SMOKE', 'SPILL_LEAK', 'FALL_MAN_DOWN', 'PHONE_MISUSE'
        camera_id TEXT NOT NULL,
        camera_name TEXT,
        zone_name TEXT,
        severity TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
        status TEXT DEFAULT 'DETECTED', -- 'DETECTED', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED'
        confidence REAL NOT NULL,
        evidence_image_base64 TEXT,
        metadata_json TEXT, -- JSON details (e.g. missing items, proximity distance, blur score)
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        acknowledged_at TIMESTAMP,
        acknowledged_by TEXT,
        resolved_at TIMESTAMP,
        resolved_by TEXT,
        resolution_notes TEXT
    )
    """)

    # System Health Logs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS health_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id TEXT,
        event_type TEXT, -- 'DISCONNECT', 'NOT_ASSESSABLE', 'MODEL_UNAVAILABLE', 'STREAM_RECOVERY'
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("SQLite Database initialized at", DB_PATH)
