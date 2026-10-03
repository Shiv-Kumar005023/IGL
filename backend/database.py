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

    # Personnel Monitoring Rules Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS personnel_monitoring_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id TEXT NOT NULL,
        camera_name TEXT,
        area_id TEXT DEFAULT 'Main Gate ROI',
        schedule_date TEXT DEFAULT 'ALL', -- YYYY-MM-DD or 'ALL'
        start_time TEXT NOT NULL, -- e.g. '18:00'
        end_time TEXT NOT NULL, -- e.g. '22:00'
        expected_person_count INTEGER NOT NULL DEFAULT 2,
        verification_duration INTEGER NOT NULL DEFAULT 10, -- in seconds
        cooldown INTEGER NOT NULL DEFAULT 60, -- in seconds
        enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Seed initial default monitoring rules if empty
    cursor.execute("SELECT COUNT(*) FROM personnel_monitoring_rules")
    if cursor.fetchone()[0] == 0:
        default_rules = [
            ("Gate Camera 01", "Gate Camera 01", "Main Entry Area", "ALL", "00:00", "23:59", 2, 10, 60, 1)
        ]
        cursor.executemany("""
        INSERT INTO personnel_monitoring_rules 
        (camera_id, camera_name, area_id, schedule_date, start_time, end_time, expected_person_count, verification_duration, cooldown, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, default_rules)
    else:
        # Upgrade any legacy 0 expected_person_count rules to default 2
        cursor.execute("UPDATE personnel_monitoring_rules SET expected_person_count = 2 WHERE expected_person_count = 0")
        conn.commit()

    # Personnel Monitoring Events Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS personnel_monitoring_events (
        id TEXT PRIMARY KEY,
        rule_id INTEGER,
        camera_id TEXT NOT NULL,
        camera_name TEXT,
        area_name TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expected_count INTEGER NOT NULL,
        observed_count INTEGER NOT NULL,
        additional_count INTEGER NOT NULL,
        verification_duration INTEGER NOT NULL,
        status TEXT DEFAULT 'DETECTED', -- 'DETECTED', 'ACKNOWLEDGED', 'RESOLVED'
        evidence_reference TEXT, -- Base64 evidence image
        track_ids TEXT, -- JSON array of observed Track IDs
        acknowledged_at TIMESTAMP,
        acknowledged_by TEXT,
        resolved_at TIMESTAMP,
        resolved_by TEXT
    )
    """)

    # Expected Personnel Rules Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expected_personnel_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_name TEXT NOT NULL,
        zone_name TEXT NOT NULL,
        camera_id TEXT NOT NULL,
        start_time TEXT NOT NULL, -- e.g. '19:00'
        end_time TEXT NOT NULL, -- e.g. '06:00' (supports overnight)
        expected_person_count INTEGER NOT NULL DEFAULT 2,
        verification_duration INTEGER NOT NULL DEFAULT 10, -- in seconds
        cooldown INTEGER NOT NULL DEFAULT 300, -- in seconds (5 minutes)
        controller_whatsapp TEXT DEFAULT '',
        whatsapp_enabled INTEGER DEFAULT 1,
        enabled INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Seed initial default expected personnel rule if empty
    cursor.execute("SELECT COUNT(*) FROM expected_personnel_rules")
    if cursor.fetchone()[0] == 0:
        default_exp_rule = (
            "Overnight Plant Safety Rule",
            "Main Plant Area",
            "Gate Camera 01",
            "19:00",
            "06:00",
            2,
            10,
            300,
            "",
            1,
            1
        )
        cursor.execute("""
        INSERT INTO expected_personnel_rules 
        (rule_name, zone_name, camera_id, start_time, end_time, expected_person_count, verification_duration, cooldown, controller_whatsapp, whatsapp_enabled, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, default_exp_rule)

    # Notification Logs Table (Audit history for WhatsApp/SMS alerts)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notification_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT,
        channel TEXT NOT NULL, -- 'WHATSAPP', 'SMS', 'EMAIL'
        recipient TEXT NOT NULL,
        status TEXT NOT NULL, -- 'SIMULATED', 'SUCCESS', 'FAILED'
        provider_message_id TEXT,
        message_text TEXT,
        error_message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Registered Personnel Table (Permanent identity mapping for live monitoring)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS registered_personnel (
        id TEXT PRIMARY KEY, -- e.g. 'EMP-109' or custom unique ID
        track_id TEXT UNIQUE, -- e.g. 'TRK-P109' or persistent track binding
        name TEXT NOT NULL,
        designation TEXT DEFAULT 'Registered Worker',
        department TEXT DEFAULT 'Operations',
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Seed initial sample registered workers if table is empty
    cursor.execute("SELECT COUNT(*) FROM registered_personnel")
    if cursor.fetchone()[0] == 0:
        default_registered = [
            ("EMP-101", "TRK-P101", "Shiv Kumar", "Senior Field Engineer", "Refinery Operations"),
            ("EMP-102", "TRK-P102", "Rajesh Sharma", "Plant Safety Officer", "HSE Department")
        ]
        cursor.executemany("""
        INSERT INTO registered_personnel (id, track_id, name, designation, department)
        VALUES (?, ?, ?, ?, ?)
        """, default_registered)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("SQLite Database initialized at", DB_PATH)
